// js/fiscal.js
// ======================================================================
// Resumo Fiscal: filtro mensal + busca + edição inline de atendimentos.
// Depende de window.APP (helpers.js).
// ======================================================================

(function () {
  const {
    api,
    getAgenda,
    getPacientes,
    showToast,
    formatBRL,
    parseBRL,
  } = window.APP;

  // garante CSS do spinner do botão (btn-loading)
  (function ensureSpinnerCSS() {
    if (document.getElementById("btn-loading-css")) return;
    const st = document.createElement("style");
    st.id = "btn-loading-css";
    st.textContent = `
      .btn-loading{ position:relative; pointer-events:none; opacity:.85; }
      .btn-loading::after{
        content:""; position:absolute; right:10px; top:50%;
        width:14px; height:14px; margin-top:-7px;
        border-radius:50%;
        border:2px solid #fff; border-top-color:transparent;
        animation:btnspin .8s linear infinite;
      }
      @keyframes btnspin{ to{ transform:rotate(360deg) } }
    `;
    document.head.appendChild(st);
  })();

  function withBtnLoader(btn, textWhile = "Salvando...") {
    const prev = { html: btn.innerHTML, disabled: btn.disabled };
    btn.innerHTML = textWhile;
    btn.classList.add("btn-loading");
    btn.disabled = true;
    return () => {
      btn.innerHTML = prev.html;
      btn.classList.remove("btn-loading");
      btn.disabled = prev.disabled;
    };
  }

  async function pageFiscal(content) {
    const pacientes = await getPacientes();
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7);

    content.innerHTML = `
      <h2>Resumo Fiscal</h2>

      <div class="fiscal-header">
        <div class="filter-bar">
          <label>Mês:
            <input type="month" id="fiscalMes" value="${mesAtual}">
          </label>

          <label>Cliente:
            <select id="fiscalCliente">
              <option value="todos">Todos</option>
              ${pacientes.map(p => `<option value="${p.id}">${p.nome}</option>`).join("")}
            </select>
          </label>

          <label>Mostrar:
            <select id="fiscalTipo">
              <option value="realizados">Com realizado</option>
              <option value="todos">Todos os atendimentos</option>
            </select>
          </label>
        </div>
      </div>

      <div class="top-bar" style="margin:8px 0 12px;">
        <input id="fiscalBusca" type="text" placeholder="🔍 Buscar cliente..." style="min-width:240px;flex:1;">
      </div>

      <table class="fiscal-table" id="fiscalTabela">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Realizadas</th>
            <th>Pendentes</th>
            <th>Não compareceu</th>
            <th>Valor Unitário</th>
            <th>Valor Total (Mês)</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>

      <div id="modalFiscalCliente" class="modal">
        <div class="modal-content modal-lg">
          <h3 id="fiscalClienteTitulo" style="margin-bottom:10px;"></h3>
          <div id="fiscalClienteDetalhes"></div>
          <div class="modal-buttons">
            <button id="fiscalClienteSalvar" class="btn-primario">Salvar alterações</button>
            <button id="fiscalClienteFechar" class="btn-secundario">Fechar</button>
          </div>
        </div>
      </div>
    `;

    const selectMes = document.getElementById("fiscalMes");
    const selectCliente = document.getElementById("fiscalCliente");
    const selectTipo = document.getElementById("fiscalTipo");
    const inputBusca = document.getElementById("fiscalBusca");
    const modal = document.getElementById("modalFiscalCliente");

    // fechar modal no X e no backdrop
    document.getElementById("fiscalClienteFechar").onclick = () => (modal.style.display = "none");
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

    document.getElementById("fiscalClienteSalvar").onclick = salvarAlteracoes;

    selectMes.onchange = renderTabelaFiscal;
    selectCliente.onchange = renderTabelaFiscal;
    selectTipo.onchange = renderTabelaFiscal;
    inputBusca.oninput = renderTabelaFiscal;

    await renderTabelaFiscal();

    // ---------------------------------------------------------
    // Render tabela (linhas inteiras clicáveis)
    // ---------------------------------------------------------
    async function renderTabelaFiscal() {
      const agenda = await getAgenda();
      const mesSelecionado = selectMes.value;
      const clienteSelecionado = selectCliente.value;
      const tipoFiltro = selectTipo.value;
      const termo = (inputBusca.value || "").toLowerCase();

      const tbody = document.querySelector("#fiscalTabela tbody");
      tbody.innerHTML = "";

      const agMes = agenda.filter(a => (a.data || "").startsWith(mesSelecionado));
      const linhas = [];

      for (const p of pacientes) {
        if (clienteSelecionado !== "todos" && String(clienteSelecionado) !== String(p.id)) continue;
        if (termo && !String(p.nome || "").toLowerCase().includes(termo)) continue;

        const doCliente = agMes.filter(a => a.pacienteId === p.id);
        if (!doCliente.length && tipoFiltro === "realizados") continue;

        const realizadas = doCliente.filter(a => a.status === "realizado").length;
        const pendentes  = doCliente.filter(a => a.status === "pendente").length;
        const faltas     = doCliente.filter(a => a.status === "nao").length;
        if (tipoFiltro === "realizados" && realizadas === 0) continue;

        const valorNum = parseBRL(p.valor || "R$ 0,00") || 0;
        const valorTotal = valorNum * realizadas;

        linhas.push(`
          <tr data-id="${p.id}" class="row-clickable">
            <td>${p.nome}</td>
            <td>${realizadas}</td>
            <td>${pendentes}</td>
            <td>${faltas}</td>
            <td>${formatBRL(valorNum)}</td>
            <td><strong>${formatBRL(valorTotal)}</strong></td>
          </tr>
        `);
      }

      tbody.innerHTML = linhas.join("") || `<tr><td colspan="6">Nenhum registro encontrado.</td></tr>`;

      if (!tbody._bound) {
        tbody.addEventListener("click", (e) => {
          const tr = e.target.closest('tr[data-id]');
          if (!tr) return;
          abrirDetalhes(tr.dataset.id);
        });
        tbody._bound = true;
      }
    }

    // ---------------------------------------------------------
    // Modal de detalhes (edição inline)
    // ---------------------------------------------------------
    async function abrirDetalhes(clienteId) {
      const paciente = pacientes.find(p => String(p.id) === String(clienteId));
      const mesSelecionado = selectMes.value;
      const agenda = await getAgenda();
      const registros = agenda
        .filter(a => String(a.pacienteId) === String(clienteId) && (a.data || "").startsWith(mesSelecionado))
        .sort((a, b) => String(a.data).localeCompare(String(b.data)));

      if (!registros.length) {
        showToast("Nenhum atendimento no período.");
        return;
      }

      const wrap = document.getElementById("fiscalClienteDetalhes");
      document.getElementById("fiscalClienteTitulo").textContent = paciente?.nome || "Cliente";

      wrap.innerHTML = `
        <table class="fiscal-detalhes" style="width:100%;">
          <thead>
            <tr>
              <th style="text-align:left;">Data</th>
              <th style="text-align:left;">Hora</th>
              <th style="text-align:left;">Status</th>
              <th style="text-align:left;">Observação</th>
            </tr>
          </thead>
          <tbody>
            ${registros.map(r => `
              <tr>
                <td>${r.data}</td>
                <td>${r.hora || "-"}</td>
                <td>
                  <select data-id="${r.id}">
                    <option value="pendente" ${r.status === "pendente" ? "selected" : ""}>Pendente</option>
                    <option value="realizado" ${r.status === "realizado" ? "selected" : ""}>Realizado</option>
                    <option value="nao" ${r.status === "nao" ? "selected" : ""}>Não compareceu</option>
                  </select>
                </td>
                <td><textarea data-id="${r.id}" rows="1" style="width:100%;">${r.obs || ""}</textarea></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;

      modal.style.display = "flex";
    }

    // ---------------------------------------------------------
    // Salvar alterações do modal (com loading no botão)
    // ---------------------------------------------------------
    async function salvarAlteracoes() {
      const btn = document.getElementById("fiscalClienteSalvar");
      const restore = withBtnLoader(btn, "Salvando...");

      try {
        const wrap = document.getElementById("fiscalClienteDetalhes");
        const selects = wrap.querySelectorAll("select[data-id]");
        const textareas = wrap.querySelectorAll("textarea[data-id]");
        const combined = {};

        selects.forEach(sel => {
          const id = Number(sel.dataset.id);
          combined[id] = combined[id] || { id };
          combined[id].status = sel.value;
        });

        textareas.forEach(ta => {
          const id = Number(ta.dataset.id);
          combined[id] = combined[id] || { id };
          combined[id].obs = ta.value.trim();
        });

        let sucesso = true;
        for (const id in combined) {
          const res = await api({ action: "update", tab: "agenda" }, "POST", combined[id]);
          if (!res.ok) { sucesso = false; break; }
        }

        if (!sucesso) { showToast("Erro ao salvar alterações."); return; }

        await getAgenda(true);
        modal.style.display = "none";        // fecha após salvar
        await renderTabelaFiscal();           // atualiza a grade
        showToast("Alterações salvas!");
      } finally {
        restore();
      }
    }
  }

  // Registrar página
  window.Pages = window.Pages || {};
  window.Pages.fiscal = pageFiscal;
})();
