from pydantic import BaseModel
from typing import Optional, List

class AnalyzeRequest(BaseModel):
    input_type: str          # "text", "url", "image"
    content: Optional[str] = None          # raw text or URL
    image_base64: Optional[str] = None     # base64-encoded image

class RedFlag(BaseModel):
    category: str
    description: str

class AnalyzeResponse(BaseModel):
    risk_score: int
    risk_level: str          # SAFE | LOW | MEDIUM | HIGH | CRITICAL
    verdict: str
    explanation: str
    red_flags: List[str]
    flagged_words: List[str]
    extracted_text: Optional[str] = None   # OCR result for screenshots
    success: bool = True
    error: Optional[str] = None
