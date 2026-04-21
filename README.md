---
title: AttendAI Backend
emoji: 🚀
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---

# 🎓 AttendAI: AI-Powered Smart Attendance System

AttendAI is a modern, mobile-responsive full-stack application that completely automates classroom attendance. By leveraging cutting-edge deep learning facial recognition built right into the browser and backend, teachers can seamlessly identify students via a live video stream, eliminating the need for roll calls.

---

## 🏗 Project Architecture & Structure

AttendAI follows a standard **Monorepo** structure, cleanly separating the frontend user interface and the AI-powered backend processor.

- **`/frontend/`**: The modern React web application. Deployed seamlessly to **Vercel**.
- **`/backend/`**: The Python FastAPI engine handling authentication, database interactions, and heavy AI inference tasks. Deployed via Docker to **Hugging Face Spaces**.
- **`.github/workflows/`**: Continuous Integration (CI) scripts that automatically sync updates to the Hugging Face Space.

---

## 🛠 Tech Stack & Libraries Used

### 🖥 Frontend (Client-Side)
- **Framework**: `React (v19)` built with `Vite` for lightning-fast module replacement.
- **Styling**: `TailwindCSS` for modern, responsive, mobile-first styling.
- **Client-Side AI**: `@mediapipe/tasks-vision` provides hardware-accelerated face tracking in the browser to draw green/red overlays on the camera feed in real-time.
- **Routing**: `react-router-dom` for handling multi-page navigation (Login, Teacher Hub, Student Hub).

### ⚙️ Backend (Server & AI Inference)
- **API Framework**: `FastAPI` combined with `uvicorn`, resulting in one of the fastest Python frameworks available for async web architectures.
- **Database**: **Supabase (PostgreSQL)**. We leverage the `pgvector` extension natively to store and query the mathematically dense 512-dimensional facial embeddings.
- **Authentication**: `PyJWT` for generating secure JSON Web Tokens, and `bcrypt` for zero-knowledge password hashing.
- **Computer Vision Model**: 
   - **`ONNXRuntime`**: Runs inference completely locally without GPU requirements.
   - **`SCRFD`**: State-of-the-art fast face detector.
   - **`ArcFace`**: Deep convolutional neural network designed to extract highly accurate unique facial prints (embeddings).

---

## 🚀 Setup & Local Development Guide

To run the full stack on your local machine:

### 1. Database Configuration
1. Create a free **Supabase** project.
2. Enable the `pgvector` extension via the Supabase UI.
3. Keep your Supabase URL and Anon Key handy.

### 2. Backend Setup
The backend requires Python 3.10+.
```bash
# Navigate to the backend directory
cd backend

# Create and activate a Virtual Environment
python -m venv venv
source venv/bin/activate

# Install all AI and API dependencies
pip install -r requirements.txt

# Create your environment variables file
cat <<EOT >> .env
SUPABASE_URL=your_supabase_url_here
SUPABASE_KEY=your_supabase_anon_key_here
SECRET_KEY=your_secure_random_string
EOT

# Start the uvicorn development server on localhost:8000
uvicorn main:app --reload
```

### 3. Frontend Setup
The frontend requires Node.js 18+.
```bash
# Open a new terminal and navigate to the frontend
cd frontend

# Install the React packages
npm install

# Configure your environment variables to point to the local backend
cat <<EOT >> .env
VITE_API_URL=http://localhost:8000
EOT

# Start the Vite development server (usually on localhost:5173)
npm run dev
```

---

## 📱 Using The App

1. **Teacher Mode**: Teachers can log in, create classrooms, view their personalized roster, and easily download attendance sheets to Excel CSV.
2. **Student Mode**: Students capture their "AI Identity" via a 5-photo burst through their mobile camera. This securely binds mathematical representations of their face to their student ID in the database, granting them seamless auto-login when joining classrooms.
