import json
import os
import re
from ollama_client import call_gemma, call_gemma_json

PROMPT_DIR = os.path.join(os.path.dirname(__file__), "prompts")

VALID_VERDICTS = {"in_scope", "extra_work", "ambiguous"}

def _normalize_verdict(verdict: str | None) -> str:
    """Verdict değerini geçerli şema değerlerinden birine normalize eder."""
    if not verdict or not isinstance(verdict, str):
        return "ambiguous"
    v = verdict.strip().lower()
    if v in VALID_VERDICTS:
        return v
    if v in {"in", "in-scope", "inscope", "dahil", "kapsam_ici", "kapsam içi"} or "in_scope" in v:
        return "in_scope"
    if v in {"extra", "extra-work", "extrawork", "out_of_scope", "out-of-scope", "kapsam_disi", "kapsam dışı"} or "extra" in v:
        return "extra_work"
    if v in {"belirsiz", "unclear", "unknown"} or "ambiguous" in v:
        return "ambiguous"
    return "ambiguous"

def load_prompt(name: str) -> str:
    """prompts klasöründeki metin dosyasını okur."""
    file_path = os.path.join(PROMPT_DIR, name)
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()

def extract_scope(text: str) -> dict:
    """İlk sözleşme metninden kapsamı JSON olarak çıkarır."""
    template = load_prompt("extract_scope.txt")
    prompt = template.replace("{{INPUT}}", text)
    return call_gemma_json(prompt)

def compare_requests(scope: dict, new_message: str, history: list | None = None) -> dict:
    """Onaylı kapsam ve varsa önceki yazışmalarla yeni müşteri talebini karşılaştırır."""
    template = load_prompt("compare_requests.txt")
    prompt = template.replace("{{SCOPE}}", json.dumps(scope, ensure_ascii=False))
    prompt = prompt.replace("{{NEW_MESSAGE}}", new_message)
    prompt = prompt.replace("{{HISTORY}}", json.dumps(history or [], ensure_ascii=False))
    result = call_gemma_json(prompt)
    if not isinstance(result, dict):
        result = {}
    items = result.get("items")
    if not isinstance(items, list):
        items = []
    for item in items:
        if isinstance(item, dict):
            item["verdict"] = _normalize_verdict(item.get("verdict"))
            if item.get("reasoning") is None:
                item["reasoning"] = ""
            if item.get("source_quote") is None:
                item["source_quote"] = ""
    result["items"] = items
    return result

def generate_reply(scope: dict, items: list, style: str, history: list | None = None) -> str:
    """Değerlendirme sonucuna göre müşteriye yanıt taslağı üretir."""
    template = load_prompt("generate_reply.txt")
    prompt = template.replace("{{SCOPE}}", json.dumps(scope, ensure_ascii=False))
    prompt = prompt.replace("{{ITEMS}}", json.dumps(items, ensure_ascii=False))
    prompt = prompt.replace("{{STYLE}}", style)
    prompt = prompt.replace("{{HISTORY}}", json.dumps(history or [], ensure_ascii=False))
    raw_reply = call_gemma(prompt)
    cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", raw_reply.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    cleaned = cleaned.strip("\"'“”").strip()
    return cleaned