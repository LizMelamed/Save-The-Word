from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import numpy as np
import os
import json
import re
import random
from typing import List, Optional, Any, Dict
import warnings
try:
    import pandas as pd
except Exception:
    pd = None
from openai import OpenAI
import httpx
from dotenv import load_dotenv
import traceback
from wordfreq import zipf_frequency

app = FastAPI()

# CORS for frontend deployments (Vercel, etc.)
allowed_origins = [
    "https://save-the-word.vercel.app",
    "https://save-the-wordd.vercel.app",
    "https://save-the-word.onrender.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load env vars from backend/.env if present
load_dotenv()

# Load model ONCE on server start
MODEL_PATH = "models/reading_skill_model_mixed.pkl"
bundle = joblib.load(MODEL_PATH)
model = None
scaler = None
length_reg_coef = None
length_reg_intercept = None
if isinstance(bundle, dict):
    model = bundle.get("model")
    scaler = bundle.get("scaler")
    length_reg_coef = bundle.get("length_reg_coef")
    length_reg_intercept = bundle.get("length_reg_intercept")
elif hasattr(bundle, "predict"):
    model = bundle

def _fallback_predict(metrics) -> float:
    # Simple heuristic fallback (match frontend estimate)
    slow = 1200.0
    fast = 250.0
    ms = metrics.avg_hover_ms or slow
    t = max(0.0, min(1.0, (slow - ms) / (slow - fast)))
    return -90.8 + t * (70.0 - -90.8)
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
GEMINI_JUDGE_MODEL = os.environ.get("GEMINI_JUDGE_MODEL", "gemini-2.5-flash-lite")


class ReadingMetrics(BaseModel):
    age: int
    avg_hover_ms: float
    total_hover_ms: float
    num_words: int
    num_restores: int   # how many times a faded word was restored
    per_word: Optional[List[Dict[str, Any]]] = None


@app.post("/predict-reading-skill")
def predict_reading_skill(metrics: ReadingMetrics):
    if not model or not hasattr(model, "predict"):
        pred = _fallback_predict(metrics)
        return {"predicted_reading_skill": float(pred), "fallback": True}

    if metrics.per_word:
        rows = []
        obs = []
        for item in metrics.per_word:
            try:
                hover_ms = float(item.get("hover_ms", 0))
                length = float(item.get("length", 0))
                sent_len = float(item.get("sentence_length", 0))
                freq = float(item.get("word_frequency_surprisal", 0))
            except Exception:
                continue
            if hover_ms <= 0 or length <= 0 or sent_len <= 0:
                continue
            if length_reg_coef is not None and length_reg_intercept is not None:
                length_resid = length - (length_reg_coef * freq + length_reg_intercept)
            else:
                length_resid = length
            rows.append([length_resid, sent_len, float(metrics.age), freq])
            obs.append(hover_ms)

        if rows:
            X_raw = np.array(rows, dtype=float)
            if not np.isfinite(X_raw).all():
                raise HTTPException(status_code=400, detail="Non-finite word metrics")

            if scaler is not None:
                expected = getattr(scaler, "n_features_in_", X_raw.shape[1])
                if expected != X_raw.shape[1]:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Scaler expects {expected} features but got {X_raw.shape[1]}",
                    )
                try:
                    if pd is not None and hasattr(scaler, "feature_names_in_"):
                        X_df = pd.DataFrame(X_raw, columns=list(scaler.feature_names_in_))
                        with warnings.catch_warnings():
                            warnings.simplefilter("ignore", UserWarning)
                            X_scaled = scaler.transform(X_df)
                    else:
                        X_scaled = scaler.transform(X_raw)
                except Exception as exc:
                    raise HTTPException(status_code=500, detail=f"Scaler transform failed: {exc}")
            else:
                X_scaled = X_raw

            X_exog = np.column_stack([np.ones(len(X_scaled)), X_scaled])
            try:
                pred = model.predict(X_exog)
            except Exception as exc:
                raise HTTPException(status_code=500, detail=str(exc))

            residuals = np.array(obs, dtype=float) - np.array(pred, dtype=float)
            reading_skill = -float(np.mean(residuals))
            return {
                "predicted_reading_skill": reading_skill,
                "model_mode": "mixedlm_residual",
            }

    pred = _fallback_predict(metrics)
    return {"predicted_reading_skill": float(pred), "fallback": True}


class StoryRequest(BaseModel):
    age: int
    interests: List[str]
    reading_level: Optional[float] = None
    reading_speed_wpm: Optional[float] = None
    comprehension_success: Optional[float] = None
    num_sentences: int = 5
    max_attempts: int = 3


def _clean_token(token: str) -> str:
    return re.sub(r"(^[^A-Za-z]+|[^A-Za-z]+$)", "", token).lower()


def compute_word_features(sentences: List[str]) -> List[List[Dict[str, Any]]]:
    features = []
    for sentence in sentences:
        tokens = sentence.strip().split()
        cleaned_tokens = [_clean_token(token) for token in tokens]
        word_count = sum(1 for t in cleaned_tokens if t)
        word_count = max(word_count, 1)

        sentence_features = []
        for idx, token in enumerate(tokens):
            cleaned = cleaned_tokens[idx]
            length = len(cleaned) if cleaned else 0
            zipf = zipf_frequency(cleaned, "en") if cleaned else 3.5
            freq_surprisal = 9.0 - zipf
            sentence_features.append(
                {
                    "token": token,
                    "clean": cleaned,
                    "word_index": idx,
                    "length": length,
                    "sentence_length": word_count,
                    "word_frequency_surprisal": float(freq_surprisal),
                }
            )
        features.append(sentence_features)
    return features


class LogPayload(BaseModel):
    type: str
    payload: Dict[str, Any]


def judge_story_with_gemini(sentences: List[str], age: int):
    if not GEMINI_API_KEY:
        return {"score": None, "feedback": "judge_unavailable", "status": "skipped"}

    story_text = " ".join(sentences)
    prompt = (
        "You are a safety judge for children's stories.\n"
        f"Target reader age: {age}\n"
        "Rate the story for child safety on a 1-10 scale, where 10 is safest.\n"
        "Return only JSON with keys: score (integer 1-10), feedback (short text).\n"
        "Story:\n"
        f"{story_text}"
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_JUDGE_MODEL}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 256},
    }

    with httpx.Client(timeout=30) as client_http:
        resp = client_http.post(
            url,
            headers={
                "x-goog-api-key": GEMINI_API_KEY,
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if resp.status_code != 200:
        # If rate limited or quota exceeded, skip judge instead of failing
        if resp.status_code == 429:
            return {
                "score": None,
                "feedback": "judge_rate_limited",
                "status": "skipped",
            }
        raise HTTPException(
            status_code=500,
            detail=f"Gemini judge failed ({resp.status_code}): {resp.text}",
        )

    try:
        text = (
            resp.json()
            .get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
        data = json.loads(text)
        score = int(data.get("score", 0))
        feedback = str(data.get("feedback", "")).strip()
    except Exception:
        score = None
        feedback = "Judge response could not be parsed."

    status = "ok" if score is not None else "skipped"
    return {"score": score, "feedback": feedback, "status": status}


def judge_story_with_openai(sentences: List[str], age: int):
    system = (
        "You are a safety judge for children's stories. "
        "Rate child safety on a 1-10 scale, where 10 is safest. "
        "Return only JSON with keys: score (integer 1-10), feedback (short text)."
    )
    story_text = " ".join(sentences)
    user = (
        f"Target reader age: {age}\n"
        "Story:\n"
        f"{story_text}"
    )
    response = client.responses.create(
        model="gpt-4.1-nano",
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    try:
        data = json.loads(response.output_text)
        score = int(data.get("score", 0))
        feedback = str(data.get("feedback", "")).strip()
    except Exception:
        score = None
        feedback = "Judge response could not be parsed."
    status = "ok" if score is not None else "skipped"
    return {"score": score, "feedback": feedback, "status": status, "judge": "openai"}


@app.post("/generate-story")
def generate_story(req: StoryRequest):
    if not os.environ.get("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

    interests = ", ".join(req.interests) if req.interests else "general"
    reading_level = (
        f"{req.reading_level:.1f}" if req.reading_level is not None else "unknown"
    )
    reading_speed = (
        f"{req.reading_speed_wpm:.1f} wpm"
        if req.reading_speed_wpm is not None
        else "unknown"
    )
    comprehension = (
        f"{req.comprehension_success:.2f}"
        if req.comprehension_success is not None
        else "unknown"
    )

    system = (
        "You write short, child-friendly stories and comprehension questions. "
        "Use simple vocabulary suitable for the given age. "
        "Return only valid JSON matching the requested format."
    )
    user = (
        "Create a short story for a child.\n"
        f"Age: {req.age}\n"
        f"Interests: {interests}\n"
        f"Reading level score: {reading_level}\n"
        f"Reading speed: {reading_speed}\n"
        f"Comprehension success (0-1): {comprehension}\n"
        f"Number of sentences: {req.num_sentences}\n"
        "Constraints:\n"
        "- Each sentence should be 6-12 words.\n"
        "- Use calm, friendly tone.\n"
        "- Keep punctuation simple.\n"
        "- Adjust difficulty using reading speed and comprehension:\n"
        "  * If comprehension < 0.6: use shorter words, simpler sentences, more repetition.\n"
        "  * If comprehension between 0.6 and 0.8: use simple sentences with mild variety.\n"
        "  * If comprehension >= 0.8 and reading speed >= 120 wpm: allow slightly richer vocabulary.\n"
        "Also create exactly 2 comprehension questions about the story.\n"
        "Each question must have exactly 2 non-empty answer options and one correct answer.\n"
        "Return JSON like:\n"
        "{\n"
        "  \"sentences\": [\"...\"],\n"
        "  \"questions\": [\n"
        "    {\"text\": \"...\", \"options\": [\"...\", \"...\"], \"correct_index\": 0}\n"
        "  ]\n"
        "}"
    )

    feedback = None
    attempts = []
    try:
        for _ in range(max(1, req.max_attempts)):
            user_with_feedback = (
                user
                + (f"\nSafety feedback to address: {feedback}" if feedback else "")
            )
            response = client.responses.create(
                model="gpt-4.1-nano",
                input=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_with_feedback},
                ],
            )

            try:
                data = json.loads(response.output_text)
                sentences = data.get("sentences", [])
                questions = data.get("questions", [])
                if not isinstance(sentences, list) or not sentences:
                    raise ValueError("No sentences")
                if (
                    not isinstance(questions, list)
                    or len(questions) != 2
                    or any(
                        not isinstance(q, dict)
                        or "text" not in q
                        or "options" not in q
                        or "correct_index" not in q
                        for q in questions
                    )
                ):
                    raise ValueError("Invalid questions")
                for q in questions:
                    options = q.get("options")
                    if (
                        not isinstance(options, list)
                        or len(options) != 2
                        or any(
                            not isinstance(opt, str) or not opt.strip()
                            for opt in options
                        )
                    ):
                        raise ValueError("Invalid question options")
                    if q.get("correct_index") not in (0, 1):
                        raise ValueError("Invalid correct index")
                    if not isinstance(q.get("text"), str) or not q.get("text").strip():
                        raise ValueError("Invalid question text")
                randomized_questions = []
                for q in questions:
                    correct_idx = q.get("correct_index", 0)
                    correct_answer = q["options"][correct_idx].strip()
                    wrong_answer = q["options"][1 - correct_idx].strip()
                    options = [correct_answer, wrong_answer]
                    random.shuffle(options)
                    randomized_questions.append(
                        {
                            "text": q["text"].strip(),
                            "options": options,
                            "correct_index": options.index(correct_answer),
                        }
                    )
                questions = randomized_questions
            except Exception:
                feedback = (
                    "Return valid JSON with exactly 2 questions. "
                    "Each question must have 2 non-empty answer options "
                    "and a valid correct_index (0 or 1)."
                )
                continue

            judge = judge_story_with_gemini(sentences, req.age)
            if judge.get("status") == "skipped":
                judge = judge_story_with_openai(sentences, req.age)
            word_features = compute_word_features(sentences)
            attempts.append(
                {
                    "sentences": sentences,
                    "questions": questions,
                    "judge": judge,
                    "word_features": word_features,
                }
            )
            if judge["score"] is None or judge["score"] >= 8:
                return {
                    "sentences": sentences,
                    "questions": questions,
                    "judge": judge,
                    "word_features": word_features,
                    "attempts": attempts,
                }
            feedback = judge["feedback"] or "Make the story safer for children."

        raise HTTPException(
            status_code=500,
            detail="Story generation failed to produce valid questions.",
        )
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/log-session")
def log_session(data: LogPayload):
    os.makedirs("logs", exist_ok=True)
    path = os.path.join("logs", "session_logs.jsonl")
    record = {
        "timestamp": data.payload.get("timestamp"),
        "type": data.type,
        "payload": data.payload,
    }
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return {"ok": True}
