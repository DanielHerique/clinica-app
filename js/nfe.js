// js/nfe.js
// ======================================================================
// NF-e: listagem + criação. Calcula automaticamente o valor total
// (atendimentos "realizado" do mês × valor da sessão do paciente).
// Depende de window.APP (helpers.js).
// ======================================================================

(function () {
  const {
    api,
    getNFEs,
    getAgenda,
    getPacientes,
    showToast,
    formatBRL,
    parseBRL,
  } = window.APP;

  // -------------------------------------------
  // helpers locais
  // -------------------------------------------
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

  function enableBackdropClose(modalEl) {
    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) modalEl.style.display = "none";
    });
  }

  // -------------------------------------------
  // Página
  // -------------------------------------------
  async function pageNFe(content) {
    const hoje = new Date();
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    const pacientes = await getPacientes();

    content.innerHTML = `
      <h2>NF-e</h2>

      <div class="top-bar" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="text" id="nfeBuscaCliente" placeholder="🔍 Buscar cliente..." style="min-width:240px;flex:1;">
        <label style="display:flex;align-items:center;gap:8px;">Mês:
          <input type="month" id="nfeMes" value="${mesAtual}">
        </label>
        <button id="nfeNovo" class="btn-primario">+ Registrar NF-e</button>
      </div>

      <div class="section">
        <table class="fiscal-table" id="nfeTabela">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Mês ref.</th>
              <th>Código</th>
              <th>Valor</th>
              <th>Enviada</th>
              <th>Paga</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <!-- Modal Registrar -->
      <div id="modalNfe" class="modal" aria-modal="true" role="dialog">
        <div class="modal-content" style="max-width:700px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <h3 style="margin:0;">Registrar NF-e</h3>
            <button id="nfeX" class="btn-secundario" title="Fechar">×</button>
          </div>

          <form id="nfeForm" class="form-grid">
            <label>Cliente:
              <select id="nfeCliente" required>
                ${pacientes.map(p => `<option value="${p.id}">${p.nome}</option>`).join("")}
              </select>
            </label>

            <label>Mês de referência:
              <input type="month" id="nfeMesRef" value="${mesAtual}" required>
            </label>

            <label>Valor total (auto):
              <input type="text" id="nfeValor" readonly>
            </label>

            <label class="col-2">Observação:
              <textarea id="nfeObs" rows="2" placeholder="opcional..."></textarea>
            </label>

            <div class="modal-buttons col-2">
              <button type="submit" id="nfeSalvar" class="btn-primario">Registrar</button>
              <button type="button" id="nfeCancelar" class="btn-secundario">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // refs
    const elBusca = content.querySelector("#nfeBuscaCliente");
    const elMes   = content.querySelector("#nfeMes");
    const btnNovo = content.querySelector("#nfeNovo");
    const tbody   = content.querySelector("#nfeTabela tbody");

    const modal   = content.querySelector("#modalNfe");
    const btnX    = content.querySelector("#nfeX");
    const btnCanc = content.querySelector("#nfeCancelar");
    const form    = content.querySelector("#nfeForm");

    const selCli  = content.querySelector("#nfeCliente");
    const inpMes  = content.querySelector("#nfeMesRef");
    const inpVal  = content.querySelector("#nfeValor");
    const inpObs  = content.querySelector("#nfeObs");

    enableBackdropClose(modal);
    btnX.onclick = () => (modal.style.display = "none");
    btnCanc.onclick = () => (modal.style.display = "none");

    // filtros
    elBusca.oninput = renderLista;
    elMes.onchange  = renderLista;

    // abrir modal
    btnNovo.onclick = () => {
      // preset mês atual do topo
      inpMes.value = elMes.value || mesAtual;
      inpObs.value = "";
      selCli.value = selCli.querySelector("option")?.value || "";
      inpVal.value = "—";
      modal.style.display = "flex";
      atualizarValorAuto(); // calcula já na abertura
    };

    // auto recalcular
    selCli.onchange = atualizarValorAuto;
    inpMes.onchange = atualizarValorAuto;

    await renderLista();

    // -------------------------------------------
    // Lista
    // -------------------------------------------
    async function renderLista() {
      const lista = await getNFEs(true); // backend deve listar na TAB 'nfe'
      const termo = (elBusca.value || "").toLowerCase();
      const mes   = elMes.value;

      const rows = [];
      for (const r of lista) {
        if (mes && !String(r.mesRef || "").startsWith(mes)) continue;
        if (termo && !String(r.clienteNome || "").toLowerCase().includes(termo)) continue;

        rows.push(`
          <tr>
            <td>${r.clienteNome || "-"}</td>
            <td>${r.mesRef || "-"}</td>
            <td>${r.codigo || "-"}</td>
            <td>${r.valor ? formatBRL(r.valor) : "R$ 0,00"}</td>
            <td>${r.enviada ? "Sim" : "Não"}</td>
            <td>${r.paga ? "Sim" : "Não"}</td>
          </tr>
        `);
      }
      tbody.innerHTML = rows.join("") || `<tr><td colspan="6">Nenhum registro encontrado.</td></tr>`;
    }

    // -------------------------------------------
    // Cálculo automático do total
    // -------------------------------------------
    async function atualizarValorAuto() {
      const clienteId = Number(selCli.value);
      const yyyymm = inpMes.value;
      if (!clienteId || !yyyymm) { inpVal.value = "—"; return; }

      const [agenda, pacs] = await Promise.all([getAgenda(), getPacientes()]);
      const pac = pacs.find(p => p.id === clienteId);
      const vUnit = parseBRL(pac?.valor || 0);

      const realizadas = agenda.filter(a =>
        a.pacienteId === clienteId &&
        a.status === "realizado" &&
        (a.data || "").startsWith(yyyymm)
      ).length;

      inpVal.value = formatBRL(vUnit * realizadas);
    }

    // -------------------------------------------
    // Submit do modal
    // -------------------------------------------
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = content.querySelector("#nfeSalvar");
      const restore = withBtnLoader(btn, "Registrando...");
      const res = await api({ action: "add", tab: "nfe" }, "POST", payload);


      try {
        const payload = {
          clienteId: Number(selCli.value),
          mesRef: inpMes.value,
          // se o backend espera número, troque por: valor: parseBRL(inpVal.value)
          valor: parseBRL(inpVal.value),
          obs: inpObs.value.trim(),
        };
        if (!payload.clienteId || !payload.mesRef) {
          showToast("Preencha cliente e mês.");
          return;
        }

        // TAB = 'nfe' (ajuste aqui se sua função usar outro nome)
        const res = await api({ action: "add", tab: "nfe" }, "POST", payload);
        if (!res.ok) return;

        await getNFEs(true);
        showToast("NF-e registrada!");
        modal.style.display = "none";
        await renderLista();
      } finally {
        restore();
      }
    });
  }

  // registrar página
  window.Pages = window.Pages || {};
  window.Pages.nfe = pageNFe;
})();
