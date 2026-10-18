# ScopeShield

Freelancer'lar için **yerel Gemma destekli kapsam kayması (scope creep) asistanı**.
Müşteri "bir şey daha ekleyelim" dediğinde, bunun anlaşmanın içinde mi dışında mı olduğunu saniyeler içinde gösterir ve kibar bir yanıt taslağı hazırlar.

## Ne yapar?
1. **Kapsam çıkarma:** İlk anlaşma/teklif metninden yapılandırılmış bir kapsam kartı çıkarır (teslimatlar, dahil olanlar, hariç olanlar, müşteri sorumlulukları, revizyon hakkı, belirsizlikler). Kullanıcı kartı düzenleyip onaylar.
2. **Talep karşılaştırma:** Müşterinin yeni mesajındaki her isteği onaylı kapsamla karşılaştırır:
   - `in_scope`: Kapsamla uyumlu
   - `extra_work`: Olası ek iş
   - `ambiguous`: Belirsiz (netleştirme sorusu üretilir)
3. **Yanıt taslağı:** Müşteriye gönderilebilecek, düzenlenebilir bir taslak üretir (resmi veya samimi üslup). Ücret ve süre tahmini yapmaz.
4. **Çoklu müşteri:** Her müşterinin kapsamı ve mesaj geçmişi ayrı tutulur; paralel projeler birbirine karışmaz.

**Gizlilik:** Tüm işlemler yereldir. Sözleşme metinleri ve müşteri mesajları bilgisayarınızdan çıkmaz; model Ollama ile yerelde çalışır.

## Teknoloji
- Model: Gemma 4 (`gemma4:e4b`), Ollama üzerinden yerel
- Backend: Python 3.10+ ve FastAPI
- Frontend: Saf HTML / CSS / JS (derleme adımı yok)
- Veri: Müşteri kayıtları tarayıcının `localStorage` alanında tutulur (veritabanı yok)

## Gereksinimler
- [Ollama](https://ollama.com) kurulu ve çalışıyor olmalı
- Python 3.10 veya üzeri

## Kurulum ve çalıştırma
```bash
# 1) Modeli indir (bir kez)
ollama pull gemma4:e4b

# 2) Ollama'nın açık olduğundan emin ol (kapalıysa)
ollama serve

# 3) Bağımlılıkları kur
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 4) Uygulamayı başlat
cd backend
python main.py
```
Ardından tarayıcıda **http://localhost:8000** adresini açın.

İlk istek modeli belleğe yüklediği için daha yavaş olabilir. Sunumdan önce `ollama run gemma4:e4b "test"` ile modeli ısıtmanız önerilir. Normal yanıt süresi istek başına yaklaşık 5-12 saniyedir.

Ollama kapalıysa arayüzde kırmızı uyarı bandı ve "Ollama'ya bağlanılamadı" bildirimi görünür.

## API
Etkileşimli dokümantasyon: http://localhost:8000/docs

| Metot | Yol | Açıklama |
|---|---|---|
| GET | `/health` | Backend ve Ollama durumu |
| POST | `/extract-scope` | Anlaşma metninden kapsam kartı çıkarır |
| POST | `/compare-request` | Yeni müşteri mesajını onaylı kapsamla karşılaştırır (`history` son 10 mesajla sınırlanır) |
| POST | `/generate-reply` | Karşılaştırma sonucuna göre yanıt taslağı üretir (`style`: `professional` veya `friendly`) |

Hata durumunda `detail` alanında açıklayıcı bir Türkçe mesaj döner (ör. boş metin için 400, eksik `project_id` için 422, Ollama kapalıysa 500).

## Klasör yapısı
```
backend/
  main.py            FastAPI uygulaması ve endpoint'ler
  models.py          Pydantic istek/yanıt modelleri
  prompt_runner.py   Prompt'ları doldurur, model çıktısını doğrular
  ollama_client.py   Ollama HTTP istemcisi
  prompts/           extract_scope, compare_requests, generate_reply
frontend/
  index.html, style.css, app.js
```

## Bilinen sınırlar
Kullanıcı girişi, otomatik mesaj gönderme, ücret/süre tahmini, WhatsApp/e-posta entegrasyonu, veritabanı ve gerçek zamanlı işbirliği bu sürümde yoktur. Model çıktısı bir hukuki danışmanlık değildir; sonuçlar kullanıcı tarafından kontrol edilmelidir.

## GitHub Copilot kullanımı
<!-- TAKIM DOLDURACAK: Copilot'un hangi işlerde kullanıldığını gerçeğe uygun şekilde yazın. -->
- Backend (Salih): _doldurulacak_
- Prompt ve model entegrasyonu (Yusuf): _doldurulacak_
- Frontend (Mustafa): _doldurulacak_

## Ekip
**TripleCore**: Mehmet Salih Sincar (API/entegrasyon), Yusuf Ayna (Gemma/prompt), Mustafa Pekacar (frontend)

## Lisans
[MIT](LICENSE)
