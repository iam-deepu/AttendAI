# AttendAI - Deployment & Setup Guide

This guide provides instructions to run the AI Classroom Attendance System on a macOS M2 (Apple Silicon) environment.

## 1. Prerequisites
- **Python 3.10+**
- **Node.js 18+** (for frontend)
- **MongoDB Atlas** account (M0 Sandbox is fine to start)

## 2. Backend Setup
1. Open a terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
   *Note: Because you are on an M2 Mac, PyTorch will automatically use the MPS (Metal Performance Shaders) backend as handled in `ai_engine.py`.*

4. Setup Environment Variables:
   Create a `.env` file in the `backend` directory:
   ```env
   MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/attend_ai?retryWrites=true&w=majority
   SECRET_KEY=generate_a_secure_random_string_here
   ```

5. Run the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```

## 3. MongoDB Atlas Vector Search Index Configuration 
(CRITICAL FOR AI MATCHING)

1. Go to your MongoDB Atlas dashboard.
2. Navigate to your `attend_ai` database > `students` collection.
3. Click the **"Atlas Search"** tab > Create Search Index > **JSON Editor**.
4. Set the index name to **`vector_index`**.
5. Paste the following JSON:
   ```json
   {
     "mappings": {
       "dynamic": true,
       "fields": {
         "face_embedding": {
           "dimensions": 512,
           "similarity": "cosine",
           "type": "knnVector"
         },
         "class_codes": {
           "type": "token"
         }
       }
     }
   }
   ```
6. Click Save and wait for it to build.
*(Note: Change dimensions to 128 if you happen to use a lighter InsightFace model, but `buffalo_l` is usually 512)*

## 4. Frontend Setup
For a complete web app, place `TeacherUpload.jsx` and `StudentEnroll.jsx` into your Vite React project (`frontend` dir):
```bash
npx create-vite@latest frontend --template react
cd frontend
npm install
npm install tailwindcss postcss autoprefixer
npx tailwindcss init -p
```
Configure `tailwind.config.js` and add the directives to `index.css`. Finally, render the components in `App.jsx`. Run with `npm run dev`.

## 5. ERP Custom Integration Fallback (Playwright)
If your school's ERP system does not have an API, we use Playwright to automate logging into the portal and marking the recognized students present.

A template script `playwright_sync.py` is included in the project directory.

Run it manually or via a chron job:
```bash
python playwright_sync.py
```
