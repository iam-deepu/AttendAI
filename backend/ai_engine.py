"""
ai_engine.py — Face detection + recognition using ONNX models directly.
Uses SCRFD for detection and ArcFace (w600k_r50) for recognition,
loaded via onnxruntime to avoid insightface version compatibility issues.
"""

import cv2
import numpy as np
import onnxruntime as ort
import os
from dataclasses import dataclass
from typing import List, Tuple

# ---------------------------------------------------------------------------
# Data class to mimic insightface Face object
# ---------------------------------------------------------------------------
@dataclass
class Face:
    bbox: np.ndarray
    det_score: float
    embedding: np.ndarray
    kps: np.ndarray = None


# ---------------------------------------------------------------------------
# Alignment helper (norm_crop equivalent)
# ---------------------------------------------------------------------------
ARCFACE_DST = np.array([
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041]
], dtype=np.float32)


def estimate_norm(kps):
    """Estimate similarity transform from 5 landmarks to ArcFace template."""
    from numpy.linalg import lstsq
    dst = ARCFACE_DST
    src = np.array(kps, dtype=np.float32)
    # Compute similarity transform
    tform = cv2.estimateAffinePartial2D(src, dst)[0]
    return tform


def norm_crop(img, kps, image_size=112):
    """Align face using 5-point landmarks."""
    M = estimate_norm(kps)
    warped = cv2.warpAffine(img, M, (image_size, image_size), borderValue=0.0)
    return warped


# ---------------------------------------------------------------------------
# SCRFD Detector
# ---------------------------------------------------------------------------
class SCRFDDetector:
    def __init__(self, model_path):
        self.session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
        self.input_name = self.session.get_inputs()[0].name
        self.input_size = (640, 640)
        self.fmc = 3  # feature map count
        self._feat_stride_fpn = [8, 16, 32]
        self._num_anchors = 2

    def _distance2bbox(self, points, distance):
        x1 = points[:, 0] - distance[:, 0]
        y1 = points[:, 1] - distance[:, 1]
        x2 = points[:, 0] + distance[:, 2]
        y2 = points[:, 1] + distance[:, 3]
        return np.stack([x1, y1, x2, y2], axis=-1)

    def _distance2kps(self, points, distance):
        preds = []
        for i in range(0, distance.shape[1], 2):
            px = points[:, 0] + distance[:, i]
            py = points[:, 1] + distance[:, i + 1]
            preds.append(px)
            preds.append(py)
        return np.stack(preds, axis=-1)

    def detect(self, img, threshold=0.5, max_num=0):
        im_ratio = float(img.shape[0]) / img.shape[1]
        det_size = self.input_size
        if im_ratio > 1.0:
            new_height = det_size[0]
            new_width = int(new_height / im_ratio)
        else:
            new_width = det_size[1]
            new_height = int(new_width * im_ratio)

        det_scale = float(new_height) / img.shape[0]
        resized_img = cv2.resize(img, (new_width, new_height))

        det_img = np.zeros((det_size[0], det_size[1], 3), dtype=np.uint8)
        det_img[:new_height, :new_width, :] = resized_img

        input_blob = cv2.dnn.blobFromImage(det_img, 1.0 / 128, det_size, (127.5, 127.5, 127.5), swapRB=True)

        outputs = self.session.run(None, {self.input_name: input_blob})

        scores_list = []
        bboxes_list = []
        kpss_list = []

        for idx, stride in enumerate(self._feat_stride_fpn):
            scores = outputs[idx]
            bbox_preds = outputs[idx + self.fmc]
            kps_preds = outputs[idx + self.fmc * 2]

            height = det_size[0] // stride
            width = det_size[1] // stride

            anchor_centers = np.stack(np.mgrid[:height, :width][::-1], axis=-1).astype(np.float32)
            anchor_centers = (anchor_centers * stride).reshape((-1, 2))

            if self._num_anchors > 1:
                anchor_centers = np.stack([anchor_centers] * self._num_anchors, axis=1).reshape((-1, 2))

            scores_flat = scores.reshape(-1)
            bbox_preds_flat = bbox_preds.reshape(-1, 4) * stride
            kps_preds_flat = kps_preds.reshape(-1, 10) * stride

            pos_inds = np.where(scores_flat >= threshold)[0]

            if len(pos_inds) > 0:
                bboxes = self._distance2bbox(anchor_centers[pos_inds], bbox_preds_flat[pos_inds])
                kpss = self._distance2kps(anchor_centers[pos_inds], kps_preds_flat[pos_inds])

                scores_list.append(scores_flat[pos_inds])
                bboxes_list.append(bboxes)
                kpss_list.append(kpss)

        if len(scores_list) == 0:
            return np.empty((0, 5)), np.empty((0, 5, 2))

        scores = np.concatenate(scores_list)
        bboxes = np.concatenate(bboxes_list) / det_scale
        kpss = np.concatenate(kpss_list).reshape(-1, 5, 2) / det_scale

        # NMS
        pre_det = np.hstack((bboxes, scores[:, None]))
        keep = self._nms(pre_det, 0.4)
        det = pre_det[keep]
        kpss = kpss[keep]

        if max_num > 0 and det.shape[0] > max_num:
            area = (det[:, 2] - det[:, 0]) * (det[:, 3] - det[:, 1])
            order = area.argsort()[::-1][:max_num]
            det = det[order]
            kpss = kpss[order]

        return det, kpss

    def _nms(self, dets, thresh):
        x1, y1, x2, y2, scores = dets[:, 0], dets[:, 1], dets[:, 2], dets[:, 3], dets[:, 4]
        areas = (x2 - x1) * (y2 - y1)
        order = scores.argsort()[::-1]
        keep = []
        while order.size > 0:
            i = order[0]
            keep.append(i)
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])
            w = np.maximum(0.0, xx2 - xx1)
            h = np.maximum(0.0, yy2 - yy1)
            inter = w * h
            ovr = inter / (areas[i] + areas[order[1:]] - inter)
            inds = np.where(ovr <= thresh)[0]
            order = order[inds + 1]
        return keep


# ---------------------------------------------------------------------------
# ArcFace Recognizer
# ---------------------------------------------------------------------------
class ArcFaceRecognizer:
    def __init__(self, model_path):
        self.session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
        self.input_name = self.session.get_inputs()[0].name
        self.input_size = (112, 112)

    def get_embedding(self, aligned_face):
        """Get 512-d embedding from an aligned 112x112 face."""
        img = cv2.resize(aligned_face, self.input_size)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img = np.transpose(img, (2, 0, 1)).astype(np.float32)
        img = (img - 127.5) / 127.5
        img = np.expand_dims(img, axis=0)

        embedding = self.session.run(None, {self.input_name: img})[0][0]
        return embedding


# ---------------------------------------------------------------------------
# Combined Face Analysis (replaces insightface.app.FaceAnalysis)
# ---------------------------------------------------------------------------
MODEL_DIR = os.path.expanduser("~/.insightface/models/buffalo_l")

print("[ai_engine] Loading SCRFD detector...")
detector = SCRFDDetector(os.path.join(MODEL_DIR, "det_10g.onnx"))
print("[ai_engine] Loading ArcFace recognizer...")
recognizer = ArcFaceRecognizer(os.path.join(MODEL_DIR, "w600k_r50.onnx"))
print("[ai_engine] Models loaded successfully.")


class _FaceApp:
    """Drop-in replacement for insightface FaceAnalysis.get()"""
    def get(self, img, max_num=0, threshold=0.3):
        dets, kpss = detector.detect(img, threshold=threshold, max_num=max_num)
        faces = []
        for i in range(dets.shape[0]):
            bbox = dets[i, :4]
            score = dets[i, 4]
            kps = kpss[i]

            aligned = norm_crop(img, kps)
            embedding = recognizer.get_embedding(aligned)

            faces.append(Face(
                bbox=bbox,
                det_score=float(score),
                embedding=embedding,
                kps=kps
            ))
        return faces


# Public interface — same as original code
app = _FaceApp()


def process_enrollment_images(images_bytes_list: list) -> list:
    """
    Processes a list of 5 face images for a student and returns the average face embedding.
    Uses a lower detection threshold and picks the best (largest) face if multiple are detected.
    """
    embeddings = []

    for i, img_bytes in enumerate(images_bytes_list):
        np_arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            raise ValueError(f"Failed to decode image {i+1}.")

        # Try with lower threshold first for better recall
        faces = app.get(img, threshold=0.3)

        # If still no face detected, try even lower
        if len(faces) == 0:
            faces = app.get(img, threshold=0.15)

        if len(faces) == 0:
            raise ValueError(
                f"No face detected in image {i+1}. Please ensure your face is clearly visible, "
                "well-lit, and looking at the camera."
            )

        # If multiple faces, pick the largest one (most likely the subject)
        if len(faces) > 1:
            faces = sorted(
                faces,
                key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
                reverse=True
            )

        best_face = faces[0]
        bbox = best_face.bbox
        face_width = bbox[2] - bbox[0]

        # Relaxed minimum size — 60px is sufficient for a clear selfie
        if face_width < 60:
            raise ValueError(
                f"Face in image {i+1} is too small ({int(face_width)}px wide). "
                "Please move closer to the camera."
            )

        embeddings.append(best_face.embedding)

    if not embeddings:
        raise ValueError("No embeddings could be generated.")

    avg_embedding = np.mean(embeddings, axis=0)
    norm = np.linalg.norm(avg_embedding)
    if norm == 0:
        return avg_embedding.tolist()

    return (avg_embedding / norm).tolist()


def detect_faces_in_classroom(image_bytes: bytes) -> list:
    """
    Takes a classroom photo, detects all faces, and returns their normalized embeddings.
    """
    np_arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Failed to decode classroom image.")

    faces = app.get(img)

    detected_embeddings = []
    for face in faces:
        embedding = face.embedding
        norm = np.linalg.norm(embedding)
        if norm > 0:
            detected_embeddings.append((embedding / norm).tolist())
        else:
            detected_embeddings.append(embedding.tolist())

    return detected_embeddings
