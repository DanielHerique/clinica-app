// js/main.js
// ======================================================================
// Controle de navegação e carregamento de páginas (SPA)
// Usa loader/toast do helpers quando disponíveis
// ======================================================================

(function () {
  const APP = (window.APP = window.APP || {});

  document.addEventListener("DOMContentLoaded", () => {
    const content = document.getElementById("content");

    const btnAgenda = document.getElementById("btnAgenda");
    const btnPacientes = document.getElementById("btnPacientes");
    const btnFiscal = document.getElementById("btnFiscal");
    const btnNFe = document.getElementById("btnNFe");
    const navButtons = [btnAgenda, btnPacientes, btnFiscal, btnNFe];

    // ---- SHIMS p/ não quebrar se helpers não definir
    APP.showGlobalLoading = APP.showGlobalLoading || function () {};
    APP.hideGlobalLoading  = APP.hideGlobalLoading  || function () {};

    // ---------------- Loader fallback (caso helpers ainda não esteja)
    let localLoader;
    function ensureLocalLoader() {
      if (document.getElementById("globalLoader")) return;
      const el = document.createElement("div");
      el.id = "globalLoader";
      el.style.cssText =
        "position:fixed;inset:0;background:rgba(255,255,255,.65);display:none;align-items:center;justify-content:center;z-index:9999;";
      el.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;gap:10px;"><div class="spinner" style="width:40px;height:40px;border:4px solid #cbd5e1;border-top:4px solid #2563eb;border-radius:50%;animation:spin .8s linear infinite;"></div><span style="font-weight:600;color:#1f2937;">Carregando...</span></div>';
      document.body.appendChild(el);
      localLoader = el;
      const st = document.createElement("style");
      st.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(st);
    }
    function showLocalLoader() { ensureLocalLoader(); localLoader.style.display = "flex"; }
    function hideLocalLoader() { ensureLocalLoader(); localLoader.style.display = "none"; }

    // Wrapper de loading preferindo o helpers
    async function withLoading(fn) {
      if (typeof APP.withGlobalLoading === "function") {
        return APP.withGlobalLoading(fn);
      }
      showLocalLoader();
      try { return await fn(); } finally { hideLocalLoader(); }
    }

    // Toast simples fallback
    if (typeof APP.showToast !== "function") {
      const toast = document.createElement("div");
      toast.style.cssText =
        "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;opacity:0;transition:opacity .3s;z-index:10000;";
      document.body.appendChild(toast);
      APP.showToast = (msg) => {
        toast.textContent = msg;
        toast.style.opacity = "1";
        setTimeout(() => (toast.style.opacity = "0"), 2500);
      };
    }

    // -----------------------------------------
    // Navegação
    // -----------------------------------------
    function setActive(key) {
      navButtons.forEach((b) => b.classList.remove("active"));
      if (key === "agenda") btnAgenda.classList.add("active");
      if (key === "pacientes") btnPacientes.classList.add("active");
      if (key === "fiscal") btnFiscal.classList.add("active");
      if (key === "nfe") btnNFe.classList.add("active");
    }

    async function loadPage(key) {
      setActive(key);
      // Os módulos registram em window.Pages
      const fn = window.Pages && typeof window.Pages[key] === "function" ? window.Pages[key] : null;
      if (!fn) { content.innerHTML = "<p>Página não encontrada.</p>"; return; }
      await withLoading(async () => { await fn(content); });
    }

    btnAgenda.addEventListener("click", () => loadPage("agenda"));
    btnPacientes.addEventListener("click", () => loadPage("pacientes"));
    btnFiscal.addEventListener("click", () => loadPage("fiscal"));
    btnNFe.addEventListener("click", () => loadPage("nfe"));

    // inicializa na Agenda
    loadPage("agenda");
  });
})();
