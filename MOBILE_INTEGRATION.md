# Mobile Integration Guide — AttendAI + Google ML Kit

This document explains how to integrate Google ML Kit's Face Detection on
Android (or iOS via Vision framework) with the AttendAI FastAPI backend to
build a **live, real-time attendance scanner** with a green square overlay.

---

## Architecture Overview

```
┌───────────────────────────────┐          ┌─────────────────────────────┐
│   Android / iOS App           │          │   AttendAI FastAPI Backend  │
│  ─────────────────────────    │  HTTPS   │  ──────────────────────── │
│  Camera (CameraX / AVFoundation)         │                             │
│       │                       │  ──────► │  POST /recognize-face-stream│
│  ML Kit FaceDetector          │          │    - Crops face via ArcFace │
│    detects BoundingBox(es)    │          │    - Queries MongoDB vectors │
│       │                       │  ◄────── │    - Returns name/confidence│
│  Crop frame at BoundingBox    │          │                             │
│  Draw green/red overlay rect  │          └─────────────────────────────│
└───────────────────────────────┘
```

---

## Step 1 — Android Setup

### dependencies (app/build.gradle)
```gradle
implementation 'com.google.mlkit:face-detection:16.1.5'
implementation 'com.squareup.okhttp3:okhttp:4.12.0'
implementation 'com.squareup.okhttp3:okhttp-multipart:4.12.0' // bundled
```

### ML Kit face detection options
```kotlin
val options = FaceDetectorOptions.Builder()
    .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
    .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
    .setMinFaceSize(0.10f)      // detect faces ≥ 10 % of frame height
    .build()

val detector = FaceDetection.getClient(options)
```

---

## Step 2 — Crop BoundingBox from Camera Frame

```kotlin
// Inside your ImageAnalysis.Analyzer
override fun analyze(imageProxy: ImageProxy) {
    val bitmap = imageProxy.toBitmap()   // helper extension
    val inputImage = InputImage.fromBitmap(bitmap, 0)

    detector.process(inputImage)
        .addOnSuccessListener { faces ->
            for (face in faces) {
                val box: Rect = face.boundingBox

                // Expand bounding box by 20 % to include forehead / chin
                val padX = (box.width()  * 0.20).toInt()
                val padY = (box.height() * 0.20).toInt()
                val safeBounds = Rect(
                    maxOf(0, box.left   - padX),
                    maxOf(0, box.top    - padY),
                    minOf(bitmap.width,  box.right  + padX),
                    minOf(bitmap.height, box.bottom + padY)
                )

                val cropBitmap = Bitmap.createBitmap(
                    bitmap,
                    safeBounds.left, safeBounds.top,
                    safeBounds.width(), safeBounds.height()
                )

                // Send to backend (see Step 3)
                sendFaceToBackend(cropBitmap, classCode = "CS2024A")
            }
        }
        .addOnCompleteListener { imageProxy.close() }
}
```

---

## Step 3 — Send Cropped Face to `/recognize-face-stream`

```kotlin
fun sendFaceToBackend(faceBitmap: Bitmap, classCode: String) {
    val stream = ByteArrayOutputStream()
    faceBitmap.compress(Bitmap.CompressFormat.JPEG, 85, stream)
    val bytes = stream.toByteArray()

    val body = MultipartBody.Builder()
        .setType(MultipartBody.FORM)
        .addFormDataPart("class_code", classCode)
        .addFormDataPart(
            "file", "face.jpg",
            bytes.toRequestBody("image/jpeg".toMediaType())
        )
        .build()

    val request = Request.Builder()
        .url("https://YOUR_SERVER/recognize-face-stream")
        .header("Authorization", "Bearer $jwtToken")
        .post(body)
        .build()

    OkHttpClient().newCall(request).enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) {
            val json = JSONObject(response.body!!.string())
            val matched  = json.getBoolean("match")
            val name     = json.optString("name", "Unknown")
            val rollNo   = json.optString("roll_no", "")
            val confidence = json.getDouble("confidence")

            // Update UI on main thread
            runOnUiThread {
                drawOverlay(matched, name, confidence)
            }
        }
        override fun onFailure(call: Call, e: IOException) {
            Log.e("AttendAI", "Recognition failed: ${e.message}")
        }
    })
}
```

---

## Step 4 — Draw Green / Red Square Overlay

```kotlin
/**
 * OverlayView draws bounding boxes and labels on a Canvas placed over the camera preview.
 */
class OverlayView(context: Context, attrs: AttributeSet?) : View(context, attrs) {

    data class Detection(val rect: RectF, val matched: Boolean, val label: String)
    private val detections = mutableListOf<Detection>()

    private val paintGreen = Paint().apply {
        color = Color.parseColor("#00C853")   // Material Green A700
        style = Paint.Style.STROKE
        strokeWidth = 6f
    }
    private val paintRed = Paint().apply {
        color = Color.parseColor("#D50000")   // Material Red A700
        style = Paint.Style.STROKE
        strokeWidth = 6f
    }
    private val textPaint = Paint().apply {
        color = Color.WHITE
        textSize = 40f
        typeface = Typeface.DEFAULT_BOLD
    }

    fun update(newDetections: List<Detection>) {
        detections.clear()
        detections.addAll(newDetections)
        invalidate()   // triggers onDraw
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        for (d in detections) {
            val paint = if (d.matched) paintGreen else paintRed
            canvas.drawRoundRect(d.rect, 16f, 16f, paint)
            canvas.drawText(d.label, d.rect.left + 8f, d.rect.top - 12f, textPaint)
        }
    }
}
```

---

## API Reference — `/recognize-face-stream`

| Field | Type | Description |
|---|---|---|
| `class_code` | `string` (form) | The classroom code to search in |
| `file` | `file` (form, optional) | JPEG/PNG cropped face from ML Kit BoundingBox |
| `embedding` | `string` (form, optional) | Comma-separated 512-d floats (TFLite on-device path) |

**Auth:** Bearer JWT in `Authorization` header (same token as the web app).

### Response
```json
{
  "match": true,
  "name": "Deepu Kumar",
  "roll_no": "CS2024001",
  "confidence": 0.8341,
  "class_code": "CS2024A"
}
```

| Field | Description |
|---|---|
| `match` | `true` if similarity ≥ 0.45 |
| `name` | Student's registered name, or `null` |
| `roll_no` | Roll number used to mark attendance |
| `confidence` | Cosine similarity score (0–1) |

---

## Threshold Guide

| Threshold | Behaviour |
|---|---|
| `0.60` | Very strict — great lighting, controlled environment only |
| `0.45` | **Default for mobile** — handles classroom lighting variation well |
| `0.35` | Permissive — use only if 0.45 still misses you; higher false-positive risk |

---

## Notes

- **Rate-limit your calls.** Process one frame every **500 ms** maximum to keep server load manageable.
- **Face crop quality matters.** Ensure at least **80×80 px** in the crop; smaller crops degrade ArcFace accuracy significantly.
- If using a TFLite model on-device, send the `embedding` field instead of `file` to reduce server load. The ArcFace MobileFaceNet TFLite model is recommended.
