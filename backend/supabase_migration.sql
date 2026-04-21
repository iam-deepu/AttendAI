-- ============================================
-- AttendAI: Supabase Migration Script
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================

-- 1. Enable pgvector extension for face embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Students table (with vector embedding for face recognition)
CREATE TABLE IF NOT EXISTS students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    roll_no TEXT NOT NULL DEFAULT '',
    class_codes TEXT[] DEFAULT '{}',
    face_embedding vector(512),
    reference_photo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Classrooms table
CREATE TABLE IF NOT EXISTS classrooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_code TEXT UNIQUE NOT NULL,
    teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    room_no TEXT,
    student_list TEXT[] DEFAULT '{}',
    pending_students TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Attendance table
CREATE TABLE IF NOT EXISTS attendance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    present_students_list TEXT[] DEFAULT '{}',
    session_photo_url TEXT
);

-- 6. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_roll_no ON students(roll_no);
CREATE INDEX IF NOT EXISTS idx_classrooms_class_code ON classrooms(class_code);
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher_id ON classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_class_id ON attendance(class_id);

-- 7. Create a function for vector similarity search (cosine similarity)
CREATE OR REPLACE FUNCTION match_students(
    query_embedding vector(512),
    match_class_code TEXT,
    match_threshold FLOAT DEFAULT 0.30,
    match_count INT DEFAULT 1
)
RETURNS TABLE (
    id UUID,
    roll_no TEXT,
    user_id UUID,
    score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.roll_no,
        s.user_id,
        (1 - (s.face_embedding <=> query_embedding))::FLOAT AS score
    FROM students s
    WHERE match_class_code = ANY(s.class_codes)
      AND s.face_embedding IS NOT NULL
    ORDER BY s.face_embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 8. Disable RLS for now (enable later for production security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON classrooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON attendance FOR ALL USING (true) WITH CHECK (true);
