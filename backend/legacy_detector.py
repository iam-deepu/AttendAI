"""
legacy_detector.py
------------------
Face detection and recognition utilities using ONNX models directly.
Used as fallback and for mobile-first single-face recognition.
"""

import cv2
import numpy as np
from ai_engine import app, recognizer, norm_crop, detector


def process_enrollment_images(images_bytes_list: list) -> list:
    """
    Given a list of 5 JPEG/PNG image byte-strings (one per angle),
    returns a single normalised 512-d face embedding (list of floats).
    """
    embeddings = []

    for img_bytes in images_bytes_list:
        np_arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            raise ValueError("Failed to decode one or more enrollment images.")

        faces = app.get(img)
        if len(faces) == 0:
            raise ValueError("No face detected in one of the enrollment images.")
        if len(faces) > 1:
            raise ValueError(
                "Multiple faces detected in an enrollment image. "
                "Please ensure only the student is in frame."
            )

        embeddings.append(faces[0].embedding)

    if not embeddings:
        raise ValueError("No embeddings could be generated.")

    avg_embedding = np.mean(embeddings, axis=0)
    norm = np.linalg.norm(avg_embedding)
    if norm == 0:
        return avg_embedding.tolist()

    return (avg_embedding / norm).tolist()


def detect_faces_in_classroom(image_bytes: bytes) -> list:
    """
    Full classroom photo pipeline.
    Detects ALL faces and returns normalised 512-d embeddings.
    """
    np_arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Failed to decode classroom image.")

    faces = app.get(img)

    result = []
    for face in faces:
        embedding = face.embedding
        norm = np.linalg.norm(embedding)
        result.append((embedding / norm).tolist() if norm > 0 else embedding.tolist())

    return result


def get_embedding_from_cropped_face(image_bytes: bytes) -> list:
    """
    Mobile-first helper: accepts a SINGLE cropped face image
    and returns its normalised 512-d embedding.
    """
    np_arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Failed to decode cropped face image.")

    faces = app.get(img)

    if len(faces) == 0:
        raise ValueError("No face detected in the cropped image.")

    # Take the most prominent face (highest detection score)
    best = max(faces, key=lambda f: f.det_score)
    embedding = best.embedding
    norm = np.linalg.norm(embedding)
    return (embedding / norm).tolist() if norm > 0 else embedding.tolist()
