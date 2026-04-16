# ScamShield AI 🛡️

Intelligent Fraud Defense — Real-time AI scam analysis for the Nexora 2026 Hackathon.

## Features
- **Text Analysis**: Detect phishing in SMS/Emails.
- **URL Scanning**: Identify malicious domains.
- **Screenshot Analysis**: Extract and analyze text from image uploads.
- **Voice/Call Defender**: Transcribe and detect scams in live audio or recordings.

## Tech Stack
- **Frontend**: Vanilla JS, HTML5, CSS3.
- **Backend**: FastAPI (Python).
- **AI Engines**: Groq (Llama 3) & Google Gemini 1.5.

## Deployment Instructions (Render.com)

1. **Push to GitHub**:
   - Create a new repository on GitHub.
   - Run the commands in the terminal (see steps provided in chat).

2. **Setup on Render**:
   - Create a **New Web Service**.
   - Link your GitHub repo.
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   - **Environment Variables**:
     - `GROQ_API_KEY`: Your key from Groq Cloud.
     - `GEMINI_API_KEY`: Your key from Google AI Studio.
     - `PYTHONPATH`: `backend`

## Local Setup
1. `cd backend`
2. `pip install -r requirements.txt`
3. `python main.py`
