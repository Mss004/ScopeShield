from pydantic import BaseModel, Field
from typing import Optional, List, Literal


# --- Ortak ---
class HealthResponse(BaseModel):
    status: str
    model: str
    ollama: str


class ExtractedScope(BaseModel):
    deliverables: List[str] = []
    included: List[str] = []
    excluded: List[str] = []
    client_responsibilities: List[str] = []
    revisions: Optional[str] = None
    ambiguities: List[str] = []


class HistoryEntry(BaseModel):
    """Seçili müşteriyle geçmiş yazışma (opsiyonel bağlam)."""
    # Frontend "assistant" (taslak yanıt) ve "system" (kapsam onayı vb.) kayıtları da gönderir
    role: Literal["client", "freelancer", "assistant", "system"]
    text: str
    date: Optional[str] = None


class ProjectContext(BaseModel):
    """Her istekte gelen proje/müşteri bilgisi."""
    project_id: str = Field(..., description="Frontend'in ürettiği benzersiz proje ID")
    client_name: Optional[str] = None
    project_title: Optional[str] = None


# --- 1. Kapsam çıkarma ---
class ScopeExtractionRequest(ProjectContext):
    text: str = Field(..., min_length=1)


class ScopeExtractionResponse(ExtractedScope):
    project_id: str


# --- 2. Karşılaştırma ---
class CompareRequest(ProjectContext):
    approved_scope: ExtractedScope
    new_message: str = Field(..., min_length=1)
    history: List[HistoryEntry] = []   # opsiyonel, boş gönderilebilir


class ComparisonItem(BaseModel):
    request: str
    verdict: Literal["in_scope", "extra_work", "ambiguous"]
    reasoning: str
    source_quote: str = ""
    clarifying_question: Optional[str] = None


class CompareResponse(BaseModel):
    project_id: str
    items: List[ComparisonItem]


# --- 3. Yanıt taslağı ---
class GenerateReplyRequest(ProjectContext):
    approved_scope: ExtractedScope
    items: List[ComparisonItem]
    style: Literal["professional", "friendly"] = "professional"
    history: List[HistoryEntry] = []


class GenerateReplyResponse(BaseModel):
    project_id: str
    draft: str
