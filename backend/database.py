import os
from supabase import create_client, Client
from dotenv import load_dotenv
import numpy as np

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env file")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# --- Helper ---
def helper(record: dict) -> dict:
    """Convert Supabase record to app format (id as string)."""
    if not record:
        return {}
    record = dict(record)
    record["id"] = str(record["id"])
    return record


# --- User Operations ---
async def get_user_by_email(email: str):
    result = supabase.table("users").select("*").eq("email", email).execute()
    if result.data:
        return helper(result.data[0])
    return None


# --- Student Operations ---
async def get_student_by_user_id(user_id: str):
    result = supabase.table("students").select("*").eq("user_id", user_id).execute()
    if result.data:
        return helper(result.data[0])
    return None


# --- Classroom Operations ---
async def get_classroom_by_code(class_code: str):
    result = supabase.table("classrooms").select("*").eq("class_code", class_code).execute()
    if result.data:
        return helper(result.data[0])
    return None


# --- Vector Search ---
async def vector_search_student(query_vector: list, class_code: str, limit: int = 1, similarity_threshold: float = 0.30):
    """
    Perform vector similarity search using the Supabase RPC function match_students.
    Falls back to manual cosine similarity if the RPC fails.
    """
    try:
        # Use the match_students SQL function
        result = supabase.rpc("match_students", {
            "query_embedding": query_vector,
            "match_class_code": class_code,
            "match_threshold": similarity_threshold,
            "match_count": limit
        }).execute()

        if result.data:
            matches = []
            for doc in result.data:
                if doc.get("score", 0) >= similarity_threshold:
                    doc["id"] = str(doc["id"])
                    doc["user_id"] = str(doc["user_id"])
                    matches.append(doc)
            if matches:
                return matches
            raise Exception("No matches above threshold")

        raise Exception("RPC returned no data")

    except Exception as e:
        print(f"Supabase RPC search failed: {e}. Falling back to manual cosine similarity.")

        # Manual fallback: fetch all students in this class and compute similarity
        result = supabase.table("students").select("*").contains("class_codes", [class_code]).execute()

        if not result.data:
            return []

        query_vec = np.array(query_vector)
        matches = []

        for s in result.data:
            if not s.get("face_embedding"):
                continue
            import json
            emb = s["face_embedding"]
            if isinstance(emb, str):
                try:
                    emb = json.loads(emb)
                except:
                    pass
            stored_vec = np.array(emb, dtype=np.float64)
            query_vec_f = np.array(query_vector, dtype=np.float64)
            similarity = float(np.dot(query_vec_f, stored_vec))

            if similarity >= similarity_threshold:
                match_doc = helper(s)
                match_doc["score"] = similarity
                matches.append(match_doc)

        matches.sort(key=lambda x: x["score"], reverse=True)
        return matches[:limit]
