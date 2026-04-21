from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from datetime import datetime, timedelta
import jwt
import os
import secrets
from typing import List, Optional
import io
import pandas as pd
from fastapi.responses import Response
import random
import string
import numpy as np

from models import (
    UserCreate, UserInDB, RoleEnum, Token, TokenData,
    StudentProfileCreate, ClassroomCreate, ClassroomInDB,
    AttendanceMarkResponse, AttendanceRecord, ProfileUpdate, StudentProfileUpdate,
    AttendanceSubmission
)
import database
import ai_engine
import legacy_detector

import traceback
from fastapi.responses import JSONResponse
from starlette.requests import Request

app = FastAPI(title="AttendAI API", description="AI Powered Classroom Attendance System")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"UNHANDLED ERROR: {exc}\n{tb}")
    return JSONResponse(status_code=500, content={"detail": str(exc)})

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication Settings
SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey_dev_only")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- AUTH UTILS ---
def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role")
        user_id: str = payload.get("user_id")
        if email is None or role is None or user_id is None:
            raise credentials_exception
        token_data = TokenData(email=email, role=RoleEnum(role), user_id=user_id)
    except jwt.PyJWTError:
        raise credentials_exception

    user = await database.get_user_by_email(email=token_data.email)
    if user is None:
        raise credentials_exception
    return user

async def get_current_admin(current_user=Depends(get_current_user)):
    if current_user["role"] != RoleEnum.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def get_current_teacher(current_user=Depends(get_current_user)):
    if current_user["role"] != RoleEnum.teacher:
        raise HTTPException(status_code=403, detail="Teacher access required")
    return current_user

async def get_current_student(current_user=Depends(get_current_user)):
    if current_user["role"] != RoleEnum.student:
        raise HTTPException(status_code=403, detail="Student access required")
    return current_user

# --- ROUTES ---

@app.post("/signup", response_model=Token)
async def signup(user: UserCreate):
    db_user = await database.get_user_by_email(user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = get_password_hash(user.password)

    user_data = {
        "name": user.name,
        "email": user.email,
        "password_hash": hashed_password,
        "role": user.role.value
    }

    result = database.supabase.table("users").insert(user_data).execute()
    new_user = result.data[0]

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role.value, "user_id": str(new_user["id"])},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await database.get_user_by_email(form_data.username)
    if not user or not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"], "role": user["role"], "user_id": user["id"]},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me")
async def read_users_me(current_user=Depends(get_current_user)):
    return {"email": current_user["email"], "role": current_user["role"], "name": current_user["name"]}

# --- SHARED PROFILE UPDATE ---
@app.put("/profile/auth")
async def update_auth_profile(update_data: ProfileUpdate, current_user=Depends(get_current_user)):
    user_id = current_user["id"]
    update_dict = {}
    if update_data.name:
        update_dict["name"] = update_data.name
    if update_data.email:
        if update_data.email != current_user["email"]:
            existing = await database.get_user_by_email(update_data.email)
            if existing:
                raise HTTPException(status_code=400, detail="Email already taken")
            update_dict["email"] = update_data.email
    if update_data.password:
        update_dict["password_hash"] = pwd_context.hash(update_data.password)

    if update_dict:
        database.supabase.table("users").update(update_dict).eq("id", user_id).execute()

    return {"message": "Profile updated successfully"}


# --- STUDENT ENDPOINTS ---
@app.post("/student/enroll")
async def enroll_student(
    roll_no: str = Form(...),
    files: List[UploadFile] = File(...),
    current_user=Depends(get_current_student)
):
    if len(files) != 5:
         raise HTTPException(status_code=400, detail="Exactly 5 images from different angles are required for enrollment.")

    existing_student = await database.get_student_by_user_id(current_user["id"])

    image_bytes_list = [await file.read() for file in files]

    import base64
    reference_photo = base64.b64encode(image_bytes_list[0]).decode('utf-8')

    try:
        normalized_embedding = ai_engine.process_enrollment_images(image_bytes_list)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if existing_student:
        database.supabase.table("students").update({
            "roll_no": roll_no,
            "face_embedding": normalized_embedding,
            "reference_photo": reference_photo
        }).eq("id", existing_student["id"]).execute()
    else:
        database.supabase.table("students").insert({
            "user_id": current_user["id"],
            "roll_no": roll_no,
            "class_codes": [],
            "face_embedding": normalized_embedding,
            "reference_photo": reference_photo
        }).execute()

    return {"message": "Enrollment successful"}

@app.get("/student/profile")
async def get_student_profile_status(current_user=Depends(get_current_student)):
    student = await database.get_student_by_user_id(current_user["id"])
    if not student:
        return {
            "is_enrolled": False,
            "name": current_user["name"],
            "email": current_user["email"]
        }

    return {
        "is_enrolled": True,
        "name": current_user["name"],
        "email": current_user["email"],
        "roll_no": student["roll_no"],
        "reference_photo": student.get("reference_photo")
    }

@app.put("/student/profile")
async def update_student_profile(update_data: StudentProfileUpdate, current_user=Depends(get_current_student)):
    user_id = current_user["id"]
    user_update = {}
    if update_data.name:
        user_update["name"] = update_data.name
    if update_data.email:
        if update_data.email != current_user["email"]:
            existing = await database.get_user_by_email(update_data.email)
            if existing:
                raise HTTPException(status_code=400, detail="Email already taken")
            user_update["email"] = update_data.email
    if update_data.password:
        user_update["password_hash"] = pwd_context.hash(update_data.password)

    if user_update:
        database.supabase.table("users").update(user_update).eq("id", user_id).execute()

    if update_data.roll_no:
        existing_student = await database.get_student_by_user_id(user_id)
        if existing_student:
            database.supabase.table("students").update({
                "roll_no": update_data.roll_no
            }).eq("id", existing_student["id"]).execute()
        else:
            database.supabase.table("students").insert({
                "user_id": user_id,
                "roll_no": update_data.roll_no,
                "class_codes": [],
                "face_embedding": None,
                "reference_photo": None
            }).execute()

    return {"message": "Profile updated"}

@app.get("/student/classrooms")
async def list_student_classrooms(current_user=Depends(get_current_student)):
    student = await database.get_student_by_user_id(current_user["id"])
    if not student:
        return []

    roll_no = student["roll_no"]

    # Get all classrooms where student is approved or pending
    all_classrooms = database.supabase.table("classrooms").select("*").execute()

    result = []
    for doc in all_classrooms.data:
        is_approved = roll_no in (doc.get("student_list") or [])
        is_pending = roll_no in (doc.get("pending_students") or [])
        if is_approved or is_pending:
            status_val = "approved" if is_approved else "pending"
            result.append({
                "class_code": doc["class_code"],
                "class_name": doc["class_name"],
                "subject_name": doc["subject_name"],
                "status": status_val,
                "teacher_id": str(doc["teacher_id"])
            })

    return result

@app.delete("/student/leave_class/{class_code}")
async def leave_classroom(class_code: str, current_user=Depends(get_current_student)):
    student = await database.get_student_by_user_id(current_user["id"])
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    classroom = await database.get_classroom_by_code(class_code)
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")

    # Remove from classroom's student_list and pending_students
    new_student_list = [s for s in (classroom.get("student_list") or []) if s != student["roll_no"]]
    new_pending = [s for s in (classroom.get("pending_students") or []) if s != student["roll_no"]]

    database.supabase.table("classrooms").update({
        "student_list": new_student_list,
        "pending_students": new_pending
    }).eq("id", classroom["id"]).execute()

    # Remove from student's class_codes
    new_codes = [c for c in (student.get("class_codes") or []) if c != class_code]
    database.supabase.table("students").update({
        "class_codes": new_codes
    }).eq("id", student["id"]).execute()

    return {"message": "Left classroom"}

@app.get("/teacher/student_profile/{roll_no}")
async def get_student_profile(roll_no: str, current_user=Depends(get_current_teacher)):
    result = database.supabase.table("students").select("*").eq("roll_no", roll_no).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Student not found")

    student = result.data[0]
    user_result = database.supabase.table("users").select("*").eq("id", student["user_id"]).execute()
    user = user_result.data[0] if user_result.data else None

    return {
        "roll_no": student["roll_no"],
        "name": user["name"] if user else "Unknown",
        "email": user["email"] if user else "N/A",
        "reference_photo": student.get("reference_photo")
    }


# --- TEACHER ENDPOINTS ---
@app.post("/teacher/classrooms", response_model=ClassroomInDB)
async def create_classroom(classroom: ClassroomCreate, current_user=Depends(get_current_teacher)):
    class_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

    classroom_data = {
        "class_code": class_code,
        "teacher_id": current_user["id"],
        "class_name": classroom.class_name,
        "subject_name": classroom.subject_name,
        "room_no": classroom.room_no,
        "student_list": [],
        "pending_students": []
    }

    result = database.supabase.table("classrooms").insert(classroom_data).execute()
    return database.helper(result.data[0])

@app.post("/student/join_class/{class_code}")
async def join_classroom(class_code: str, current_user=Depends(get_current_student)):
    classroom = await database.get_classroom_by_code(class_code)
    if not classroom:
         raise HTTPException(status_code=404, detail="Classroom not found")

    student = await database.get_student_by_user_id(current_user["id"])
    if not student:
        result = database.supabase.table("students").insert({
            "user_id": current_user["id"],
            "roll_no": "",
            "class_codes": [],
            "face_embedding": None,
            "reference_photo": None
        }).execute()
        student = database.helper(result.data[0])

    if class_code in (student.get("class_codes") or []):
         return {"message": "Already joined"}

    # Update student's class_codes
    new_codes = (student.get("class_codes") or []) + [class_code]
    database.supabase.table("students").update({
        "class_codes": new_codes
    }).eq("id", student["id"]).execute()

    # Add student to classroom pending roster
    roll_no = student.get("roll_no") or current_user["id"]
    new_pending = (classroom.get("pending_students") or []) + [roll_no]
    # Deduplicate
    new_pending = list(set(new_pending))
    database.supabase.table("classrooms").update({
        "pending_students": new_pending
    }).eq("id", classroom["id"]).execute()

    return {"message": "Successfully requested to join classroom. Awaiting teacher approval."}

@app.get("/teacher/classrooms", response_model=List[ClassroomInDB])
async def list_teacher_classrooms(current_user=Depends(get_current_teacher)):
    result = database.supabase.table("classrooms").select("*").eq("teacher_id", current_user["id"]).execute()
    return [database.helper(doc) for doc in result.data]

@app.put("/teacher/classrooms/{class_code}", response_model=ClassroomInDB)
async def update_classroom(class_code: str, classroom: ClassroomCreate, current_user=Depends(get_current_teacher)):
    existing = await database.get_classroom_by_code(class_code)
    if not existing or existing["teacher_id"] != current_user["id"]:
         raise HTTPException(status_code=404, detail="Classroom not found or unauthorized")

    database.supabase.table("classrooms").update({
        "class_name": classroom.class_name,
        "subject_name": classroom.subject_name,
        "room_no": classroom.room_no
    }).eq("id", existing["id"]).execute()

    updated = await database.get_classroom_by_code(class_code)
    return updated

@app.delete("/teacher/classrooms/{class_code}")
async def delete_classroom(class_code: str, current_user=Depends(get_current_teacher)):
    existing = await database.get_classroom_by_code(class_code)
    if not existing or existing["teacher_id"] != current_user["id"]:
         raise HTTPException(status_code=404, detail="Classroom not found or unauthorized")

    database.supabase.table("classrooms").delete().eq("id", existing["id"]).execute()
    return {"message": "Classroom deleted"}

@app.get("/teacher/classrooms/{class_code}/roster")
async def get_classroom_roster(class_code: str, current_user=Depends(get_current_teacher)):
    classroom = await database.get_classroom_by_code(class_code)
    if not classroom or classroom["teacher_id"] != current_user["id"]:
         raise HTTPException(status_code=404, detail="Classroom not found or unauthorized")

    # Count total attendance sessions
    att_result = database.supabase.table("attendance").select("id", count="exact").eq("class_id", classroom["id"]).execute()
    total_sessions = att_result.count or 0

    approved_details = []
    pending_details = []

    # Approved students
    for roll_no in (classroom.get("student_list") or []):
        student_result = database.supabase.table("students").select("*").eq("roll_no", roll_no).execute()
        if not student_result.data:
            continue
        student = student_result.data[0]
        user_result = database.supabase.table("users").select("*").eq("id", student["user_id"]).execute()
        user = user_result.data[0] if user_result.data else None

        # Count attended sessions
        attended = 0
        if total_sessions > 0:
            att_records = database.supabase.table("attendance").select("present_students_list").eq("class_id", classroom["id"]).execute()
            for rec in att_records.data:
                if roll_no in (rec.get("present_students_list") or []):
                    attended += 1

        percentage = (attended / total_sessions * 100) if total_sessions > 0 else 0
        approved_details.append({
            "roll_no": roll_no,
            "name": user["name"] if user else "Unknown",
            "attendance_percentage": round(percentage, 2)
        })

    # Pending students
    for roll_no in (classroom.get("pending_students") or []):
        student_result = database.supabase.table("students").select("*").eq("roll_no", roll_no).execute()
        if not student_result.data:
            continue
        student = student_result.data[0]
        user_result = database.supabase.table("users").select("*").eq("id", student["user_id"]).execute()
        user = user_result.data[0] if user_result.data else None
        pending_details.append({
            "roll_no": roll_no,
            "name": user["name"] if user else "Unknown",
        })

    return {
        "approved": approved_details,
        "pending": pending_details
    }

@app.post("/teacher/classrooms/{class_code}/approve/{roll_no}")
async def approve_student(class_code: str, roll_no: str, current_user=Depends(get_current_teacher)):
    classroom = await database.get_classroom_by_code(class_code)
    if not classroom or classroom["teacher_id"] != current_user["id"]:
         raise HTTPException(status_code=404, detail="Classroom not found or unauthorized")

    if roll_no not in (classroom.get("pending_students") or []):
         raise HTTPException(status_code=404, detail="Student not found in pending list")

    new_pending = [s for s in classroom["pending_students"] if s != roll_no]
    new_approved = (classroom.get("student_list") or []) + [roll_no]

    database.supabase.table("classrooms").update({
        "pending_students": new_pending,
        "student_list": new_approved
    }).eq("id", classroom["id"]).execute()

    return {"message": f"Student {roll_no} approved"}

@app.post("/teacher/attendance/{class_code}", response_model=AttendanceMarkResponse)
async def mark_attendance(
    class_code: str,
    files: List[UploadFile] = File(...),
    current_user=Depends(get_current_teacher)
):
    classroom = await database.get_classroom_by_code(class_code)
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")

    if classroom["teacher_id"] != current_user["id"]:
         raise HTTPException(status_code=403, detail="Not authorized to mark attendance for this classroom")

    all_detected_embeddings = []

    for file in files:
        image_bytes = await file.read()
        try:
            detected = ai_engine.detect_faces_in_classroom(image_bytes)
            all_detected_embeddings.extend(detected)
        except Exception as e:
            print(f"Skipping an image due to error: {e}")
            continue

    # --- CLUSTERING AND DEDUPLICATION ---
    clusters = []
    CLUSTERING_THRESHOLD = 0.70

    for emb in all_detected_embeddings:
        query_vec = np.array(emb)
        norm = np.linalg.norm(query_vec)
        if norm > 0:
            query_vec = query_vec / norm

        found_cluster = False
        for cluster in clusters:
            rep_vec = np.array(cluster[0])
            similarity = np.dot(query_vec, rep_vec)
            if similarity > CLUSTERING_THRESHOLD:
                cluster.append(emb)
                found_cluster = True
                break
        if not found_cluster:
            clusters.append([emb])

    recognized_students_best_score = {}
    unrecognized_count = 0
    total_unique_people = len(clusters)

    for cluster in clusters:
        cluster_avg = np.mean(cluster, axis=0).tolist()

        matches = await database.vector_search_student(
            query_vector=cluster_avg,
            class_code=class_code,
            limit=1,
            similarity_threshold=0.30
        )

        if matches:
            best_match = matches[0]
            r_no = best_match["roll_no"]
            score = float(best_match.get("score", 0.0))

            if r_no not in recognized_students_best_score or score > recognized_students_best_score[r_no]:
                recognized_students_best_score[r_no] = score
        else:
            unrecognized_count += 1

    recognized_list = list(recognized_students_best_score.keys())

    return AttendanceMarkResponse(
        class_id=classroom["id"],
        total_detected=total_unique_people,
        recognized_students=recognized_list,
        unrecognized_count=unrecognized_count
    )

@app.post("/teacher/attendance/{class_code}/submit")
async def submit_attendance(
    class_code: str,
    submission: AttendanceSubmission,
    current_user=Depends(get_current_teacher)
):
    classroom = await database.get_classroom_by_code(class_code)
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")

    if classroom["teacher_id"] != current_user["id"]:
         raise HTTPException(status_code=403, detail="Not authorized")

    attendance_record = {
        "class_id": classroom["id"],
        "present_students_list": submission.present_roll_nos,
        "session_photo_url": f"local_storage/{class_code}_{secrets.token_hex(4)}_final"
    }

    database.supabase.table("attendance").insert(attendance_record).execute()
    return {"message": "Attendance finalized", "record_count": len(submission.present_roll_nos)}

@app.get("/teacher/attendance/{class_code}/export")
async def export_attendance(class_code: str, token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") != RoleEnum.teacher.value:
            raise HTTPException(status_code=403, detail="Teacher access required")
        teacher_id = payload.get("user_id")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    classroom = await database.get_classroom_by_code(class_code)
    if not classroom:
         raise HTTPException(status_code=404, detail="Classroom not found")

    if classroom["teacher_id"] != teacher_id:
         raise HTTPException(status_code=403, detail="Not authorized")

    # Query ALL attendance for this class
    att_result = database.supabase.table("attendance").select("*").eq("class_id", classroom["id"]).order("timestamp").execute()
    records = att_result.data

    # Group present students by date
    attendance_by_date = {}
    for rec in records:
        date_str = rec["timestamp"][:10]  # YYYY-MM-DD from ISO string
        if date_str not in attendance_by_date:
            attendance_by_date[date_str] = set()
        attendance_by_date[date_str].update(rec.get("present_students_list") or [])

    df_data = []
    sorted_dates = sorted(list(attendance_by_date.keys()))

    for roll_no in (classroom.get("student_list") or []):
        student_result = database.supabase.table("students").select("*").eq("roll_no", roll_no).execute()
        name = "Unknown"
        if student_result.data:
            student_doc = student_result.data[0]
            user_result = database.supabase.table("users").select("name").eq("id", student_doc["user_id"]).execute()
            if user_result.data:
                name = user_result.data[0].get("name", "Unknown")

        row_data = {"Roll No": roll_no, "Name": name}
        for date_str in sorted_dates:
            row_data[date_str] = "Present" if roll_no in attendance_by_date[date_str] else "Absent"

        df_data.append(row_data)

    df = pd.DataFrame(df_data)
    if df.empty:
        df = pd.DataFrame(columns=["Roll No", "Name"])

    output = io.BytesIO()
    writer = pd.ExcelWriter(output, engine='openpyxl')
    df.to_excel(writer, index=False, sheet_name='Attendance Matrix')
    writer.close()
    output.seek(0)

    now = datetime.utcnow()
    headers = {
        'Content-Disposition': f'attachment; filename="attendance_{class_code}_{now.strftime("%Y%m%d")}.xlsx"'
    }

    return Response(output.read(), headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


# --- LIVE DETECTION ---
@app.post("/teacher/detect-faces/{class_code}")
async def detect_faces(
    class_code: str,
    file: UploadFile = File(...),
    current_user=Depends(get_current_teacher)
):
    image_bytes = await file.read()

    import cv2

    np_arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img is None:
        return {"faces": []}

    faces_raw = ai_engine.app.get(img)

    results = []
    for face in faces_raw:
        box = face.bbox.astype(int).tolist()
        embedding = face.embedding
        norm = np.linalg.norm(embedding)
        norm_emb = (embedding / norm).tolist() if norm > 0 else embedding.tolist()

        matches = await database.vector_search_student(
            query_vector=norm_emb,
            class_code=class_code,
            limit=1,
            similarity_threshold=0.0
        )

        name = "Unknown"
        roll_no = None
        confidence = 0.0
        matched = False

        if matches:
            best = matches[0]
            confidence = round(float(best.get("score", 0.0)), 3)

            student_result = database.supabase.table("students").select("*").eq("roll_no", best["roll_no"]).execute()
            if student_result.data:
                student_doc = student_result.data[0]
                user_result = database.supabase.table("users").select("*").eq("id", student_doc["user_id"]).execute()
                if user_result.data:
                    name = user_result.data[0].get("name", "Unknown")
                    roll_no = best["roll_no"]

            if confidence >= 0.30:
                matched = True

        results.append({
            "box": box,
            "name": name,
            "roll_no": roll_no,
            "confidence": confidence,
            "matched": matched
        })

    return {"faces": results, "img_width": img.shape[1], "img_height": img.shape[0]}


@app.post("/recognize-face-stream")
async def recognize_face_stream(
    class_code: str = Form(...),
    file: UploadFile = File(None),
    embedding: str = Form(None),
    current_user=Depends(get_current_user)
):
    MOBILE_THRESHOLD = 0.30

    query_vector = None

    if embedding:
        try:
            query_vector = [float(x) for x in embedding.split(",")]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid embedding format. Expected comma-separated floats.")

    elif file:
        image_bytes = await file.read()
        try:
            query_vector = legacy_detector.get_embedding_from_cropped_face(image_bytes)
        except ValueError as e:
            return {
                "match": False,
                "name": None,
                "roll_no": None,
                "confidence": 0.0,
                "class_code": class_code,
                "detail": str(e)
            }
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either 'file' (cropped face image) or 'embedding' (comma-separated floats)."
        )

    matches = await database.vector_search_student(
        query_vector=query_vector,
        class_code=class_code,
        limit=1,
        similarity_threshold=MOBILE_THRESHOLD
    )

    if not matches:
        return {
            "match": False,
            "name": None,
            "roll_no": None,
            "confidence": 0.0,
            "class_code": class_code
        }

    best = matches[0]
    roll_no = best["roll_no"]
    confidence = round(float(best.get("score", 0.0)), 4)

    student_result = database.supabase.table("students").select("*").eq("roll_no", roll_no).execute()
    name = "Unknown"
    if student_result.data:
        user_result = database.supabase.table("users").select("*").eq("id", student_result.data[0]["user_id"]).execute()
        if user_result.data:
            name = user_result.data[0].get("name", "Unknown")

    return {
        "match": True,
        "name": name,
        "roll_no": roll_no,
        "confidence": confidence,
        "class_code": class_code
    }

@app.get("/")
def read_root():
    return {"message": "Welcome to AttendAI Backend. Health OK."}
