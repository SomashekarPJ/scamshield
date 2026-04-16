from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import base64

from models import AnalyzeRequest, AnalyzeResponse
from analyzer import analyze_text, analyze_url, analyze_image, analyze_voice, GROQ_AVAILABLE, GEMINI_AVAILABLE
from database import get_db, ScanLog
from sqlalchemy.orm import Session

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="ScamShield AI v2",
    description="Intelligent Fraud Defense — Real-time AI scam analysis",
    version="2.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# CORS — allow React dev server and direct file opens
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {
        "status": "online",
        "groq_configured": GROQ_AVAILABLE,
        "gemini_configured": GEMINI_AVAILABLE,
        "version": "2.0.0"
    }


@app.post("/api/analyze")
@limiter.limit("10/minute")
def analyze(req: AnalyzeRequest, request: Request, db: Session = Depends(get_db)):
    """
    Main analysis endpoint.
    input_type: "text" | "url" | "image"
    """
    input_type = req.input_type.lower()

    if input_type == "text":
        if not req.content or not req.content.strip():
            raise HTTPException(status_code=400, detail="No text content provided")
        result = analyze_text(req.content.strip())

    elif input_type == "url":
        if not req.content or not req.content.strip():
            raise HTTPException(status_code=400, detail="No URL provided")
        result = analyze_url(req.content.strip())

    elif input_type == "image":
        if not req.image_base64:
            raise HTTPException(status_code=400, detail="No image data provided")
        result = analyze_image(req.image_base64)

    else:
        raise HTTPException(status_code=400, detail=f"Unknown input_type: {input_type}")

    if result.get("success"):
        new_log = ScanLog(
            input_type=input_type,
            risk_score=result.get("risk_score", 0),
            risk_level=result.get("risk_level", "SAFE"),
            verdict=result.get("verdict", "")
        )
        db.add(new_log)
        db.commit()

    return result


@app.get("/api/recent_scans")
def get_recent_scans(db: Session = Depends(get_db)):
    """Return the most recent high/critical risk scans."""
    logs = db.query(ScanLog).filter(ScanLog.risk_level.in_(["HIGH", "CRITICAL"])).order_by(ScanLog.timestamp.desc()).limit(15).all()
    return logs

@app.post("/api/analyze/upload")
@limiter.limit("5/minute")
async def analyze_upload(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Accept image file upload directly (multipart)."""
    contents = await file.read()
    b64 = base64.b64encode(contents).decode("utf-8")
    result = analyze_image(b64)
    
    if result.get("success"):
        new_log = ScanLog(
            input_type="image",
            risk_score=result.get("risk_score", 0),
            risk_level=result.get("risk_level", "SAFE"),
            verdict=result.get("verdict", "")
        )
        db.add(new_log)
        db.commit()

    return result


@app.post("/api/analyze/voice")
@limiter.limit("5/minute")
async def analyze_voice_upload(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Accept audio file upload and analyze for scams."""
    contents = await file.read()
    result = analyze_voice(contents, filename=file.filename)
    
    if result.get("success"):
        new_log = ScanLog(
            input_type="voice",
            risk_score=result.get("risk_score", 0),
            risk_level=result.get("risk_level", "SAFE"),
            verdict=result.get("verdict", "")
        )
        db.add(new_log)
        db.commit()

    return result


# ---------------------------------------------------------------------------
# Serve the frontend static files (production convenience)
# ---------------------------------------------------------------------------
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
else:
    @app.get("/")
    def root():
        return {"message": "ScamShield AI v2 API is running.", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
