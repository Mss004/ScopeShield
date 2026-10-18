import json
import re
import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma4:e4b"

def call_gemma(prompt: str, system_prompt: str = "") -> str:
    """Gemma'ya düz metin isteği gönderir."""
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "system": system_prompt,
        "stream": False,
        "options": {
            "temperature": 0.2
        }
    }
    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=120)
        response.raise_for_status()
        return response.json().get("response", "").strip()
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Ollama'ya bağlanılamadı! 'ollama serve' açık mı?")
    except Exception as e:
        raise RuntimeError(f"Ollama çağrı hatası: {str(e)}")

def call_gemma_json(prompt: str, system_prompt: str = "") -> dict:
    """Gemma'dan JSON çıktısı alır ve Python sözlüğüne çevirir."""
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "system": system_prompt,
        "format": "json",
        "stream": False,
        "options": {
            "temperature": 0.1
        }
    }
    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=120)
        response.raise_for_status()
        raw_text = response.json().get("response", "").strip()
        
        # Olası markdown taglerini temizle
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.MULTILINE)
        cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE).strip()
        
        return json.loads(cleaned)
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Ollama'ya bağlanılamadı! 'ollama serve' açık mı?")
    except json.JSONDecodeError:
        match = re.search(r"(\{.*\})", raw_text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except Exception:
                pass
        return {}
    except Exception as e:
        raise RuntimeError(f"JSON Çıktı Hatası: {str(e)}")