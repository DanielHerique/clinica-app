/************************************************************
 *  APP CLÍNICA 2025 - INTEGRAÇÃO PLANILHA GOOGLE ONLINE
 *  AUTOR: Daniel | Versão consolidada
 ************************************************************/

/************************************************************
 *  SEÇÃO 1 — CONFIGURAÇÕES E UTILITÁRIOS GERAIS
 ************************************************************/


const API_URL = "/api";

function showToast(msg) {
  const el = document.createElement("div");
  el.textContent = msg;
  el.className = "toast";
  Object.assign(el.style, {
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#333",
    color: "#fff",
    padding: "10px 20px",
    borderRadius: "6px",
    zIndex: "9999",
    fontSize: ".9rem",
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function confirmAction(msg, cb) {
  if (confirm(msg)) cb();
}

function formatMoney(v) {
  const n = parseFloat(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/************************************************************
 *  SEÇÃO 2 — API GOOGLE SHEETS  (CORRIGIDA)
 ************************************************************/

const api = {
  async list(tab) {
    const r = await fetch(`${API_URL}?action=list&tab=${tab}`);
    const j = await r.json();
    return j?.data ?? [];        // <— AQUI: devolve sempre array
  },
  async add(tab, data) {
    const r = await fetch(`${API_URL}?action=add&tab=${tab}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return await r.json();
  },
  async update(tab, id, data) {
    // nosso GAS lê action e tab da query; o body é o objeto inteiro
    const r = await fetch(`${API_URL}?action=update&tab=${tab}`, {
      method: "POST",
      body: JSON.stringify({ id, ...data }),
    });
    return await r.json();
  },
  async remove(tab, id) {
    const r = await fetch(`${API_URL}?action=delete&tab=${tab}&id=${id}`);
    return await r.json();
  },
};

/************************************************************
 *  SEÇÃO 3 — INICIALIZAÇÃO E NAVEGAÇÃO
 ************************************************************/
document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("content");
  document.getElementById("btnAgenda").addEventListener("click", () => {
    setActiveTab("agenda");
    pageAgenda(content);
  });
  document.getElementById("btnPacientes").addEventListener("click", () => {
    setActiveTab("pacientes");
    pagePacientes(content);
  });
  document.getElementById("btnFiscal").addEventListener("click", () => {
    setActiveTab("fiscal");
    pageFiscal(content);
  });

  // === AGENDA É A ABA INICIAL ===
  setActiveTab("agenda");
  pageAgenda(content);
});

function setActiveTab(tab) {
  document
    .querySelectorAll("nav button")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(`btn${capitalize(tab)}`).classList.add("active");
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/************************************************************
 *  SEÇÃO 4 — PACIENTES
 ************************************************************/
async function pagePacientes(content) {
  const pacientes = await api.list("pacientes");
  content.innerHTML = `
    <div class="top-bar">
      <h2>Pacientes</h2>
      <button id="btnNovoPaciente" class="btn-primario">+ Novo</button>
    </div>
    <div id="pacientesLista" class="grid-pacientes">
      ${pacientes
        .map(
          (p) => `
          <div class="card-paciente">
            <h4>${p.nome}</h4>
            <p>${p.telefone || ""}</p>
            <p>${p.email || ""}</p>
            <p><b>${formatMoney(p.valor || 0)}</b></p>
            <button class="btn-mini btn-edit" data-id="${p.id}">Editar</button>
            <button class="btn-mini btn-danger btn-del" data-id="${p.id}">Excluir</button>
          </div>
        `
        )
        .join("")}
    </div>

    <div id="modalPaciente" class="modal">
      <div class="modal-content" style="max-width:420px;">
        <h3 id="pacienteTitulo">Novo Paciente</h3>
        <form id="formPaciente">
          <label>Nome:<input type="text" id="pacNome" required></label>
          <label>Telefone:<input type="text" id="pacTel"></label>
          <label>Email:<input type="email" id="pacEmail"></label>
          <label>Valor padrão:<input type="number" id="pacValor" step="0.01"></label>
          <div class="modal-buttons">
            <button type="submit" class="btn-primario">Salvar</button>
            <button type="button" id="pacCancelar" class="btn-secundario">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modal = document.getElementById("modalPaciente");
  const form = document.getElementById("formPaciente");
  let editId = null;

  document.getElementById("btnNovoPaciente").onclick = () => {
    editId = null;
    modal.style.display = "flex";
    form.reset();
    document.getElementById("pacienteTitulo").textContent = "Novo Paciente";
  };

  document.getElementById("pacCancelar").onclick = () =>
    (modal.style.display = "none");

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      nome: document.getElementById("pacNome").value.trim(),
      telefone: document.getElementById("pacTel").value.trim(),
      email: document.getElementById("pacEmail").value.trim(),
      valor: parseFloat(document.getElementById("pacValor").value || 0),
    };
    if (editId) await api.update("pacientes", editId, data);
    else await api.add("pacientes", data);
    modal.style.display = "none";
    showToast("Paciente salvo!");
    pagePacientes(content);
  };

  document.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const p = pacientes.find((x) => x.id === id);
      if (!p) return;
      editId = id;
      modal.style.display = "flex";
      document.getElementById("pacienteTitulo").textContent = "Editar Paciente";
      document.getElementById("pacNome").value = p.nome || "";
      document.getElementById("pacTel").value = p.telefone || "";
      document.getElementById("pacEmail").value = p.email || "";
      document.getElementById("pacValor").value = p.valor || "";
    };
  });

  document.querySelectorAll(".btn-del").forEach((btn) => {
    btn.onclick = () => {
      confirmAction("Excluir este paciente?", async () => {
        await api.remove("pacientes", btn.dataset.id);
        showToast("Removido com sucesso");
        pagePacientes(content);
      });
    };
  });
}

/************************************************************
 *  SEÇÃO 5 — AGENDA (Calendário com busca de paciente)
 ************************************************************/

const CAL = { year: null, month: null };

async function pageAgenda(content) {
  const today = new Date();
  CAL.year = today.getFullYear();
  CAL.month = today.getMonth();
  const pacientes = await api.list("pacientes");
  const agenda = await api.list("agenda");

  content.innerHTML = `
    <div class="calendar-header">
      <div class="cal-nav">
        <button id="calPrev" class="btn-secundario">‹</button>
        <h2 id="calTitle"></h2>
        <button id="calNext" class="btn-primario">›</button>
        <button id="calToday" class="btn-secundario">Hoje</button>
        <button id="calNew" class="btn-primario">+ Novo atendimento</button>
      </div>
    </div>

    <div class="calendar">
      <div class="cal-weekdays">
        <div>dom</div><div>seg</div><div>ter</div><div>qua</div><div>qui</div><div>sex</div><div>sáb</div>
      </div>
      <div id="calGrid" class="cal-grid"></div>
    </div>

    <!-- Modal de agendamento -->
    <div id="modalAgenda" class="modal">
      <div class="modal-content" style="max-width:720px;">
        <h3>Novo atendimento</h3>
        <form id="agendaForm" class="form-grid">
          <label>Data:
            <input type="date" id="agendaData" required>
          </label>
          <label>Hora:
            <input type="time" id="agendaHora" required>
          </label>
          <label>Paciente:
            <input type="text" id="agendaPacienteBusca" placeholder="Digite para buscar...">
            <select id="agendaPaciente" size="5" style="margin-top:4px;" required>
              ${pacientes.map(p => `<option value="${p.id}">${p.nome}</option>`).join("")}
            </select>
          </label>
          <label>Status:
            <select id="agendaStatus">
              <option value="pendente">Pendente</option>
              <option value="realizado">Realizado</option>
              <option value="nao">Não compareceu</option>
            </select>
          </label>
          <label style="grid-column:1/-1;">Observação:
            <textarea id="agendaObs" rows="2" placeholder="Observações..."></textarea>
          </label>
          <div class="modal-buttons" style="grid-column:1/-1;">
            <button type="submit" class="btn-primario">Salvar</button>
            <button type="button" id="agendaCancelar" class="btn-secundario">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  /************************************************************
 *  CONTINUAÇÃO — AGENDA (modal do dia e renderização)
 ************************************************************/

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

async function renderAgendaCalendar() {
  const title = document.getElementById("calTitle");
  const grid = document.getElementById("calGrid");
  const pacientes = await api.list("pacientes");
  const agenda = await api.list("agenda");

  const titulo = new Date(CAL.year, CAL.month, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  title.textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);

  const firstDay = new Date(CAL.year, CAL.month, 1);
  const startWeekday = firstDay.getDay();
  const gridStart = new Date(CAL.year, CAL.month, 1 - startWeekday);
  const todayISO = toISODate(new Date());

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);

    const inCurrentMonth = d.getMonth() === CAL.month;
    const iso = toISODate(d);

    const events = agenda
      .filter((ev) => ev.data === iso)
      .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

    const chips = events
      .map((ev) => {
        const p = pacientes.find((px) => px.id === ev.pacienteId);
        const name = p ? p.nome : "Paciente removido";
        const hora = ev.hora ? `${ev.hora} ` : "";
        const cls =
          ev.status === "realizado"
            ? "done"
            : ev.status === "nao"
            ? "missed"
            : "pending";
        return `
        <div class="event-chip ${cls}" title="${hora}${name}">
          <span class="event-name">${hora}${name}</span>
          <button class="event-del" data-id="${ev.id}">×</button>
        </div>`;
      })
      .join("");

    const isToday = iso === todayISO;
    cells.push(`
      <div class="cal-day ${inCurrentMonth ? "" : "other-month"} ${
      isToday ? "today" : ""
    }" data-date="${iso}">
        <div class="cal-day-header">
          <span class="cal-day-number">${d.getDate()}</span>
        </div>
        <div class="cal-events">${chips}</div>
      </div>`);
  }

  grid.innerHTML = cells.join("");

  grid.querySelectorAll(".event-del").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      confirmAction("Remover este atendimento?", async () => {
        await api.remove("agenda", btn.dataset.id);
        showToast("Removido");
        renderAgendaCalendar();
      });
    };
  });

  grid.querySelectorAll(".cal-day").forEach((cell) => {
    cell.onclick = (e) => {
      if (e.target.closest(".event-del")) return;
      abrirModalDia(cell.dataset.date);
    };
  });
}

function abrirModalDia(isoDate) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.style.display = "flex";

  modal.innerHTML = `
    <div class="modal-content" style="max-width:640px;">
      <h3>${fromISODate(isoDate).toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })}</h3>
      <div id="diaLista"></div>
      <div class="modal-buttons">
        <button id="diaNovo" class="btn-primario">+ Novo atendimento</button>
        <button id="diaFechar" class="btn-secundario">Fechar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const lista = modal.querySelector("#diaLista");

  Promise.all([api.list("agenda"), api.list("pacientes")]).then(
    ([agenda, pacientes]) => {
      const doDia = agenda
        .filter((a) => a.data === isoDate)
        .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

      if (doDia.length === 0) {
        lista.innerHTML = `<p>Sem atendimentos neste dia.</p>`;
      } else {
        lista.innerHTML = doDia
          .map((a) => {
            const p = pacientes.find((x) => x.id === a.pacienteId);
            return `
              <div style="border-bottom:1px solid #eee; padding:10px 0;">
                <div><b>${p ? p.nome : "Paciente removido"}</b> — ${a.hora}</div>
                <div>Status: ${a.status}</div>
                <div>Obs: ${a.obs || "-"}</div>
              </div>`;
          })
          .join("");
      }
    }
  );

  modal.querySelector("#diaFechar").onclick = () => modal.remove();
  modal.querySelector("#diaNovo").onclick = () => {
    modal.remove();
    document.getElementById("calNew").click();
  };
}

  // === Navegação do calendário ===
  document.getElementById("calPrev").onclick = () => {
    CAL.month -= 1;
    if (CAL.month < 0) { CAL.month = 11; CAL.year -= 1; }
    renderAgendaCalendar();
  };
  document.getElementById("calNext").onclick = () => {
    CAL.month += 1;
    if (CAL.month > 11) { CAL.month = 0; CAL.year += 1; }
    renderAgendaCalendar();
  };
  document.getElementById("calToday").onclick = () => {
    const n = new Date();
    CAL.year = n.getFullYear();
    CAL.month = n.getMonth();
    renderAgendaCalendar();
  };

  // === Modal: abrir/fechar ===
  document.getElementById("calNew").onclick = () => abrirModalAgenda();

  function abrirModalAgenda(isoDate) {
    const m = document.getElementById("modalAgenda");
    document.getElementById("agendaData").value = isoDate || toISODate(new Date());
    document.getElementById("agendaHora").value = "";
    document.getElementById("agendaObs").value = "";
    document.getElementById("agendaStatus").value = "pendente";
    document.getElementById("agendaPacienteBusca").value = "";
    m.style.display = "flex";
  }
  document.getElementById("agendaCancelar").onclick = () => {
    document.getElementById("modalAgenda").style.display = "none";
  };

  // === Salvar novo atendimento ===
  document.getElementById("agendaForm").onsubmit = async (e) => {
    e.preventDefault();
    const data = document.getElementById("agendaData").value;
    const hora = document.getElementById("agendaHora").value;
    const pacienteId = document.getElementById("agendaPaciente").value;
    const status = document.getElementById("agendaStatus").value;
    const obs = (document.getElementById("agendaObs").value || "").trim();

    if (!data || !hora || !pacienteId) {
      showToast("Preencha data, hora e paciente.");
      return;
    }

    await api.add("agenda", { data, hora, pacienteId, status, obs });
    document.getElementById("modalAgenda").style.display = "none";
    showToast("Atendimento salvo!");
    renderAgendaCalendar();
  };

  // === Render inicial ===
  renderAgendaCalendar();
} // <-- fecha a função pageAgenda


/************************************************************
 *  SEÇÃO 6 — FISCAL (Resumo mensal)
 ************************************************************/
async function pageFiscal(content) {
  const pacientes = await api.list("pacientes");
  const agenda = await api.list("agenda");

  const resumo = {};
  for (const ev of agenda) {
    if (!ev.data) continue;
    const mes = ev.data.slice(0, 7); // yyyy-mm
    if (!resumo[mes]) resumo[mes] = { total: 0, realizados: 0, pendentes: 0, faltas: 0 };
    if (ev.status === "realizado") resumo[mes].realizados++;
    else if (ev.status === "pendente") resumo[mes].pendentes++;
    else resumo[mes].faltas++;
    resumo[mes].total++;
  }

  const mesAtual = new Date().toISOString().slice(0, 7);
  const mesResumo = resumo[mesAtual] || { realizados: 0, pendentes: 0, faltas: 0, total: 0 };

  content.innerHTML = `
    <div class="fiscal-header">
      <h2>Resumo Fiscal</h2>
    </div>
    <div class="fiscal-summary">
      <div class="summary-card"><div class="title">Realizados</div><div class="value">${mesResumo.realizados}</div></div>
      <div class="summary-card"><div class="title">Pendentes</div><div class="value">${mesResumo.pendentes}</div></div>
      <div class="summary-card"><div class="title">Não Compareceu</div><div class="value">${mesResumo.faltas}</div></div>
      <div class="summary-card"><div class="title">Total</div><div class="value">${mesResumo.total}</div></div>
    </div>
  `;
}

/* ================================
 * SEÇÃO 7 – AJUSTE FINAL (busca de paciente no <select>)
 * ================================ */
if (!document.__agendaBuscaBound) {
  document.addEventListener("input", (e) => {
    if (e.target && e.target.id === "agendaPacienteBusca") {
      const q = (e.target.value || "").trim().toLowerCase();
      const sel = document.getElementById("agendaPaciente");
      if (!sel) return;

      Array.from(sel.options).forEach((opt) => {
        // mantém a opção "Selecione..." sempre visível
        if (!opt.value) {
          opt.hidden = false;
          return;
        }
        const name = (opt.text || "").toLowerCase();
        opt.hidden = q ? !name.includes(q) : false;
      });
    }
  });
  document.__agendaBuscaBound = true;
}