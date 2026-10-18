/**
 * ScopeShield — Frontend Uygulama Mantığı (app.js)
 * Mimari: Çoklu Proje İzolasyonu, Gemma 4 (Ollama) / FastAPI Entegrasyonu,
 * Yarış Durumu (Race Condition) Koruması, Jüri Demosu & LocalStorage
 */

const API_BASE = "http://localhost:8000";

// =============================================================================
// 1. SALİH & YUSUF'UN PROJE VE VERİ YÖNETİM MODÜLÜ (TAM ENTEGRASYON)
// =============================================================================

function loadProjects() {
  return JSON.parse(localStorage.getItem("projects") || "{}");
}

function saveProjects(p) {
  localStorage.setItem("projects", JSON.stringify(p));
}

function getActiveId() {
  return localStorage.getItem("activeProjectId");
}

function setActiveId(id) {
  localStorage.setItem("activeProjectId", id);
}

function getActiveProject() {
  return loadProjects()[getActiveId()] || null;
}

function createProject(clientName, projectTitle) {
  const id = "p_" + Date.now();
  const projects = loadProjects();
  projects[id] = {
    id,
    client_name: clientName,
    project_title: projectTitle,
    created_at: new Date().toISOString(),
    raw_agreement: "",
    approved_scope: null,
    last_analysis: [],
    reply_draft: "",
    reply_style: "professional",
    history: []
  };
  saveProjects(projects);
  setActiveId(id);
  return projects[id];
}

function updateProject(id, patch) {
  const projects = loadProjects();
  if (!projects[id]) return;
  projects[id] = { ...projects[id], ...patch };
  saveProjects(projects);
}

function addHistory(id, role, text) {
  const projects = loadProjects();
  if (!projects[id]) return;
  if (!Array.isArray(projects[id].history)) projects[id].history = [];
  projects[id].history.push({ role, text, date: new Date().toISOString() });
  saveProjects(projects);
}

function deleteProject(id) {
  const projects = loadProjects();
  delete projects[id];
  saveProjects(projects);
  if (getActiveId() === id) {
    const remainingIds = Object.keys(projects);
    if (remainingIds.length > 0) {
      setActiveId(remainingIds[0]);
    } else {
      localStorage.removeItem("activeProjectId");
    }
  }
}

// =============================================================================
// 2. YUSUF'UN GELİŞTİRDİĞİ YENİ API İSTEK FONKSİYONU (RACE-CONDITION KORUMALI)
// =============================================================================

async function analyzeMessage(newMessage) {
  const project = getActiveProject();
  if (!project?.approved_scope) throw new Error("Önce bu müşteri için kapsamı onaylayın.");

  const res = await fetch(`${API_BASE}/compare-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: project.id,
      client_name: project.client_name,
      approved_scope: project.approved_scope,
      new_message: newMessage,
      history: (project.history || []).slice(-10)
    }),
    signal: AbortSignal.timeout(60000)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Karşılaştırma yapılamadı.");
  }
  const data = await res.json();

  // Kullanıcı bu sırada müşteri değiştirdiyse sonucu ekrana basma, ama geçmişe kaydet
  const targetId = data.project_id || project.id;
  addHistory(targetId, "client", newMessage);
  if (targetId !== getActiveId()) {
    updateProject(targetId, { last_analysis: data.items || [] });
    return null;
  }
  return data;
}

// =============================================================================
// 3. JÜRİ DEMO SENARYOSU VERİLERİ
// =============================================================================
const DEMO_SCENARIO = {
  clientName: "Ahmet Yılmaz",
  projectTitle: "Kurumsal Tanıtım Sitesi",
  scopeText: `Beş sayfalık kurumsal tanıtım sitesi hazırlanacak.
Mobil uyumlu responsive tasarım ve iletişim formu dahil.
E-ticaret modülü ve üyelik sistemi kesinlikle dahil değildir.
Site içerikleri (metinler, fotoğraflar ve kurumsal logo) müşteri tarafından eksiksiz sağlanacaktır.
Tasarım onayından sonra en fazla iki (2) tur görsel revizyon hakkı bulunmaktadır.`,
  extractedScope: {
    deliverables: ["Beş sayfalık kurumsal tanıtım sitesi"],
    included: ["Mobil uyumlu responsive tasarım", "İletişim formu"],
    excluded: ["E-ticaret modülü", "Üyelik sistemi"],
    client_responsibilities: ["Site içeriklerinin (metin, görsel, logo) sağlanması"],
    revisions: "İki (2) tur görsel revizyon",
    ambiguities: ["Teslim süresi ve barındırma (hosting) detayları belirtilmemiş"]
  },
  requestText: `Merhaba, siteye bir de üyelik sistemi ve online ürün satışı ekleyelim. Bir de ana sayfadaki butonların rengini yeşil yapabilir miyiz? Ayrıca tasarımı biraz daha modern ve havalı gösterelim.`,
  analysisResults: [
    {
      request: "Buton renginin yeşil yapılması",
      verdict: "in_scope",
      reasoning: "Görsel değişiklik talebi, anlaşmadaki 2 tur revizyon hakkı kapsamındadır.",
      source_quote: "En fazla iki (2) tur görsel revizyon hakkı bulunmaktadır.",
      clarifying_question: null
    },
    {
      request: "Üyelik sistemi eklenmesi",
      verdict: "extra_work",
      reasoning: "Üyelik sistemi ilk anlaşmada açık bir biçimde kapsam dışı bırakılmıştır.",
      source_quote: "Üyelik sistemi kesinlikle dahil değildir.",
      clarifying_question: null
    },
    {
      request: "Online ürün satışı (E-ticaret)",
      verdict: "extra_work",
      reasoning: "E-ticaret modülü ilk sözleşmede kapsam dışında tutulmuştur.",
      source_quote: "E-ticaret modülü kesinlikle dahil değildir.",
      clarifying_question: null
    },
    {
      request: "Tasarımın daha modern ve havalı gösterilmesi",
      verdict: "ambiguous",
      reasoning: "Talep subjektif ve soyuttur; hangi sayfaların veya bileşenlerin kastedildiği net değildir.",
      source_quote: "",
      clarifying_question: "Tasarımda beğendiğiniz bir örnek referans site veya spesifik olarak değişmesini istediğiniz bir bölüm var mıdır?"
    }
  ],
  replyDrafts: {
    professional: `Merhaba Ahmet Bey,

Taleplerinizi aldım ve proje kapsamımız çerçevesinde inceledim:

1. Buton renklerinin revizyonunu mevcut iki turluk görsel revizyon hakkımız kapsamında memnuniyetle uygulayabiliriz.
2. Üyelik sistemi ve online ürün satışı özellikleri, ilk iş anlaşmamızda açıkça kapsam dışında tutulmuştu. Bu geliştirmeleri mevcut projeyi aksatmamak adına ayrı bir ek geliştirme paketi ve bütçesi olarak değerlendirmeyi öneriyorum.
3. Tasarımın daha modern hale getirilmesi talebinizi netleştirebilmemiz için beğendiğiniz örnek bir referans bağlantısı paylaşabilirseniz revizyon hakkınız dahilinde değerlendirebiliriz.

Görüşlerinizi bekler, iyi çalışmalar dilerim.`,
    friendly: `Selamlar Ahmet Bey,

Mesajınızı aldım! Buton renklerini yeşil yapmak çok basit, revizyon hakkımız dahilinde hemen hallederim.

Üyelik sistemi ve ürün satışı ise ilk konuştuğumuz 5 sayfalık tanıtım sitesi kapsamının dışında kalıyor. Bu özellikleri ikinci fazda veya ayrı bir ek paket olarak konuşabiliriz; böylece yayına çıkış tarihimiz de gecikmez.

Tasarımı biraz daha parlatmak için de kafanızdaki tarzı gösteren bir örnek link atabilirseniz harika olur.

Nasıl ilerleyelim?`
  }
};

// Global UI State
let state = {
  activeTab: 1,
  isBackendOnline: false,
  currentTheme: "dark"
};

// =============================================================================
// 4. BAŞLANGIÇ & YAŞAM DÖNGÜSÜ
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initStorage();
  initEventListeners();
  checkBackendHealth();
  setInterval(checkBackendHealth, 15000);
});

function initTheme() {
  const savedTheme = localStorage.getItem("scopeshield_theme") || "dark";
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  state.currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("scopeshield_theme", theme);

  const sunIcon = document.querySelector(".theme-icon-sun");
  const moonIcon = document.querySelector(".theme-icon-moon");
  const themeText = document.getElementById("theme-text");

  if (theme === "light") {
    if (sunIcon) sunIcon.style.display = "inline-block";
    if (moonIcon) moonIcon.style.display = "none";
    if (themeText) themeText.textContent = "Açık";
  } else {
    if (sunIcon) sunIcon.style.display = "none";
    if (moonIcon) moonIcon.style.display = "inline-block";
    if (themeText) themeText.textContent = "Koyu";
  }
}

function toggleTheme() {
  const nextTheme = state.currentTheme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  showToast(nextTheme === "light" ? "☀️ Açık Temaya Geçildi" : "🌙 Koyu Temaya Geçildi", "info");
}

function initStorage() {
  const projects = loadProjects();
  const projectIds = Object.keys(projects);

  // Eğer sistemde hiç proje yoksa, jüri sunumu ve test için örnek Ahmet Yılmaz projesini oluştur
  if (projectIds.length === 0) {
    const demoProj = createProject(DEMO_SCENARIO.clientName, DEMO_SCENARIO.projectTitle);
    updateProject(demoProj.id, {
      raw_agreement: DEMO_SCENARIO.scopeText,
      approved_scope: DEMO_SCENARIO.extractedScope,
      last_analysis: DEMO_SCENARIO.analysisResults,
      reply_draft: DEMO_SCENARIO.replyDrafts.professional
    });
    addHistory(demoProj.id, "system", "İlk anlaşma kapsamı onaylandı.");
  } else if (!getActiveId() || !projects[getActiveId()]) {
    setActiveId(projectIds[0]);
  }

  renderClientList();
  renderActiveProjectView();
}

// =============================================================================
// 5. ETKİLEŞİM VE DİNLENENLER (EVENT LISTENERS)
// =============================================================================
function initEventListeners() {
  // Tema Değiştirme Butonu
  const themeBtn = document.getElementById("btn-theme-toggle");
  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

  // Sekme Geçiş Butonları
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabNum = parseInt(btn.getAttribute("data-tab"));
      switchTab(tabNum);
    });
  });

  // Yeni Müşteri Modal
  document.getElementById("btn-open-new-client").addEventListener("click", openNewClientModal);
  document.getElementById("btn-save-new-client").addEventListener("click", handleSaveNewClient);

  // --- SEKME 1 DİNLENENLERİ ---
  document.getElementById("btn-extract-scope").addEventListener("click", handleExtractScope);
  document.getElementById("btn-approve-scope").addEventListener("click", handleApproveScope);

  // --- SEKME 2 DİNLENENLERİ ---
  document.getElementById("btn-compare-request").addEventListener("click", handleCompareRequest);
  document.getElementById("btn-proceed-to-reply").addEventListener("click", () => switchTab(3));

  // --- SEKME 3 DİNLENENLERİ ---
  document.querySelectorAll('input[name="reply-style"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      document.getElementById("label-style-prof").classList.toggle("active", e.target.value === "professional");
      document.getElementById("label-style-friendly").classList.toggle("active", e.target.value === "friendly");
    });
  });

  document.getElementById("btn-generate-reply").addEventListener("click", handleGenerateReply);
  document.getElementById("btn-copy-reply").addEventListener("click", handleCopyReply);

  // Yanıtı Zaman Tüneline Kaydet Butonu
  const saveReplyBtn = document.getElementById("btn-save-reply-history");
  if (saveReplyBtn) saveReplyBtn.addEventListener("click", handleSaveReplyToHistory);
}

// =============================================================================
// 6. BACKEND SAĞLIK KONTROLÜ (HEALTH CHECK)
// =============================================================================
async function checkBackendHealth() {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  const ollamaBanner = document.getElementById("ollama-offline-banner");

  try {
    const res = await fetch(`${API_BASE}/health`, { method: "GET", signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));

      // Ollama bağlantısı kontrolü
      if (data.ollama && data.ollama !== "connected") {
        state.isBackendOnline = false;
        if (dot) dot.className = "status-dot status-offline";
        if (text) text.textContent = "Backend: Ollama Kapalı ⚠️";
        if (ollamaBanner) ollamaBanner.style.display = "flex";
        return;
      }

      state.isBackendOnline = true;
      if (dot) dot.className = "status-dot status-online";
      if (text) text.textContent = `Backend: Bağlı (${data.model || "Gemma 4"})`;
      if (ollamaBanner) ollamaBanner.style.display = "none";
      return;
    } else {
      const errData = await res.json().catch(() => ({}));
      state.isBackendOnline = false;
      if (dot) dot.className = "status-dot status-offline";
      if (text) text.textContent = errData.detail || "Backend: Hata Veriyor ⚠️";
      if (ollamaBanner) ollamaBanner.style.display = "flex";
      return;
    }
  } catch (err) {
    // Backend servisi kapalı veya yanıt vermiyor
  }

  state.isBackendOnline = false;
  if (dot) dot.className = "status-dot status-offline";
  if (text) text.textContent = "Backend: Bağlantı Yok (8000)";
  if (ollamaBanner) ollamaBanner.style.display = "none";
}

// =============================================================================
// 7. ARAYÜZ LİSTELEME & AKTİF PROJE GÖRÜNÜMÜ
// =============================================================================
function renderClientList() {
  const container = document.getElementById("client-list");
  container.innerHTML = "";

  const projects = loadProjects();
  const projectList = Object.values(projects).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const activeId = getActiveId();

  document.getElementById("client-count").textContent = projectList.length;

  projectList.forEach(project => {
    const item = document.createElement("div");
    item.className = `client-item ${project.id === activeId ? "active" : ""}`;

    const hasApprovedScope = project.approved_scope && project.approved_scope.deliverables && project.approved_scope.deliverables.length > 0;
    const badgeHtml = hasApprovedScope
      ? `<span class="badge badge-success" title="Kapsam onaylandı">🟢 Onaylı</span>`
      : `<span class="badge badge-gray" title="Henüz kapsam çıkarılmadı">⚪ Kapsamsız</span>`;

    item.innerHTML = `
      <div class="client-item-info">
        <span class="client-item-name">${escapeHtml(project.client_name)}</span>
        <span class="client-item-project">${escapeHtml(project.project_title || "Genel")}</span>
      </div>
      <div class="client-item-meta">
        ${badgeHtml}
        <button class="btn-delete-client" title="Projeyi Sil" onclick="handleDeleteClientClick(event, '${project.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `;

    item.addEventListener("click", () => {
      setActiveId(project.id);
      renderClientList();
      renderActiveProjectView();
      showToast(`Aktif müşteri: ${project.client_name}`, "success");
    });

    container.appendChild(item);
  });
}

function renderActiveProjectView() {
  const project = getActiveProject();
  if (!project) {
    document.getElementById("topbar-client-name").textContent = "Seçili Müşteri Yok";
    document.getElementById("topbar-project-name").textContent = "Lütfen sol taraftan bir müşteri seçin veya ekleyin.";
    document.getElementById("topbar-scope-badge").className = "badge badge-gray";
    document.getElementById("topbar-scope-badge").textContent = "Kapsamsız";
    return;
  }

  // Topbar Başlık Bilgisi
  document.getElementById("topbar-client-name").textContent = project.client_name;
  document.getElementById("topbar-project-name").textContent = project.project_title || "Kurumsal Proje";

  // Avatar Harfleri
  const initials = project.client_name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase() || "TK";
  document.getElementById("topbar-avatar").textContent = initials;

  const hasApprovedScope = project.approved_scope && project.approved_scope.deliverables?.length > 0;
  const badge = document.getElementById("topbar-scope-badge");
  if (hasApprovedScope) {
    badge.className = "badge badge-success";
    badge.textContent = "Kapsam Onaylı";
  } else {
    badge.className = "badge badge-gray";
    badge.textContent = "Kapsamsız";
  }

  // SEKME 1: Kapsam Görünümü
  document.getElementById("scope-raw-text").value = project.raw_agreement || "";
  if (project.approved_scope) {
    renderScopeEditor(project.approved_scope);
  } else {
    document.getElementById("scope-editor-container").style.display = "none";
    document.getElementById("scope-empty-placeholder").style.display = "block";
    document.getElementById("scope-status-tag").className = "badge badge-gray";
    document.getElementById("scope-status-tag").textContent = "Henüz Çıkarılmadı";
  }

  // SEKME 2: Talep Karşılaştırma Görünümü
  const historyClientMsgs = (project.history || []).filter(h => h.role === "client");
  const lastClientMsg = historyClientMsgs.length > 0 ? historyClientMsgs[historyClientMsgs.length - 1].text : "";
  document.getElementById("request-raw-text").value = lastClientMsg || "";

  if (hasApprovedScope) {
    document.getElementById("tab2-no-scope-warning").style.display = "none";
    document.getElementById("summary-scope-title").textContent = `${project.client_name} — ${project.project_title}`;
    document.getElementById("summary-scope-details").textContent =
      `${project.approved_scope.deliverables.length} teslimat, ${project.approved_scope.included.length} dahil, ${project.approved_scope.excluded.length} hariç madde onaylı.`;
  } else {
    document.getElementById("tab2-no-scope-warning").style.display = "block";
  }

  if (project.last_analysis && project.last_analysis.length > 0) {
    renderAnalysisResults(project.last_analysis);
  } else {
    document.getElementById("analysis-results-section").style.display = "none";
  }

  // SEKME 3: Yanıt Taslağı
  document.getElementById("reply-draft-text").value = project.reply_draft || "";
  renderReplyBasisSummary(project.last_analysis || []);

  // Müşteri Zaman Tüneli
  renderCustomerTimeline();

  updateTabIndicators();
}

function updateTabIndicators() {
  const project = getActiveProject();
  if (!project) return;

  const tab1Dot = document.getElementById("tab1-status");
  const tab2Dot = document.getElementById("tab2-status");
  const tab3Dot = document.getElementById("tab3-status");

  tab1Dot.className = (project.approved_scope && project.approved_scope.deliverables?.length > 0)
    ? "tab-indicator indicator-done" : "tab-indicator indicator-empty";

  tab2Dot.className = (project.last_analysis && project.last_analysis.length > 0)
    ? "tab-indicator indicator-done" : "tab-indicator indicator-empty";

  tab3Dot.className = (project.reply_draft && project.reply_draft.trim().length > 0)
    ? "tab-indicator indicator-done" : "tab-indicator indicator-empty";
}

// =============================================================================
// 8. YENİ MÜŞTERİ MODAL İŞLEMLERİ
// =============================================================================
function openNewClientModal() {
  document.getElementById("modal-input-name").value = "";
  document.getElementById("modal-input-project").value = "";
  document.getElementById("modal-new-client").style.display = "flex";
  document.getElementById("modal-input-name").focus();
}

function closeNewClientModal() {
  document.getElementById("modal-new-client").style.display = "none";
}

function handleSaveNewClient() {
  const name = document.getElementById("modal-input-name").value.trim();
  const project = document.getElementById("modal-input-project").value.trim();

  if (!name) {
    showToast("Lütfen müşteri veya şirket adını girin.", "error");
    return;
  }

  createProject(name, project || "Genel Proje");
  closeNewClientModal();
  renderClientList();
  renderActiveProjectView();
  switchTab(1);

  showToast(`"${name}" müşterisi oluşturuldu. Kapsam metnini girebilirsiniz!`, "success");
}

function handleDeleteClientClick(e, clientId) {
  e.stopPropagation();
  if (!confirm("Bu projeyi ve tüm geçmişini silmek istediğinize emin misiniz?")) return;

  deleteProject(clientId);
  renderClientList();
  renderActiveProjectView();
  showToast("Proje kaydı silindi.", "warning");
}

// =============================================================================
// 9. SEKME GEÇİŞİ (TAB NAVIGATION)
// =============================================================================
function switchTab(tabNumber) {
  state.activeTab = tabNumber;

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", parseInt(btn.getAttribute("data-tab")) === tabNumber);
  });

  document.querySelectorAll(".tab-pane").forEach(pane => {
    pane.classList.remove("active");
  });

  const activePane = document.getElementById(`tab-pane-${tabNumber}`);
  if (activePane) activePane.classList.add("active");

  if (tabNumber === 3) {
    const project = getActiveProject();
    renderReplyBasisSummary(project?.last_analysis || []);
  }
}

// =============================================================================
// 10. SEKME 1: KAPSAM ÇIKARMA & ONAYLAMA
// =============================================================================
let currentEditingScope = null;

async function handleExtractScope() {
  const project = getActiveProject();
  if (!project) {
    showToast("Lütfen önce bir müşteri seçin.", "error");
    return;
  }

  const text = document.getElementById("scope-raw-text").value.trim();
  if (!text) {
    showToast("Lütfen önce bir anlaşma veya teklif metni girin.", "error");
    return;
  }

  const btn = document.getElementById("btn-extract-scope");
  setLoading(btn, true, "Gemma Kapsamı Çıkarıyor...");

  try {
    const res = await fetch(`${API_BASE}/extract-scope`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        text: text
      }),
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Kapsam çıkarılamadı.");
    }
    const scopeData = await res.json();

    currentEditingScope = scopeData;
    renderScopeEditor(scopeData);
    updateProject(project.id, { raw_agreement: text });

    showToast("Kapsam başarıyla ayrıştırıldı! Şimdi kontrol edip onaylayabilirsiniz.", "success");
  } catch (err) {
    console.error(err);
    checkBackendHealth();
    const isConnErr = err.name === "AbortError" || err.message.includes("fetch") || err.message.includes("Failed to fetch") || err.message.includes("NetworkError");
    const userMsg = isConnErr
      ? "Backend veya Gemma servisine ulaşılamadı. Lütfen 'uvicorn main:app' ve 'ollama serve' çalıştığından emin olun."
      : (err.message || "Kapsam çıkarılamadı.");
    showToast(userMsg, "error");
  } finally {
    setLoading(btn, false, "Gemma 4 ile Kapsamı Çıkar");
  }
}

function renderScopeEditor(scope) {
  currentEditingScope = scope;
  document.getElementById("scope-empty-placeholder").style.display = "none";
  document.getElementById("scope-editor-container").style.display = "block";

  const statusTag = document.getElementById("scope-status-tag");
  statusTag.className = "badge badge-success";
  statusTag.textContent = "Ayrıştırıldı & Hazır";

  renderTagList("deliverables", scope.deliverables || []);
  renderTagList("included", scope.included || []);
  renderTagList("excluded", scope.excluded || []);
  renderTagList("client_responsibilities", scope.client_responsibilities || []);
  renderTagList("ambiguities", scope.ambiguities || []);

  document.getElementById("input-revisions").value = scope.revisions || "";
}

function renderTagList(key, items) {
  const container = document.getElementById(`list-${key}`);
  if (!container) return;
  container.innerHTML = "";

  items.forEach((item, index) => {
    const el = document.createElement("div");
    el.className = "tag-item";
    el.innerHTML = `
      <span class="tag-text">${escapeHtml(item)}</span>
      <button type="button" class="btn-remove-tag" onclick="removeTag('${key}', ${index})">&times;</button>
    `;
    container.appendChild(el);
  });
}

function addTagFromInput(key) {
  const input = document.getElementById(`input-new-${key}`);
  const val = input.value.trim();
  if (!val) return;

  if (!currentEditingScope) currentEditingScope = {};
  if (!Array.isArray(currentEditingScope[key])) currentEditingScope[key] = [];

  currentEditingScope[key].push(val);
  renderTagList(key, currentEditingScope[key]);
  input.value = "";
}

function removeTag(key, index) {
  if (currentEditingScope && currentEditingScope[key]) {
    currentEditingScope[key].splice(index, 1);
    renderTagList(key, currentEditingScope[key]);
  }
}

function handleApproveScope() {
  const project = getActiveProject();
  if (!project) return;

  if (!currentEditingScope) {
    showToast("Lütfen önce kapsamı çıkarın.", "error");
    return;
  }

  currentEditingScope.revisions = document.getElementById("input-revisions").value.trim();
  const rawText = document.getElementById("scope-raw-text").value.trim();

  updateProject(project.id, {
    approved_scope: JSON.parse(JSON.stringify(currentEditingScope)),
    raw_agreement: rawText
  });
  addHistory(project.id, "system", "İş kapsamı onaylandı.");

  renderClientList();
  renderActiveProjectView();

  showToast("Kapsam onaylandı ve bu müşteriye kaydedildi! Adım 2'ye geçiliyor...", "success");

  setTimeout(() => {
    switchTab(2);
  }, 600);
}

// =============================================================================
// 11. SEKME 2: TALEP ANALİZİ (YUSUF'UN MANTIĞIYLA VE YARIŞ KORUMASIYLA)
// =============================================================================
async function handleCompareRequest() {
  const project = getActiveProject();
  if (!project?.approved_scope) {
    showToast("Önce bu müşteri için kapsamı onaylayın.", "error");
    return;
  }

  const message = document.getElementById("request-raw-text").value.trim();
  if (!message) {
    showToast("Lütfen müşteriden gelen istek mesajını girin.", "error");
    return;
  }

  const btn = document.getElementById("btn-compare-request");
  setLoading(btn, true, "Gemma Talepleri Kapsamla Kıyaslıyor...");

  try {
    const data = await analyzeMessage(message);

    if (!data) {
      // Kullanıcı istek sürerken başka müşteriye geçtiyse
      showToast("Analiz tamamlandı ve ilgili müşterinin profiline işlendi.", "info");
      return;
    }

    // Aktif müşteri aynı kaldıysa sonuçları ekrana bas ve kaydet
    const targetId = data.project_id || project.id;
    updateProject(targetId, {
      last_analysis: data.items || []
    });

    renderAnalysisResults(data.items || []);
    updateTabIndicators();
    showToast(`${(data.items || []).length} adet talep başarıyla analiz edildi!`, "success");
  } catch (err) {
    console.error(err);
    checkBackendHealth();
    const isConnErr = err.name === "AbortError" || err.message.includes("fetch") || err.message.includes("Failed to fetch") || err.message.includes("NetworkError");
    const userMsg = isConnErr
      ? "Backend veya Gemma servisine ulaşılamadı. Lütfen 'uvicorn main:app' ve 'ollama serve' çalıştığından emin olun."
      : (err.message || "Talepler analiz edilemedi.");
    showToast(userMsg, "error");
  } finally {
    setLoading(btn, false, "Talepleri Kapsamla Karşılaştır & Analiz Et");
  }
}

function renderAnalysisResults(items) {
  const container = document.getElementById("analysis-items-container");
  const section = document.getElementById("analysis-results-section");
  const countBadge = document.getElementById("analysis-count-badge");

  container.innerHTML = "";
  if (!items || items.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  countBadge.textContent = `${items.length} Talep Değerlendirildi`;

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = `verdict-card verdict-${item.verdict}`;

    let badgeText = "🟢 Kapsam İçi";
    let badgeClass = "badge-success";
    if (item.verdict === "extra_work") {
      badgeText = "🔴 Ek İş / Kapsam Dışı";
      badgeClass = "badge-danger";
    } else if (item.verdict === "ambiguous") {
      badgeText = "🟡 Belirsiz / Netleştirilmeli";
      badgeClass = "badge-warning";
    }

    const quoteHtml = item.source_quote
      ? `<div class="verdict-quote-box"><strong>Kapsamdaki Dayanak:</strong> "${escapeHtml(item.source_quote)}"</div>`
      : "";

    const questionHtml = item.clarifying_question
      ? `<div class="verdict-question-box"><strong>Müşteriye Sorulacak Soru:</strong> ${escapeHtml(item.clarifying_question)}</div>`
      : "";

    const promoteBtnHtml = item.verdict === "extra_work"
      ? `<div style="margin-top: 10px;">
           <button type="button" class="btn-promote-to-scope" onclick="promoteExtraWorkToScope('${escapeHtml(item.request).replace(/'/g, "\\'")}')">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
             Müşteriyle Anlaşıldı: Bu İşi Resmi Kapsama Ekle
           </button>
         </div>`
      : "";

    card.innerHTML = `
      <div class="verdict-header">
        <h4 class="verdict-request">${escapeHtml(item.request)}</h4>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="verdict-body">
        <p class="verdict-reasoning">${escapeHtml(item.reasoning)}</p>
        ${quoteHtml}
        ${questionHtml}
        ${promoteBtnHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

/**
 * Ek iş olarak tespit edilen bir talebi müşteriyle anlaşılması durumunda
 * resmi onaylı kapsama dahil eder ve sözleşmeyi otomatik revize eder.
 */
function promoteExtraWorkToScope(itemRequest) {
  const project = getActiveProject();
  if (!project || !project.approved_scope) return;

  if (!Array.isArray(project.approved_scope.included)) {
    project.approved_scope.included = [];
  }

  // Dahil olanlara ekle (daha önce eklenmediyse)
  if (!project.approved_scope.included.includes(itemRequest)) {
    project.approved_scope.included.push(itemRequest);
  }

  // Kapsam dışı listesinde varsa temizle
  if (Array.isArray(project.approved_scope.excluded)) {
    project.approved_scope.excluded = project.approved_scope.excluded.filter(
      ex => !ex.toLowerCase().includes(itemRequest.toLowerCase())
    );
  }

  // Son analiz listesinde bu maddenin durumunu "in_scope" olarak güncelle
  if (Array.isArray(project.last_analysis)) {
    project.last_analysis.forEach(it => {
      if (it.request.toLowerCase() === itemRequest.toLowerCase()) {
        it.verdict = "in_scope";
        it.reasoning = "Müşteri ile ek anlaşma yapılarak resmi sözleşme kapsamına dahil edildi.";
        it.source_quote = `Sonradan eklenen onaylı özellik: ${itemRequest}`;
      }
    });
  }

  // Zaman tüneline sistem revizyon kaydı düş
  addHistory(project.id, "system", `Sözleşme Revizyonu: "${itemRequest}" talebi onaylanarak resmi proje kapsamına dahil edildi.`);

  updateProject(project.id, {
    approved_scope: project.approved_scope,
    last_analysis: project.last_analysis
  });

  renderActiveProjectView();
  renderAnalysisResults(project.last_analysis);

  showToast(`"${itemRequest}" resmi kapsama dahil edildi! Sözleşme güncellendi.`, "success");
}

/**
 * Müşterinin tüm geçmiş mesajlarını, analizlerini ve sistem olaylarını zaman tünelinde listeler
 */
function renderCustomerTimeline() {
  const container = document.getElementById("customer-timeline-list");
  const countBadge = document.getElementById("history-count-badge");
  if (!container) return;

  const project = getActiveProject();
  if (!project || !project.history || project.history.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding: 16px;"><p>Bu müşteri için henüz kaydedilmiş bir mesaj veya analiz geçmişi bulunmuyor.</p></div>`;
    if (countBadge) countBadge.textContent = "0 Kayıt";
    return;
  }

  if (countBadge) countBadge.textContent = `${project.history.length} Kayıt`;
  container.innerHTML = "";

  // En yeni mesaj en üstte görünsün
  const sortedHistory = [...project.history].reverse();

  sortedHistory.forEach(item => {
    const el = document.createElement("div");
    el.className = `timeline-item timeline-role-${item.role}`;

    let roleIcon = "👤";
    let roleLabel = "Müşteri Talebi";
    if (item.role === "assistant") {
      roleIcon = "🤖";
      roleLabel = "Hazırlanan Yanıt Taslağı";
    } else if (item.role === "system") {
      roleIcon = "🛡️";
      roleLabel = "Sistem / Kapsam Güncellemesi";
    }

    const dateStr = item.date 
      ? new Date(item.date).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) 
      : "Az önce";

    el.innerHTML = `
      <div class="timeline-icon">${roleIcon}</div>
      <div class="timeline-body">
        <div class="timeline-header">
          <span class="timeline-role-label">${roleLabel}</span>
          <span class="timeline-date">${dateStr}</span>
        </div>
        <div class="timeline-text">${escapeHtml(item.text)}</div>
      </div>
    `;

    container.appendChild(el);
  });
}

function handleSaveReplyToHistory() {
  const project = getActiveProject();
  if (!project) return;

  const draftText = document.getElementById("reply-draft-text").value.trim();
  if (!draftText) {
    showToast("Zaman tüneline kaydedilecek bir yanıt taslağı bulunamadı.", "warning");
    return;
  }

  addHistory(project.id, "assistant", draftText);
  updateProject(project.id, { reply_draft: draftText });

  renderCustomerTimeline();
  showToast("Yanıt taslağı müşteri zaman tüneline mühürlendi ve kaydedildi!", "success");
}

// =============================================================================
// 12. SEKME 3: YANIT TASLAĞI ÜRETİMİ
// =============================================================================
function renderReplyBasisSummary(items) {
  const container = document.getElementById("reply-basis-summary");
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = `<span class="text-dim">Henüz Sekme 2'de bir analiz yapılmadı.</span>`;
    return;
  }

  const list = items.map(it => {
    const symbol = it.verdict === "in_scope" ? "🟢" : it.verdict === "extra_work" ? "🔴" : "🟡";
    return `<div>${symbol} <strong>${escapeHtml(it.request)}</strong> (${it.verdict})</div>`;
  }).join("");

  container.innerHTML = list;
}

async function handleGenerateReply() {
  const project = getActiveProject();
  if (!project?.approved_scope) {
    showToast("Lütfen önce kapsam oluşturun.", "error");
    return;
  }

  if (!project.last_analysis || project.last_analysis.length === 0) {
    showToast("Lütfen önce Sekme 2'de müşteri talebini analiz edin.", "warning");
    return;
  }

  const selectedStyle = document.querySelector('input[name="reply-style"]:checked')?.value || "professional";
  const btn = document.getElementById("btn-generate-reply");
  setLoading(btn, true, "Gemma Yanıt Taslağını Hazırlıyor...");

  try {
    let draft = "";
    const res = await fetch(`${API_BASE}/generate-reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: project.id,
        client_name: project.client_name,
        approved_scope: project.approved_scope,
        items: project.last_analysis,
        style: selectedStyle
      }),
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Yanıt taslağı üretilemedi.");
    }
    const data = await res.json();
    draft = data.draft || "";

    addHistory(project.id, "assistant", draft);
    updateProject(project.id, {
      reply_style: selectedStyle,
      reply_draft: draft
    });

    document.getElementById("reply-draft-text").value = draft;
    updateTabIndicators();
    showToast("Yanıt taslağı başarıyla oluşturuldu!", "success");
  } catch (err) {
    console.error(err);
    checkBackendHealth();
    const isConnErr = err.name === "AbortError" || err.message.includes("fetch") || err.message.includes("Failed to fetch") || err.message.includes("NetworkError");
    const userMsg = isConnErr
      ? "Backend veya Gemma servisine ulaşılamadı. Lütfen 'uvicorn main:app' ve 'ollama serve' çalıştığından emin olun."
      : (err.message || "Yanıt üretilemedi.");
    showToast(userMsg, "error");
  } finally {
    setLoading(btn, false, "Gemma 4 ile Yanıt Taslağı Üret");
  }
}

function handleCopyReply() {
  const text = document.getElementById("reply-draft-text").value;
  if (!text.trim()) {
    showToast("Kopyalanacak metin bulunamadı.", "error");
    return;
  }

  navigator.clipboard.writeText(text).then(() => {
    const btnText = document.getElementById("copy-btn-text");
    btnText.textContent = "Kopyalandı! ✓";
    showToast("Yanıt taslağı panoya kopyalandı!", "success");
    setTimeout(() => {
      btnText.textContent = "Panoya Kopyala";
    }, 2000);
  }).catch(() => {
    showToast("Kopyalama başarısız oldu, lütfen metni seçip kopyalayın.", "error");
  });
}

// =============================================================================
// 14. YARDIMCI ARAÇLAR (HELPERS)
// =============================================================================
function setLoading(button, isLoading, text) {
  if (!button) return;
  const spinner = button.querySelector(".btn-spinner");
  const icon = button.querySelector(".btn-icon");
  const textSpan = button.querySelector(".btn-text");

  button.disabled = isLoading;
  if (spinner) spinner.style.display = isLoading ? "inline-block" : "none";
  if (icon) icon.style.display = isLoading ? "none" : "inline-block";

  if (textSpan && text) {
    textSpan.textContent = text;
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon = type === "success" ? "✅" : type === "error" ? "❌" : type === "warning" ? "⚡" : "ℹ️";
  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
