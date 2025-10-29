// js/nfe.js
// ======================================================================
// NF-e: listagem, criação e edição.
// Campos: cliente, mês ref, valor (auto/editável), código, enviada, paga, obs.
// Depende de window.APP (helpers.js).
// ======================================================================

(function () {
  function APP() { return window.APP || {}; }

  // wrappers dinâmicos
  const api          = (...a) => APP().api(...a);
  const getNFEs      = (...a) => APP().getNFEs(...a);
  const getAgenda    = (...a) => APP().getAgenda(...a);
  const getPacientes = (...a) => APP().getPacientes(...a);
  const showToast    = (...a) => APP().showToast(...a);
  const formatBRL    = (v)   => APP().formatBRL(v);
  const parseBRL     = (v)   => APP().parseBRL(v);

  const TAB_NFE = "nfeRegistros";

  const strToBool  = (s) => ["true", "sim", "1", "yes"].includes(String(s || "").toLowerCase());
  const monthValue = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  // -----------------------------------------------------------------------------
  async function pageNFe(content) {
    const hoje = new Date();
    const mesAtual = monthValue(hoje);
    const pacientes = await getPacientes();

    content.innerHTML = `
      <h2>NF-e</h2>

      <div class="top-bar" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="text" id="nfeBuscaCliente" placeholder="🔍 Buscar cliente..." style="min-width:280px;flex:1;">
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
        <div class="modal-content" style="max-width:760px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <h3 style="margin:0;">Registrar NF-e</h3>
            <button id="nfeX" class="btn-secundario">×</button>
          </div>

          <form id="nfeForm" class="form-grid" novalidate>
            <label>Cliente:
              <select id="nfeCliente" required>
                ${pacientes.map(p => `<option value="${p.id}">${p.nome}</option>`).join("")}
              </select>
            </label>

            <label>Mês de referência:
              <input type="month" id="nfeMesRef" value="${mesAtual}" required>
            </label>

            <label>Código da NF-e:
              <input type="text" id="nfeCodigo" placeholder="ex.: 756567">
            </label>

            <label>Enviada ao cliente?
              <select id="nfeEnviada">
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </label>

            <label>Pagamento recebido?
              <select id="nfePaga">
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </label>

            <label class="col-2">Valor total
              <div style="display:flex; gap:8px; align-items:center;">
                <input type="text" id="nfeValor" style="flex:1;">
                <label style="display:flex; align-items:center; gap:6px; white-space:nowrap;">
                  <input type="checkbox" id="nfeAuto" checked>
                  Calcular automaticamente
                </label>
                <button type="button" id="nfeRecalc" class="btn-secundario">Recalcular</button>
              </div>
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

      <!-- Modal Editar -->
      <div id="modalEditNfe" class="modal" aria-modal="true" role="dialog">
        <div class="modal-content" style="max-width:760px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <h3 style="margin:0;">Editar NF-e</h3>
            <button id="nfeEditX" class="btn-secundario">×</button>
          </div>

          <form id="nfeEditForm" class="form-grid" novalidate>
            <input type="hidden" id="nfeEditId">
            <label>Cliente:
              <input type="text" id="nfeEditClienteNome" readonly>
            </label>
            <label>Mês de referência:
              <input type="month" id="nfeEditMesRef" required>
            </label>
            <label>Código da NF-e:
              <input type="text" id="nfeEditCodigo">
            </label>
            <label>Enviada ao cliente?
              <select id="nfeEditEnviada">
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </label>
            <label>Pagamento recebido?
              <select id="nfeEditPaga">
                <option value="nao">Não</option>
                <option value="sim">Sim</option>
              </select>
            </label>
            <label class="col-2">Valor:
              <input type="text" id="nfeEditValor">
            </label>

            <div class="modal-buttons col-2" style="display:flex;gap:8px;">
              <button type="button" id="nfeExcluir" class="btn-perigo">Excluir</button>
              <span style="flex:1"></span>
              <button type="submit" id="nfeSalvarEdicao" class="btn-primario">Salvar NF-e</button>
              <button type="button" id="nfeCancelarEdicao" class="btn-secundario">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // ---------------- Refs
    const elBusca = content.querySelector("#nfeBuscaCliente");
    const elMes   = content.querySelector("#nfeMes");
    const tbody   = content.querySelector("#nfeTabela tbody");

    // modal novo
    const modal   = content.querySelector("#modalNfe");
    const btnNovo = content.querySelector("#nfeNovo");
    const btnX    = content.querySelector("#nfeX");
    const btnCanc = content.querySelector("#nfeCancelar");
    const form    = content.querySelector("#nfeForm");

    const selCli  = content.querySelector("#nfeCliente");
    const inpMes  = content.querySelector("#nfeMesRef");
    const inpVal  = content.querySelector("#nfeValor");
    const inpObs  = content.querySelector("#nfeObs");
    const inpCod  = content.querySelector("#nfeCodigo");
    const selEnv  = content.querySelector("#nfeEnviada");
    const selPaga = content.querySelector("#nfePaga");

    const chkAuto   = content.querySelector("#nfeAuto");
    const btnRecalc = content.querySelector("#nfeRecalc");

    // modal editar
    const modalEdit    = content.querySelector("#modalEditNfe");
    const btnEditX     = content.querySelector("#nfeEditX");
    const btnEditCanc  = content.querySelector("#nfeCancelarEdicao");
    const formEdit     = content.querySelector("#nfeEditForm");
    const inpEditId    = content.querySelector("#nfeEditId");
    const inpEditCli   = content.querySelector("#nfeEditClienteNome");
    const inpEditMes   = content.querySelector("#nfeEditMesRef");
    const inpEditCod   = content.querySelector("#nfeEditCodigo");
    const selEditEnv   = content.querySelector("#nfeEditEnviada");
    const selEditPaga  = content.querySelector("#nfeEditPaga");
    const inpEditValor = content.querySelector("#nfeEditValor");
    const btnExcluir   = content.querySelector("#nfeExcluir");

    // ---------------- Helpers
    const enableBackdropClose = (el) =>
      el.addEventListener("click", (e) => { if (e.target === el) el.style.display = "none"; });
    enableBackdropClose(modal);
    enableBackdropClose(modalEdit);

    const withBtnLoader = (btn, txt = "Salvando...") => {
      const prev = { html: btn.innerHTML, dis: btn.disabled };
      btn.innerHTML = txt;
      btn.disabled = true;
      return () => { btn.innerHTML = prev.html; btn.disabled = prev.dis; };
    };

    const mascaraMoeda = (input) => {
      const only = String(input.value || "").replace(/\D/g, "");
      const val = ((parseInt(only || "0", 10)) / 100).toFixed(2);
      input.value = "R$ " + val.replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    // máscaras
    inpVal.addEventListener("input", () => mascaraMoeda(inpVal));
    inpVal.addEventListener("focus", () => { if (!inpVal.value) inpVal.value = "R$ 0,00"; });
    inpEditValor.addEventListener("input", () => mascaraMoeda(inpEditValor));
    inpEditValor.addEventListener("focus", () => { if (!inpEditValor.value) inpEditValor.value = "R$ 0,00"; });

    // controle de auto cálculo (liga/desliga)
    function setAutoCalcUI(on) {
      chkAuto.checked = on;
      inpVal.readOnly = on;
      btnRecalc.disabled = on;
      inpVal.style.opacity = on ? 0.75 : 1;
    }

    chkAuto.addEventListener("change", () => {
      const on = chkAuto.checked;
      setAutoCalcUI(on);
      if (on) atualizarValorAuto(); // se ligou auto, recalcula na hora
    });

    btnRecalc.addEventListener("click", () => atualizarValorAuto(true)); // força recálculo mesmo com auto OFF

    // ---------------- Eventos da página
    elBusca.oninput = renderLista;
    elMes.onchange  = renderLista;

    btnNovo.onclick = () => {
      inpMes.value = elMes.value || mesAtual;
      inpObs.value = "";
      inpCod.value = "";
      selEnv.value = "nao";
      selPaga.value = "nao";
      selCli.value = selCli.querySelector("option")?.value || "";
      inpVal.value = "R$ 0,00";

      setAutoCalcUI(true);     // padrão: auto ON
      modal.style.display = "flex";
      atualizarValorAuto();    // calcula já
    };
    btnX.onclick    = () => (modal.style.display = "none");
    btnCanc.onclick = () => (modal.style.display = "none");

    selCli.onchange = atualizarValorAuto;
    inpMes.onchange = atualizarValorAuto;

    form.addEventListener("submit", onRegistrar);

    // edição
    formEdit.addEventListener("submit", onSalvarEdicao);
    btnEditX.onclick    = () => (modalEdit.style.display = "none");
    btnEditCanc.onclick = () => (modalEdit.style.display = "none");
    btnExcluir.onclick  = onExcluir;

    await renderLista();

    // ---------------- Funções
    async function renderLista() {
      const lista = await getNFEs(true);
      const termo = (elBusca.value || "").toLowerCase();
      const mes   = elMes.value;

      const rows = lista
        .filter(r => (!mes || String(r.mesRef || "").startsWith(mes)) &&
                     (!termo || String(r.clienteNome || "").toLowerCase().includes(termo)))
        .map(r => `
          <tr class="nfe-row" data-id="${r.id}">
            <td>${r.clienteNome || "-"}</td>
            <td>${r.mesRef || "-"}</td>
            <td>${r.codigo || "-"}</td>
            <td>${r.valor ? formatBRL(r.valor) : "R$ 0,00"}</td>
            <td>${r.enviada ? "Sim" : "Não"}</td>
            <td>${r.paga ? "Sim" : "Não"}</td>
          </tr>`);

      tbody.innerHTML = rows.join("") || `<tr><td colspan="6">Nenhum registro encontrado.</td></tr>`;
      tbody.querySelectorAll(".nfe-row").forEach(tr =>
        tr.addEventListener("click", () => abrirEditar(Number(tr.dataset.id)))
      );
    }

    // calcula vUnit * qtd de "realizado" do mês selecionado para o cliente
    async function atualizarValorAuto(force = false) {
      // Calcula somente se auto ON, a menos que seja "force"
      if (!chkAuto.checked && !force) return;

      const clienteId = Number(selCli.value);
      const yyyymm = inpMes.value;
      if (!clienteId || !yyyymm) { inpVal.value = "R$ 0,00"; return; }

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

    async function onRegistrar(e) {
      e.preventDefault();
      const restore = withBtnLoader(content.querySelector("#nfeSalvar"), "Registrando...");
      try {
        const payload = {
          clienteId: Number(selCli.value),
          clienteNome: pacientes.find(p => p.id === Number(selCli.value))?.nome || "",
          mesRef: inpMes.value,
          valor: parseBRL(inpVal.value),
          codigo: inpCod.value.trim(),
          enviada: content.querySelector("#nfeEnviada").value,
          paga: content.querySelector("#nfePaga").value,
          obs: inpObs.value.trim(),
          createdAt: new Date().toISOString(),
        };
        const res = await api({ action: "add", tab: TAB_NFE }, "POST", payload);
        if (!res.ok) return;
        await APP().getNFEs(true);
        modal.style.display = "none";
        await renderLista();
        showToast("NF-e registrada!");
      } finally { restore(); }
    }

    async function abrirEditar(id) {
      const lista = await getNFEs();
      const n = lista.find(x => Number(x.id) === Number(id));
      if (!n) return;

      inpEditId.value   = n.id;
      inpEditCli.value  = n.clienteNome || "-";
      inpEditMes.value  = (String(n.mesRef || "").slice(0, 7)) || mesAtual;
      inpEditCod.value  = n.codigo || "";
      selEditEnv.value  = strToBool(n.enviada) ? "sim" : "nao";
      selEditPaga.value = strToBool(n.paga) ? "sim" : "nao";
      inpEditValor.value = formatBRL(n.valor || 0);

      modalEdit.style.display = "flex";
    }

    async function onSalvarEdicao(e) {
      e.preventDefault();
      const restore = withBtnLoader(content.querySelector("#nfeSalvarEdicao"), "Salvando...");
      try {
        const id = Number(inpEditId.value);
        const res = await api({ action: "update", tab: TAB_NFE }, "POST", {
          id,
          mesRef: inpEditMes.value,
          codigo: inpEditCod.value.trim(),
          enviada: selEditEnv.value,
          paga: selEditPaga.value,
          valor: parseBRL(inpEditValor.value),
        });
        if (!res.ok) return;
        await getNFEs(true);
        modalEdit.style.display = "none";
        await renderLista();
        showToast("NF-e salva!");
      } finally { restore(); }
    }

    async function onExcluir() {
      const id = Number(inpEditId.value);
      if (!id || !confirm("Excluir esta NF-e?")) return;
      const restore = withBtnLoader(btnExcluir, "Excluindo...");
      try {
        const res = await api({ action: "delete", tab: TAB_NFE, id });
        if (!res.ok) return;
        await getNFEs(true);
        modalEdit.style.display = "none";
        await renderLista();
        showToast("NF-e excluída.");
      } finally { restore(); }
    }
  }

  window.Pages = window.Pages || {};
  window.Pages.nfe = pageNFe;
})();
