// js/pacientes.js
// ======================================================================
// Pacientes — listagem, busca/filtro, paginação e CRUD com modal.
// Usa delegação de clique (data-id) para abrir o paciente correto.
// Depende de window.APP (helpers.js).
// ======================================================================

(function () {
  window.Pages = window.Pages || {};

  const {
    api,
    getPacientes,
    getAgenda,
    showToast,
    UI,
    normalizeText,
    mascaraTelefone,
    mascaraCPF,
    mascaraData,
    mascaraMoeda,
    formatBRL,
  } = window.APP;

  // util: loader no botão
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

  // ===============================
  // Página
  // ===============================
  window.Pages.pacientes = async function pagePacientes(content) {
    // estado local da página
    UI.currentPage = 1;
    UI.searchTerm = "";
    UI.statusFilter = "todos";

    content.innerHTML = `
      <h2>Pacientes</h2>

      <div class="top-bar">
        <input type="text" id="pcSearch" placeholder="🔍 Buscar por nome, e-mail, telefone ou CPF..." />
        <select id="pcStatus">
          <option value="todos">Todos</option>
          <option value="ativo">Ativo</option>
          <option value="bloqueado">Bloqueado</option>
        </select>
        <button id="pcNovo" class="btn-primario">+ Novo Paciente</button>
      </div>

      <div class="list-header" style="display:flex;justify-content:space-between;align-items:center;margin:6px 0 10px;">
        <small id="pcCounter"></small>
        <div id="pcPaginacao" style="display:flex;gap:8px;align-items:center;">
          <button id="pcPrev" class="btn-secundario">Anterior</button>
          <span id="pcPageInfo" style="min-width:120px;text-align:center;"></span>
          <button id="pcNext" class="btn-primario">Próxima</button>
        </div>
      </div>

      <div id="pcLista" class="grid-pacientes">
        <div class="local-loader" id="pcLoading" style="grid-column:1 / -1;">
          <div class="dot"></div><span>Carregando…</span>
        </div>
      </div>

      <!-- Modal Paciente -->
      <div id="pcModal" class="modal">
        <div class="modal-content" style="max-width:860px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <h3 id="pcTitulo" style="margin:0;">Novo Paciente</h3>
            <button id="pcX" class="btn-secundario" title="Fechar">×</button>
          </div>

          <form id="pcForm" class="form-grid" novalidate>
            <input type="hidden" id="pcId">

            <label>Nome:
              <input type="text" id="pcNome" required>
            </label>
            <label>E-mail:
              <input type="email" id="pcEmail">
            </label>

            <label>Telefone:
              <input type="text" id="pcTelefone">
            </label>
            <label>CPF:
              <input type="text" id="pcCPF">
            </label>

            <label>Data de Nascimento:
              <input type="text" id="pcNasc" placeholder="dd/mm/aaaa" required>
            </label>
            <label>Valor da Sessão:
              <input type="text" id="pcValor" placeholder="R$ 0,00" required>
            </label>

            <label>Status:
              <select id="pcStatusSel">
                <option value="ativo">Ativo</option>
                <option value="bloqueado">Bloqueado</option>
              </select>
            </label>

            <label class="col-2">Observação:
              <textarea id="pcObs" rows="2" placeholder="anotações do paciente..."></textarea>
            </label>

            <div class="col-2" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;">
              <button type="button" id="pcExcluir" class="btn-perigo" style="visibility:hidden;">Excluir</button>
              <div style="display:flex;gap:8px;align-items:center;">
                <button type="submit" id="pcSalvar" class="btn-primario">Salvar</button>
                <button type="button" id="pcCancelar" class="btn-secundario">Cancelar</button>
              </div>
            </div>

            <div id="pcCancelBlock" class="col-2" style="margin-top:10px;padding:10px;border:1px solid #fde2e2;background:#fff5f5;border-radius:10px;display:none;">
              <div style="font-weight:700;margin-bottom:6px;">cancelar agendamentos pendentes</div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <select id="pcCancelScope">
                  <option value="fromToday">a partir de hoje</option>
                  <option value="all">todos (histórico inteiro)</option>
                </select>
                <button type="button" id="pcCancelarPendentes" class="btn-perigo">cancelar pendentes</button>
              </div>
              <small class="muted">remove definitivamente os atendimentos deste paciente que estejam com status "pendente".</small>
            </div>
          </form>
        </div>
      </div>
    `;

    // refs
    const elSearch = content.querySelector("#pcSearch");
    const elStatus = content.querySelector("#pcStatus");
    const elCounter = content.querySelector("#pcCounter");
    const elLista = content.querySelector("#pcLista");
    const elPageInfo = content.querySelector("#pcPageInfo");
    const btnPrev = content.querySelector("#pcPrev");
    const btnNext = content.querySelector("#pcNext");
    const btnNovo = content.querySelector("#pcNovo");

    // modal refs
    const modal = content.querySelector("#pcModal");
    const btnX = content.querySelector("#pcX");
    const btnCancelar = content.querySelector("#pcCancelar");
    const form = content.querySelector("#pcForm");

    const fId = content.querySelector("#pcId");
    const fNome = content.querySelector("#pcNome");
    const fEmail = content.querySelector("#pcEmail");
    const fTel = content.querySelector("#pcTelefone");
    const fCPF = content.querySelector("#pcCPF");
    const fNasc = content.querySelector("#pcNasc");
    const fValor = content.querySelector("#pcValor");
    const fStatus = content.querySelector("#pcStatusSel");
    const fObs = content.querySelector("#pcObs");

    const btnSalvar = content.querySelector("#pcSalvar");
    const btnExcluir = content.querySelector("#pcExcluir");

    const cancelBlock = content.querySelector("#pcCancelBlock");
    const cancelScope = content.querySelector("#pcCancelScope");
    const btnCancelPend = content.querySelector("#pcCancelarPendentes");

    // máscaras
    fTel.addEventListener("input", () => mascaraTelefone(fTel));
    fCPF.addEventListener("input", () => mascaraCPF(fCPF));
    fNasc.addEventListener("input", () => mascaraData(fNasc));
    fValor.addEventListener("input", () => mascaraMoeda(fValor));

    // busca e filtro
    elSearch.addEventListener("input", () => {
      UI.searchTerm = elSearch.value.trim();
      UI.currentPage = 1;
      renderLista();
    });
    elStatus.addEventListener("change", () => {
      UI.statusFilter = elStatus.value;
      UI.currentPage = 1;
      renderLista();
    });

    btnPrev.onclick = () => {
      if (UI.currentPage > 1) {
        UI.currentPage--;
        renderLista();
      }
    };
    btnNext.onclick = () => {
      UI.currentPage++;
      renderLista(true); // safe-avança (volta se ultrapassar)
    };

    // Abrir modal novo
    btnNovo.onclick = () => abrirModalNovo();

    // fechar modal
    function fecharModal() { modal.style.display = "none"; }
    btnX.onclick = fecharModal;
    btnCancelar.onclick = fecharModal;
    modal.addEventListener("click", (e) => { if (e.target === modal) fecharModal(); });

    // submit salvar
    form.addEventListener("submit", onSubmitSalvar);

    // excluir
    btnExcluir.addEventListener("click", onExcluir);

    // cancelar pendentes
    btnCancelPend.addEventListener("click", onCancelarPendentes);

    // Delegação: clique no card abre pelo ID correto
    if (!elLista._bound) {
      elLista.addEventListener("click", async (e) => {
        const card = e.target.closest(".card-paciente");
        if (!card) return;
        const id = Number(card.dataset.id);
        if (!id) return;

        const all = await getPacientes();
        const p = all.find((x) => Number(x.id) === id);
        if (!p) return;

        abrirModalComRegistro(p);
      });
      elLista._bound = true;
    }

    await renderLista();

    // ===============================
    // Render da lista
    // ===============================
    async function renderLista(safeForward = false) {
      const loading = content.querySelector("#pcLoading");
      if (loading) loading.style.display = "flex";

      const list = await getPacientes();
      const term = normalizeText(UI.searchTerm || "");
      const status = UI.statusFilter;

      let filtered = list.filter((p) => {
        if (status !== "todos" && p.status !== status) return false;
        if (!term) return true;
        // nome/email normalizados + dígitos (tel/cpf)
        const okTxt = p.search_norm.includes(term);
        const okDig = p.search_digits.includes(term.replace(/\D/g, ""));
        return okTxt || okDig;
      });

      const total = filtered.length;
      const pageSize = UI.pageSize || 25;
      const maxPage = Math.max(1, Math.ceil(total / pageSize));
      if (UI.currentPage > maxPage) UI.currentPage = maxPage;

      const start = (UI.currentPage - 1) * pageSize;
      const end = start + pageSize;
      const pageItems = filtered.slice(start, end);

      // cards
      const cards = pageItems.map((p) => {
        const badge =
          p.status === "ativo"
            ? `<span class="badge-mini ok">ativo</span>`
            : `<span class="badge-mini block">bloqueado</span>`;
        return `
          <div class="card-paciente" data-id="${p.id}" title="Abrir ${p.nome}">
            <div class="card-line" style="margin-bottom:6px;">
              <h4>${p.nome || "-"}</h4>
              ${badge}
            </div>
            <div class="muted">${p.email || "-"}</div>
            <div class="muted">${p.telefone || "-"}</div>
            <div class="muted">CPF: ${p.cpf || "-"}</div>
            <div class="muted">valor: ${p.valor ? formatBRL(p.valor) : "R$ 0,00"}</div>
          </div>
        `;
      });

      elLista.innerHTML = cards.join("") || `<div class="muted" style="grid-column:1 / -1;">Nenhum paciente encontrado.</div>`;
      elCounter.textContent = `${total} cadastrados · ${pageItems.length} exibidos`;
      elPageInfo.textContent = `Página ${UI.currentPage} de ${maxPage}`;
      btnPrev.disabled = UI.currentPage <= 1;
      btnNext.disabled = UI.currentPage >= maxPage;

      if (loading) loading.style.display = "none";

      // se safeForward foi acionado e a página ficou sem itens, volta uma página
      if (safeForward && pageItems.length === 0 && UI.currentPage > 1) {
        UI.currentPage--;
        renderLista();
      }
    }

    // ===============================
    // Modal — abrir (novo)
    // ===============================
    function abrirModalNovo() {
      fId.value = "";
      fNome.value = "";
      fEmail.value = "";
      fTel.value = "";
      fCPF.value = "";
      fNasc.value = "";
      fValor.value = "";
      fStatus.value = "ativo";
      fObs.value = "";
      btnExcluir.style.visibility = "hidden";
      cancelBlock.style.display = "none";
      content.querySelector("#pcTitulo").textContent = "Novo Paciente";
      modal.style.display = "flex";
    }

    // Modal — abrir (registro existente)
    function abrirModalComRegistro(p) {
      fId.value = p.id || "";
      fNome.value = p.nome || "";
      fEmail.value = p.email || "";
      fTel.value = p.telefone || "";
      fCPF.value = p.cpf || "";
      fNasc.value = p.nascimento || "";
      fValor.value = p.valor || "";
      fStatus.value = p.status || "ativo";
      fObs.value = p.obs || "";

      // aplica máscaras
      if (fTel.value) mascaraTelefone(fTel);
      if (fCPF.value) mascaraCPF(fCPF);
      if (fNasc.value) mascaraData(fNasc);
      if (fValor.value) mascaraMoeda(fValor);

      btnExcluir.style.visibility = "visible";
      cancelBlock.style.display = "block";
      content.querySelector("#pcTitulo").textContent = "Editar Paciente";
      modal.style.display = "flex";
    }

    // ===============================
    // Salvar (criar/editar)
    // ===============================
    async function onSubmitSalvar(e) {
      e.preventDefault();
      if (UI.inflight.has("pcSalvar")) return;
      UI.inflight.add("pcSalvar");
      const restore = withBtnLoader(btnSalvar, "Salvando...");

      try {
        const payload = {
          id: fId.value ? Number(fId.value) : undefined,
          nome: fNome.value.trim(),
          email: fEmail.value.trim(),
          telefone: fTel.value.trim(),
          cpf: fCPF.value.trim(),
          dataNascimento: fNasc.value.trim(),
          valorSessao: fValor.value.trim(),
          status: fStatus.value,
          obs: fObs.value.trim(),
        };

        if (!payload.nome || !payload.dataNascimento || !payload.valorSessao) {
          showToast("Preencha os campos obrigatórios.");
          return;
        }

        let res;
        if (payload.id) {
          res = await api({ action: "update", tab: "pacientes" }, "POST", payload);
        } else {
          res = await api({ action: "add", tab: "pacientes" }, "POST", payload);
        }
        if (!res.ok) return;

        await getPacientes(true);
        modal.style.display = "none";
        await renderLista();
        showToast("Paciente salvo!");
      } finally {
        UI.inflight.delete("pcSalvar");
        restore();
      }
    }

    // ===============================
    // Excluir
    // ===============================
    async function onExcluir() {
      const id = Number(fId.value);
      if (!id) return;
      if (!confirm("Excluir este paciente? Esta ação não pode ser desfeita.")) return;

      const restore = withBtnLoader(btnExcluir, "Excluindo...");
      try {
        const res = await api({ action: "delete", tab: "pacientes", id });
        if (!res.ok) return;
        await getPacientes(true);
        modal.style.display = "none";
        await renderLista();
        showToast("Paciente excluído.");
      } finally {
        restore();
      }
    }

    // ===============================
    // Cancelar atendimentos pendentes
    // ===============================
    async function onCancelarPendentes() {
      const id = Number(fId.value);
      if (!id) return;

      const scope = cancelScope.value; // 'fromToday' ou 'all'
      const restore = withBtnLoader(btnCancelPend, "Cancelando...");

      try {
        const agenda = await getAgenda();
        const hojeISO = new Date().toISOString().slice(0, 10);
        const pendentes = agenda.filter((a) => {
          if (a.pacienteId !== id) return false;
          if (a.status !== "pendente") return false;
          if (scope === "fromToday") return (a.data || "") >= hojeISO;
          return true;
        });

        if (pendentes.length === 0) {
          showToast("Não há pendentes para cancelar.");
          return;
        }

        if (!confirm(`Confirmar cancelamento de ${pendentes.length} atendimento(s) pendente(s)?`)) return;

        for (const it of pendentes) {
          // atualizar status para "nao" (não compareceu) ou excluir?
          // Aqui vamos excluir definitivamente, como descrito no bloco:
          const r = await api({ action: "delete", tab: "agenda", id: it.id });
          if (!r.ok) { showToast("Falha ao cancelar um dos itens."); break; }
        }

        await getAgenda(true);
        showToast("Agendamentos pendentes cancelados.");
      } finally {
        restore();
      }
    }
  };
})();
