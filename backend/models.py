from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum

class RoleEnum(str, Enum):
    admin = "admin"
    teacher = "teacher"
    student = "student"

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: RoleEnum

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None

class StudentProfileUpdate(ProfileUpdate):
    roll_no: Optional[str] = None

class UserInDB(BaseModel):
    id: str
    name: str
    email: EmailStr
    password_hash: str
    role: RoleEnum

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[RoleEnum] = None
    user_id: Optional[str] = None

class StudentProfileCreate(BaseModel):
    roll_no: str
    
class StudentProfileInDB(BaseModel):
    id: str
    user_id: str
    roll_no: str
    class_codes: List[str] = []
    face_embedding: List[float]  # Typically 128-d or 512-d depending on the model

class ClassroomCreate(BaseModel):
    class_name: str
    subject_name: str
    room_no: Optional[str] = None

class ClassroomInDB(BaseModel):
    id: str
    class_code: str  # 6-digit code
    teacher_id: str
    class_name: str = "Legacy Classroom"
    subject_name: str = "Unknown Subject"
    room_no: Optional[str] = None
    student_list: List[str] = [] # List of approved student roll_nos
    pending_students: List[str] = [] # List of student roll_nos awaiting approval

class AttendanceRecord(BaseModel):
    id: str
    class_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    present_students_list: List[str] = [] # List of student roll_nos or IDs
    session_photo_url: str

class AttendanceMarkResponse(BaseModel):
    class_id: str
    total_detected: int
    recognized_students: List[str]
    unrecognized_count: int

class AttendanceSubmission(BaseModel):
    present_roll_nos: List[str]
