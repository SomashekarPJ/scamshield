import os
import json
import base64
import re
from io import BytesIO
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

# ---------------------------------------------------------------------------
# Client setup
# ---------------------------------------------------------------------------
# Groq
try:
    from groq import Groq
    if GROQ_API_KEY:
        groq_client = Groq(api_key=GROQ_API_KEY)
        GROQ_AVAILABLE = True
    else:
        groq_client = None
        GROQ_AVAILABLE = False
except ImportError:
    groq_client = None
    GROQ_AVAILABLE = False

# Gemini
try:
    import google.generativeai as genai
    if GOOGLE_API_KEY:
        genai.configure(api_key=GOOGLE_API_KEY)
        GEMINI_AVAILABLE = True
    else:
        GEMINI_AVAILABLE = False
except ImportError:
    GEMINI_AVAILABLE = False

# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------
ANALYSIS_PROMPT = """You are ScamShield AI, the world's most advanced fraud detection system specialized in Indian digital scams — UPI fraud, phishing, fake banking alerts, OTP theft, lottery scams, and social engineering attacks.

Analyze the following {input_type} and respond ONLY with a single valid JSON object. No markdown, no explanation outside the JSON.

{input_type_label}: {content}

Return this exact JSON structure:
{{
  "risk_score": <integer 0-100>,
  "risk_level": "<one of: SAFE|LOW|MEDIUM|HIGH|CRITICAL>",
  "verdict": "<one sharp sentence verdict, e.g. 'Fake SBI banking alert designed to steal OTP'>",
  "explanation": "<2-3 sentences explaining why this is dangerous or safe>",
  "red_flags": [
    "<scam tactic 1, e.g. 'False urgency — threatens account blocking'>",
    "<scam tactic 2>",
    "<more if applicable>"
  ],
  "flagged_words": ["<dangerous word/phrase from the text>", "<another>"]
}}

Scoring guide:
- 0-10: Completely safe and legitimate
- 11-30: Possibly spam but not dangerous
- 31-60: Suspicious — possible low-level scam
- 61-85: High risk — likely fraud
- 86-100: CRITICAL — confirmed scam patterns

Be precise and ruthless in detection. Indian scam context: look for fake YONO/SBI/HDFC/UPI alerts, electricity/gas bill warnings, KYC update demands, prize winning notifications, courier parcel holds, and government impersonation. Flag unofficial URLs, grammatical errors suggesting non-native generation, emotional manipulation, and requests for OTPs, passwords, or UPI PINs."""


def _clean_json(text: str) -> str:
    """Strip markdown code fences from Gemini output."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _fallback_response(reason: str) -> dict:
    return {
        "risk_score": 0,
        "risk_level": "SAFE",
        "verdict": "Analysis unavailable",
        "explanation": reason,
        "red_flags": [],
        "flagged_words": [],
        "success": False,
        "error": reason,
    }


# ---------------------------------------------------------------------------
# Core analysis functions
# ---------------------------------------------------------------------------

def analyze_text(text: str) -> dict:
    """Analyze raw text or URL with Groq llama3 model, fallback to Gemini."""
    prompt = ANALYSIS_PROMPT.format(
        input_type="message/text",
        input_type_label="Message",
        content=text
    )

    # Try Groq (Primary)
    if GROQ_AVAILABLE and groq_client:
        try:
            completion = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that detects scams."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            result = json.loads(completion.choices[0].message.content)
            result["success"] = True
            result["provider"] = "Groq"
            return result
        except Exception as e:
            print(f"Groq text analysis failed, falling back: {e}")

    # Try Gemini (Secondary)
    if GEMINI_AVAILABLE:
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(response_mime_type="application/json")
            )
            result = json.loads(response.text)
            result["success"] = True
            result["provider"] = "Gemini"
            return result
        except Exception as e:
            return _fallback_response(f"Both Groq and Gemini analysis failed: {str(e)}")

    return _fallback_response("No AI providers (Groq/Gemini) configured.")


def analyze_url(url: str) -> dict:
    """Analyze a suspicious URL by fetching its content first, using Groq then Gemini."""
    scraped_info = ""
    try:
        import requests
        from bs4 import BeautifulSoup
        
        # Attempt to fetch content with a brief timeout and fake user-agent
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        res = requests.get(url, headers=headers, timeout=5)
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, "html.parser")
            title = soup.title.string if soup.title else "No Title"
            text_snippet = soup.get_text(separator=" ", strip=True)[:1000]
            scraped_info = f"\n\n[Website Content Fetched]\nTitle: {title}\nContent Snippet: {text_snippet}"
    except Exception as e:
        scraped_info = f"\n\n[Website Content Fetched]\nFailed to scrape URL. It may be offline or blocking bots. Error: {str(e)}"

    prompt = ANALYSIS_PROMPT.format(
        input_type="URL",
        input_type_label="URL",
        content=url + scraped_info
    )

    # Try Groq (Primary)
    if GROQ_AVAILABLE and groq_client:
        try:
            completion = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that detects scams."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            result = json.loads(completion.choices[0].message.content)
            result["success"] = True
            result["provider"] = "Groq"
            return result
        except Exception as e:
            print(f"Groq URL analysis failed, falling back: {e}")

    # Try Gemini (Secondary)
    if GEMINI_AVAILABLE:
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(response_mime_type="application/json")
            )
            result = json.loads(response.text)
            result["success"] = True
            result["provider"] = "Gemini"
            return result
        except Exception as e:
            return _fallback_response(f"Both Groq and Gemini URL analysis failed: {str(e)}")

    return _fallback_response("No AI providers configured.")


def analyze_image(image_base64: str) -> dict:
    """Analyze a screenshot using Groq Vision, falling back to Gemini Vision."""
    vision_prompt = f"""You are ScamShield AI. First, read ALL text visible in this screenshot image. Then analyze it for fraud patterns.

Return ONLY a single valid JSON object (no markdown, no extra text):
{{
  "risk_score": <integer 0-100>,
  "risk_level": "<SAFE|LOW|MEDIUM|HIGH|CRITICAL>",
  "verdict": "<one sharp sentence verdict>",
  "explanation": "<2-3 sentences explaining the threat or confirming safety>",
  "red_flags": ["<tactic 1>", "<tactic 2>"],
  "flagged_words": ["<dangerous word/phrase from the image text>"],
  "extracted_text": "<full text you read from the image>"
}}

Scoring:
- 0-10: Safe  |  11-30: Low risk  |  31-60: Suspicious  |  61-85: High risk  |  86-100: CRITICAL scam

Look for: fake banking alerts, UPI scams, OTP theft, electricity bill threats, lottery scams, government impersonation, unofficial URLs, false urgency, grammar errors."""

    # Try Groq (Primary)
    if GROQ_AVAILABLE and groq_client:
        try:
            completion = groq_client.chat.completions.create(
                model="llama-3.2-90b-vision-preview",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": vision_prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_base64}",
                                },
                            },
                        ],
                    }
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            result = json.loads(completion.choices[0].message.content)
            result["success"] = True
            result["provider"] = "Groq"
            return result
        except Exception as e:
            print(f"Groq Vision failed, falling back: {e}")

    # Try Gemini (Secondary)
    if GEMINI_AVAILABLE:
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            img_data = base64.b64decode(image_base64)
            response = model.generate_content(
                [vision_prompt, {"mime_type": "image/jpeg", "data": img_data}],
                generation_config=genai.GenerativeConfig(response_mime_type="application/json")
            )
            result = json.loads(response.text)
            result["success"] = True
            result["provider"] = "Gemini"
            return result
        except Exception as e:
            return _fallback_response(f"Both Groq and Gemini vision failed: {str(e)}")

    return _fallback_response("No Vision AI providers configured.")


def analyze_voice(audio_bytes: bytes, filename: str = "recording.wav") -> dict:
    """Transcribe audio using Groq Whisper and then analyze the transcript."""
    if not GROQ_AVAILABLE or not groq_client:
        return _fallback_response("Groq API key required for Whisper transcription.")

    try:
        # 1. Transcribe
        transcription = groq_client.audio.transcriptions.create(
            file=(filename, audio_bytes),
            model="whisper-large-v3",
            response_format="verbose_json",
        )
        transcript_text = transcription.text
        
        if not transcript_text.strip():
            return _fallback_response("No speech detected in the audio.")

        # 2. Analyze the transcript (uses Groq first, then Gemini)
        result = analyze_text(transcript_text)
        result["extracted_text"] = transcript_text
        return result

    except Exception as e:
        return _fallback_response(f"Voice analysis failed: {str(e)}")

