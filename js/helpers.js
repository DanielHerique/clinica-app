// js/helpers.js
// ======================================================================
// Núcleo compartilhado: API, cache, estado de UI, utilitários, máscaras,
// toast, helper de fetch (api) e getters (pacientes/agenda/nfe).
// Tudo é exposto via window.APP para os demais módulos.
// ======================================================================

(function () {
  // Troque aqui se publicar nova versão do Apps Script
  const API_URL =
    "https://script.google.com/macros/s/AKfycbyh3YoV7WOCcC80KLTuaCQsXM-JrP9UryY2FTjVXuFMgdicjB-FrPzeKWsH5-c0tMWX/exec";

  // Cache em memória preenchido pelos getters
  const MEMORY = { pacientes: null, agenda: null, nfeRegistros: null };

  // Estado de UI compartilhado
  const UI = {
    pageSize: 25,
    currentPage: 1,
    searchTerm: "",
    statusFilter: "todos",
    agendaFilterClienteId: "todos",
    agendaFilterText: "",
    inflight: new Set(), // trava anti-duplo-clique (ids simbólicos)
  };

  // -------------------------------
  // Utils de data/texto
  // -------------------------------
  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function fromISODate(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  const normalizeText = (t) =>
    (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const onlyDigits = (s) => (s || "").replace(/\D/g, "");
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  // -------------------------------
  // Moeda BRL
  // -------------------------------
  function parseBRL(value) {
    if (typeof value === "number") return value;
    if (!value) return 0;
    return Number(String(value).replace(/[^\d,-]/g, "").replace(",", ".")) || 0;
  }
  function formatBRL(value) {
    const num = parseBRL(value);
    return num.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    });
  }

  // -------------------------------
  // Máscaras (para inputs)
  // -------------------------------
  function mascaraTelefone(el) {
    let v = onlyDigits(el.value).slice(0, 11);
    if (v.length > 10) el.value = v.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
    else if (v.length > 6) el.value = v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    else if (v.length > 2) el.value = v.replace(/^(\d{2})(\d{0,5}).*/, "($1) $2");
    else el.value = v ? `(${v}` : "";
  }
  function mascaraCPF(el) {
    let v = onlyDigits(el.value).slice(0, 11);
    if (v.length > 9) el.value = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2}).*/, "$1.$2.$3-$4");
    else if (v.length > 6) el.value = v.replace(/^(\d{3})(\d{3})(\d{0,3}).*/, "$1.$2.$3");
    else if (v.length > 3) el.value = v.replace(/^(\d{3})(\d{0,3}).*/, "$1.$2");
    else el.value = v;
  }
  function mascaraData(el) {
    let v = onlyDigits(el.value).slice(0, 8);
    if (v.length > 4) el.value = v.replace(/^(\d{2})(\d{2})(\d{0,4}).*/, "$1/$2/$3");
    else if (v.length > 2) el.value = v.replace(/^(\d{2})(\d{0,2}).*/, "$1/$2");
    else el.value = v;
  }
  function mascaraMoeda(el) {
    let v = onlyDigits(el.value).slice(0, 12);
    if (!v) return (el.value = "R$ 0,00");
    const int = v.slice(0, -2) || "0";
    const cent = v.slice(-2).padStart(2, "0");
    el.value = formatBRL(Number(int + "." + cent));
  }

  // -------------------------------
  // Toast básico (o main.js pode sobrescrever)
  // -------------------------------
  function showToast(msg) {
    let el = document.getElementById("helpers-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "helpers-toast";
      el.style.cssText =
        "position:fixed;left:50%;transform:translateX(-50%);bottom:20px;background:#111827;color:#fff;padding:10px 14px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);z-index:10000;opacity:0;transition:opacity .2s";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    setTimeout(() => (el.style.opacity = "0"), 2500);
  }

  // -------------------------------
  // API helper (GET/POST)
  // -------------------------------
  async function api(params = {}, method = "GET", data = null) {
    const url = new URL(API_URL);
    for (const key in params) url.searchParams.append(key, params[key]);

    const options = { method };
    if (data && method === "POST") {
      options.headers = { "Content-Type": "text/plain" };
      options.body = JSON.stringify(data);
    }

    try {
      const r = await fetch(url.toString(), options);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const result = await r.json();
      if (!result.ok) throw new Error(result.error || "Falha na operação");
      return result;
    } catch (err) {
      console.error("API error:", err);
      showToast("Erro de comunicação: " + err.message);
      return { ok: false, error: String(err) };
    }
  }

  // -------------------------------
  // NF-e: aba/tab
  // -------------------------------
  async function detectNFeTab() {
    // fixo por enquanto; se mudar o nome da aba, ajuste aqui
    return "nfeRegistros";
  }

  // -------------------------------
  // Getters (compartilhados)
  // -------------------------------
  async function getPacientes(force = false) {
    if (MEMORY.pacientes && !force) return MEMORY.pacientes;
    const res = await api({ action: "list", tab: "pacientes" });
    if (!res.ok) return MEMORY.pacientes || [];
    MEMORY.pacientes = (res.data || []).map((p) => {
      const nome = String(p.nome || "");
      const email = String(p.email || "");
      return {
        id: Number(p.id),
        nome,
        nomeLower: nome.toLowerCase(),
        email: email.toLowerCase(),
        telefone: String(p.telefone || ""),
        cpf: String(p.cpf || ""),
        nascimento: String(p.dataNascimento || ""),
        valor: String(p.valorSessao || ""),
        status: String(p.status || "ativo").toLowerCase(),
        obs: String(p.obs || ""),
        createdAt: String(p.createdAt || ""),
        search_norm: normalizeText(nome + " " + email),
        search_digits: onlyDigits(String(p.telefone || "") + String(p.cpf || "")),
      };
    });
    return MEMORY.pacientes;
  }

  async function getAgenda(force = false) {
    if (MEMORY.agenda && !force) return MEMORY.agenda;
    const res = await api({ action: "list", tab: "agenda" });
    if (!res.ok) return MEMORY.agenda || [];
    MEMORY.agenda = (res.data || []).map((a) => ({
      id: Number(a.id),
      pacienteId: Number(a.pacienteId),
      data: String(a.data || ""),
      hora: String(a.hora || ""),
      obs: String(a.obs || ""),
      status: String(a.status || "pendente").toLowerCase(),
      nfeNumero: String(a.nfeNumero || ""),
    }));
    return MEMORY.agenda;
  }

  async function getNFEs(force = false) {
    if (MEMORY.nfeRegistros && !force) return MEMORY.nfeRegistros;

    const tab = await detectNFeTab();
    const res = await api({ action: "list", tab });
    if (!res.ok) return MEMORY.nfeRegistros || [];

    MEMORY.nfeRegistros = (res.data || []).map((r) => ({
      id: Number(r.id),
      clienteId: Number(r.clienteId),
      clienteNome: String(r.clienteNome || ""),
      mesRef: String(r.mesRef || ""),
      codigo: String(r.codigo || ""),
      valor: String(r.valor || ""),
      enviada: ["true", "sim"].includes(String(r.enviada || "").toLowerCase()),
      paga: ["true", "sim"].includes(String(r.paga || "").toLowerCase()),
      obs: String(r.obs || ""),
      createdAt: String(r.createdAt || new Date().toISOString()),
    }));
    return MEMORY.nfeRegistros;
  }

  // -------------------------------
  // Exposição global
  // -------------------------------
  window.APP = Object.assign(window.APP || {}, {
    API_URL,
    MEMORY,
    UI,

    // utils
    toISODate,
    fromISODate,
    normalizeText,
    onlyDigits,
    cap,

    // moeda
    parseBRL,
    formatBRL,

    // máscaras
    mascaraTelefone,
    mascaraCPF,
    mascaraData,
    mascaraMoeda,

    // ui
    showToast,

    // api
    api,

    // nfe tab
    detectNFeTab,

    // getters
    getPacientes,
    getAgenda,
    getNFEs,
  });
})();
