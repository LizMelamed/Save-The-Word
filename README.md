# Save-The-Word

## Backend setup

1. Create `backend/.env` based on `backend/.env.example` and set `OPENAI_API_KEY`.
2. Install backend dependencies from `backend/requirements.txt`.

The API key is read from environment variables and should not be committed to Git.

## Local dev (frontend ↔ backend)

Run the backend at `http://127.0.0.1:8000` and the frontend with Vite.
The Vite dev server proxies `/generate-story` and `/predict-reading-skill` to the backend.

## Production deployment

In production, the frontend must call the backend on the same origin or via a proxy.
Recommended options:
1. Serve the frontend and backend under the same domain (e.g., `/api` proxy).
2. If hosted separately, configure a reverse proxy (NGINX/hosting proxy) so
   `/generate-story` and `/predict-reading-skill` forward to your backend.
3. Avoid exposing API keys in the frontend. Keep keys in backend env vars.

## Story safety judge

The backend can optionally use a Gemini model as a safety judge. Set `GEMINI_API_KEY`
and (optionally) `GEMINI_JUDGE_MODEL` in `backend/.env`. The judge will score the story
and request regeneration if the score is below 8.
