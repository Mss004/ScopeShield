import inspect
import logging
import os

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from models import (
    ExtractedScope, HealthResponse,
    ScopeExtractionRequest, ScopeExtractionResponse,
    CompareRequest, CompareResponse,
    GenerateReplyRequest, GenerateReplyResponse,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("scopeshield")

app = FastAPI(title="ScopeShield API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Yusuf'un modülü gelene kadar mock yanıtlarla çalışır
try:
    from prompt_runner import extract_scope as run_extract_scope
    from prompt_runner import compare_requests as run_compare_requests
    from prompt_runner import generate_reply as run_generate_reply
    PROMPT_RUNNER_AVAILABLE = True
    logger.info("prompt_runner yüklendi.")
except ImportError:
    PROMPT_RUNNER_AVAILABLE = False
    logger.warning("prompt_runner bulunamadı, MOCK modda çalışılıyor.")

# Yusuf'un ollama_client.py dosyasındaki MODEL_NAME ile aynı olmalı
MODEL_NAME = "gemma4:e4b"
try:
    from ollama_client import MODEL_NAME as _CLIENT_MODEL
    MODEL_NAME = _CLIENT_MODEL
except Exception:
    pass

MAX_HISTORY = 10  # Modele gönderilecek en fazla geçmiş mesaj


def _accepts_history(fn) -> bool:
    """prompt_runner fonksiyonu 'history' parametresi alıyor mu?"""
    try:
        return "history" in inspect.signature(fn).parameters
    except (TypeError, ValueError):
        return False


def _trim_history(history) -> list:
    return [h.model_dump() for h in history[-MAX_HISTORY:]]


@app.get("/health", response_model=HealthResponse)
def health_check():
    try:
        res = requests.get("http://localhost:11434/api/tags", timeout=2)
        ollama_status = "connected" if res.status_code == 200 else "unreachable"
    except Exception:
        ollama_status = "disconnected"
    return HealthResponse(status="ok", model=MODEL_NAME, ollama=ollama_status)


@app.post("/extract-scope", response_model=ScopeExtractionResponse)
def extract_scope_endpoint(payload: ScopeExtractionRequest):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Metin boş olamaz.")
    logger.info("[%s] extract-scope (%s, %d karakter)",
                payload.project_id, payload.client_name, len(payload.text))

    if not PROMPT_RUNNER_AVAILABLE:
        return ScopeExtractionResponse(
            project_id=payload.project_id,
            deliverables=["Beş sayfalık kurumsal tanıtım sitesi"],
            included=["Mobil uyumluluk", "İletişim formu"],
            excluded=["E-ticaret", "Üyelik sistemi"],
            client_responsibilities=["İçeriklerin sağlanması"],
            revisions="İki tur görsel revizyon",
            ambiguities=["Teslim tarihi belirtilmemiş"],
        )
    try:
        result = run_extract_scope(payload.text)
        if not result:
            raise ValueError("Model geçerli bir JSON döndürmedi.")
        if not isinstance(result.get("revisions"), str):
            result["revisions"] = ""
        scope = ExtractedScope(**result)
        return ScopeExtractionResponse(project_id=payload.project_id, **scope.model_dump())
    except Exception as e:
        logger.error("[%s] extract-scope hatası: %s", payload.project_id, e)
        raise HTTPException(status_code=500, detail=f"Kapsam çıkarılamadı: {e}")


@app.post("/compare-request", response_model=CompareResponse)
def compare_request_endpoint(payload: CompareRequest):
    if not payload.new_message.strip():
        raise HTTPException(status_code=400, detail="Müşteri mesajı boş olamaz.")
    logger.info("[%s] compare-request: %s", payload.project_id, payload.new_message[:60])

    if not PROMPT_RUNNER_AVAILABLE:
        return CompareResponse(project_id=payload.project_id, items=[{
            "request": "Üyelik sistemi",
            "verdict": "extra_work",
            "reasoning": "Üyelik sistemi açıkça kapsam dışında belirtilmiş.",
            "source_quote": "Üyelik sistemi dahil değil.",
            "clarifying_question": None,
        }])
    try:
        scope = payload.approved_scope.model_dump()
        if _accepts_history(run_compare_requests):
            result = run_compare_requests(scope, payload.new_message,
                                          history=_trim_history(payload.history))
        else:
            result = run_compare_requests(scope, payload.new_message)
        if not result or "items" not in result:
            raise ValueError("Model geçerli bir JSON döndürmedi.")
        return CompareResponse(project_id=payload.project_id, items=result["items"])
    except Exception as e:
        logger.error("[%s] compare-request hatası: %s", payload.project_id, e)
        raise HTTPException(status_code=500, detail=f"Karşılaştırma yapılamadı: {e}")


@app.post("/generate-reply", response_model=GenerateReplyResponse)
def generate_reply_endpoint(payload: GenerateReplyRequest):
    logger.info("[%s] generate-reply, üslup: %s", payload.project_id, payload.style)

    if not PROMPT_RUNNER_AVAILABLE:
        return GenerateReplyResponse(
            project_id=payload.project_id,
            draft="Merhaba, talebinizi inceledim. Belirttiğiniz ek özellik ilk anlaştığımız kapsamın dışında kaldığı için ayrıca değerlendirmem gerekiyor.",
        )
    try:
        scope = payload.approved_scope.model_dump()
        items = [i.model_dump() for i in payload.items]
        if _accepts_history(run_generate_reply):
            draft = run_generate_reply(scope, items, payload.style,
                                       history=_trim_history(payload.history))
        else:
            draft = run_generate_reply(scope, items, payload.style)
        if not draft or not draft.strip():
            raise ValueError("Model boş yanıt döndürdü.")
        return GenerateReplyResponse(project_id=payload.project_id, draft=draft.strip())
    except Exception as e:
        logger.error("[%s] generate-reply hatası: %s", payload.project_id, e)
        raise HTTPException(status_code=500, detail=f"Yanıt taslağı oluşturulamadı: {e}")


# Frontend: tüm API route'larından SONRA mount edilmeli
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
