// js/agenda.js
// ======================================================================
// Agenda — usa os getters/estado de window.APP (helpers.js).
// Expõe: window.Pages.agenda(contentEl)
// ======================================================================

(function () {
  window.Pages = window.Pages || {};
  const {
    api,
    getPacientes,
    getAgenda,
    showToast,
    UI,
    toISODate,
    fromISODate,
    cap,
  } = window.APP;

  const CAL = { year: null, month: null };

  // -------------------------------------------------------
  // CSS-inject (ajustes de modal, cards e loader)
  // -------------------------------------------------------
  (function injectAgendaCSS() {
    if (document.getElementById("agenda-inline-css")) return;
    const st = document.createElement("style");
    st.id = "agenda-inline-css";
    st.textContent = `
      .modal{display:none;position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.45);justify-content:center;align-items:center;padding:14px;}
      .modal .modal-content{width:min(920px,96vw);max-height:calc(100vh - 120px);overflow:auto;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.20);background:#fff;}
      .modal .modal-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;}
      .modal .modal-body{overflow:visible;}
      .day-card{border:1px solid #e5e7eb;background:#fff;border-radius:12px;padding:12px;margin-bottom:10px;box-shadow:0 1px 2px rgba(0,0,0,.04);}
      .day-card .meta{font-size:.95rem;color:#111827;display:flex;gap:12px;flex-wrap:wrap}
      .day-card .meta b{color:#374151}
      .day-card .ops{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
      .event-chip.more{background:#f1f5f9;border:1px dashed #d1d5db;color:#334155;font-weight:700;justify-content:center;cursor:pointer;}
      .event-chip.more:hover{ background:#e5e7eb; }
      .repete-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      @media (max-width:720px){ .repete-grid{grid-template-columns:1fr} }
      .btn-loading{ position:relative; pointer-events:none; opacity:.8; }
      .btn-loading::after{content:"";position:absolute;right:10px;top:50%;transform:translateY(-50%);width:14px;height:14px;border-radius:50%;border:2px solid #fff;border-top-color:transparent;animation:spin .8s linear infinite}
      @keyframes spin{to{transform:translateY(-50%) rotate(360deg)}}
    `;
    document.head.appendChild(st);
  })();

  // Helpers
  function withBtnLoader(btn, textWhile = "Salvando...") {
    const prev = { text: btn.textContent, disabled: btn.disabled };
    btn.textContent = textWhile;
    btn.classList.add("btn-loading");
    btn.disabled = true;
    return () => {
      btn.textContent = prev.text;
      btn.classList.remove("btn-loading");
      btn.disabled = prev.disabled;
    };
  }
  function createClientTypeahead(container, clientes, onPick) {
    container.innerHTML = `
      <div class="search-select">
        <input type="text" class="ta-input" placeholder="Digite para buscar cliente..." autocomplete="off">
        <div class="search-list" style="display:none;"></div>
      </div>
    `;
    const input = container.querySelector(".ta-input");
    const list = container.querySelector(".search-list");
    const render = (term = "") => {
      const t = term.trim().toLowerCase();
      const items = clientes
        .filter((c) => !t || c.nome.includes(t))
        .slice(0, 80)
        .map((c) => `<div class="search-item" data-id="${c.id}">${c.nome}</div>`)
        .join("");
      list.innerHTML = items || `<div class="search-empty">Nenhum cliente</div>`;
      list.style.display = "block";
    };
    input.addEventListener("input", () => render(input.value));
    input.addEventListener("focus", () => render(input.value));
    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) list.style.display = "none";
    });
    list.addEventListener("click", (e) => {
      const it = e.target.closest(".search-item");
      if (!it) return;
      const id = Number(it.dataset.id);
      const cli = clientes.find((c) => c.id === id);
      if (cli) {
        input.value = cli.nome;
        list.style.display = "none";
        onPick?.(cli);
      }
    });
    return {
      setValue(nome) { input.value = nome || ""; },
      clear() { input.value = ""; },
      getTerm() { return input.value.trim().toLowerCase(); },
    };
  }
  function enableBackdropClose(modalEl) {
    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) modalEl.style.display = "none";
    });
  }

  // -------------------------------------------------------
  // Página
  // -------------------------------------------------------
  window.Pages.agenda = async function agendaPage(content) {
    const today = new Date();
    CAL.year = today.getFullYear();
    CAL.month = today.getMonth();

    const pacientes = await getPacientes();
    const weekDays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

    content.innerHTML = `
      <h2>Agenda</h2>
      <div class="calendar-header">
        <div class="cal-nav" style="gap:8px;flex-wrap:wrap;">
          <button id="calPrev" class="btn-secundario">‹</button>
          <h2 id="calTitle" style="min-width:220px;text-align:center;"></h2>
          <button id="calNext" class="btn-primario">›</button>
          <button id="calToday" class="btn-secundario">Hoje</button>
          <button id="calNew" class="btn-primario">+ Novo atendimento</button>

          <span style="flex:1"></span>

          <div class="section" style="display:flex;gap:8px;align-items:center;padding:8px;border-radius:10px;">
            <label style="font-weight:700;">Cliente:</label>
            <select id="filtroClienteSelect">
              <option value="todos">Todos</option>
              ${pacientes.map((p) => `<option value="${p.id}">${p.nome}</option>`).join("")}
            </select>
            <div id="filtroClienteSearch" style="min-width:240px;"></div>
            <button id="clearFiltros" class="btn-secundario btn-mini">Limpar filtros</button>
          </div>
        </div>
      </div>

      <div class="calendar">
        <div class="cal-weekdays"><div>${weekDays.join("</div><div>")}</div></div>
        <div id="calGrid" class="cal-grid"></div>
      </div>

      <!-- Modal Novo atendimento -->
      <div id="modalAgenda" class="modal" aria-modal="true" role="dialog">
        <div class="modal-content">
          <div class="modal-head">
            <h3 style="margin:0">Novo atendimento</h3>
            <button id="agendaX" class="btn-secundario" title="Fechar">×</button>
          </div>
          <div class="modal-body">
            <form id="agendaForm" class="form-grid" novalidate>
              <label>Data:<input type="date" id="agendaData" required></label>
              <label>Hora:<input type="time" id="agendaHora" required></label>

              <label class="col-2">Paciente:
                <div id="agendaPacienteSearch"></div>
                <input type="hidden" id="agendaPacienteId" required>
              </label>

              <label>Status:
                <select id="agendaStatus">
                  <option value="pendente">Pendente</option>
                  <option value="realizado">Realizado</option>
                  <option value="nao">Não compareceu</option>
                </select>
              </label>

              <label class="col-2">Observação:
                <textarea id="agendaObs" rows="3" placeholder="Observações..."></textarea>
              </label>

              <div class="col-2" style="border-top:1px solid #eee;padding-top:8px;">
                <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                  <input type="checkbox" id="agendaRepete"> Criar com repetição
                </label>

                <div id="repeteWrap" class="repete-grid" style="display:none;">
                  <label>Frequência:
                    <select id="agendaFreq">
                      <option value="diaria">Diária</option>
                      <option value="semanal">Semanal</option>
                    </select>
                  </label>

                  <label>Repetir até:
                    <input type="date" id="agendaAte">
                  </label>

                  <div id="diasSemanaWrap" class="col-2" style="display:none;">
                    <div style="font-size:.9rem;margin-bottom:4px;">Dias da semana:</div>
                    <div style="display:flex;gap:12px;flex-wrap:wrap;">
                      ${weekDays
                        .map(
                          (d, i) => `
                        <label style="display:flex;gap:6px;align-items:center;">
                          <input type="checkbox" class="chkDiaSemana" value="${i}">${d}
                        </label>`
                        )
                        .join("")}
                    </div>
                  </div>
                </div>
              </div>

              <div class="modal-buttons col-2">
                <button type="submit" id="agendaSalvar" class="btn-primario">Salvar</button>
                <button type="button" id="agendaCancelar" class="btn-secundario">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Modal do Dia -->
      <div id="modalDia" class="modal" aria-modal="true" role="dialog">
        <div class="modal-content">
          <div class="modal-head">
            <h3 id="diaTitulo" data-iso="" style="margin:0;">Atendimentos do dia</h3>
            <button id="diaX" class="btn-secundario" title="Fechar">×</button>
          </div>
          <div class="modal-body" id="diaLista"></div>
          <div class="modal-buttons" style="padding:12px 0 4px;">
            <button type="button" id="diaNovo" class="btn-primario">+ Novo atendimento</button>
            <button type="button" id="diaFechar" class="btn-secundario">Fechar</button>
          </div>
        </div>
      </div>
    `;

    // filtros
    const sel = content.querySelector("#filtroClienteSelect");
    const pacientesLower = pacientes.map((p) => ({ ...p, nome: p.nome.toLowerCase() }));
    const searchBox = createClientTypeahead(
      content.querySelector("#filtroClienteSearch"),
      pacientesLower,
      (cli) => {
        UI.agendaFilterClienteId = cli?.id ?? "todos";
        UI.agendaFilterText = (cli?.nome || "").toLowerCase();
        sel.value = String(UI.agendaFilterClienteId);
        renderAgendaCalendar(content);
      }
    );
    sel.value = String(UI.agendaFilterClienteId);

    sel.addEventListener("change", () => {
      UI.agendaFilterClienteId = sel.value;
      if (sel.value === "todos") {
        UI.agendaFilterText = "";
        searchBox.clear();
      } else {
        const p = pacientesLower.find((x) => String(x.id) === String(sel.value));
        if (p) searchBox.setValue(p.nome);
        UI.agendaFilterText = p?.nome || "";
      }
      renderAgendaCalendar(content);
    });

    content.querySelector("#clearFiltros").addEventListener("click", () => {
      UI.agendaFilterClienteId = "todos";
      UI.agendaFilterText = "";
      sel.value = "todos";
      searchBox.clear();
      renderAgendaCalendar(content);
    });

    // navegação
    content.querySelector("#calPrev").onclick = async () => {
      CAL.month--;
      if (CAL.month < 0) { CAL.month = 11; CAL.year--; }
      await renderAgendaCalendar(content);
    };
    content.querySelector("#calNext").onclick = async () => {
      CAL.month++;
      if (CAL.month > 11) { CAL.month = 0; CAL.year++; }
      await renderAgendaCalendar(content);
    };
    content.querySelector("#calToday").onclick = async () => {
      const n = new Date(); CAL.year = n.getFullYear(); CAL.month = n.getMonth();
      await renderAgendaCalendar(content);
    };
    content.querySelector("#calNew").onclick = () => abrirModalAgenda(content);

    // modal novo
    const modalAgenda = content.querySelector("#modalAgenda");
    enableBackdropClose(modalAgenda);
    content.querySelector("#agendaX").onclick = () => fecharModalAgenda(content);
    content.querySelector("#agendaCancelar").onclick = () => fecharModalAgenda(content);

    createClientTypeahead(
      content.querySelector("#agendaPacienteSearch"),
      pacientesLower,
      (cli) => { content.querySelector("#agendaPacienteId").value = cli ? cli.id : ""; }
    );

    const repete = content.querySelector("#agendaRepete");
    const repeteWrap = content.querySelector("#repeteWrap");
    const freqSel = content.querySelector("#agendaFreq");
    const diasWrap = content.querySelector("#diasSemanaWrap");
    repete.addEventListener("change", () => {
      repeteWrap.style.display = repete.checked ? "grid" : "none";
    });
    freqSel.addEventListener("change", () => {
      diasWrap.style.display = freqSel.value === "semanal" ? "block" : "none";
    });

    content.querySelector("#agendaForm").addEventListener("submit", (e) =>
      salvarAgendaModal(e, content)
    );

    // modal do dia
    const modalDia = content.querySelector("#modalDia");
    enableBackdropClose(modalDia);
    content.querySelector("#diaX").onclick = () => fecharModalDia(content);
    content.querySelector("#diaFechar").onclick = () => fecharModalDia(content);
    content.querySelector("#diaNovo").onclick = () => {
      const iso = content.querySelector("#diaTitulo").dataset.iso;
      fecharModalDia(content);
      abrirModalAgenda(content, iso);
    };

    await renderAgendaCalendar(content);
  };

  // -------------------------------------------------------
  // Calendário
  // -------------------------------------------------------
  async function renderAgendaCalendar(content) {
    const title = content.querySelector("#calTitle");
    const grid  = content.querySelector("#calGrid");
    const agenda = await getAgenda();
    const pacientes = await getPacientes();

    const titulo = new Date(CAL.year, CAL.month, 1).toLocaleDateString("pt-BR", {
      month: "long", year: "numeric",
    });
    title.textContent = cap(titulo);

    const firstDay = new Date(CAL.year, CAL.month, 1);
    const startWeekday = firstDay.getDay();
    const gridStart = new Date(CAL.year, CAL.month, 1 - startWeekday);
    const todayISO = toISODate(new Date());

    const filterId = UI.agendaFilterClienteId;
    const filterText = (UI.agendaFilterText || "").toLowerCase();

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = toISODate(d);
      const inCurrentMonth = d.getMonth() === CAL.month;

      const events = agenda
        .filter((ev) => ev.data === iso)
        .filter((ev) => (filterId === "todos" ? true : ev.pacienteId === Number(filterId)))
        .filter((ev) => {
          if (!filterText) return true;
          const p = pacientes.find((px) => px.id === ev.pacienteId);
          return (p?.nome || "").toLowerCase().includes(filterText);
        })
        .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

      const visible = events.slice(0, 2);
      const hiddenCount = events.length - visible.length;

      const chipsVisible = visible
        .map((ev) => {
          const p = pacientes.find((px) => px.id === ev.pacienteId);
          const name = p ? p.nome : "Paciente removido";
          const hora = ev.hora ? `${ev.hora} ` : "";
          const cls =
            ev.status === "realizado" ? "done" :
            ev.status === "nao"       ? "missed" : "pending";
          return `
            <div class="event-chip ${cls}" title="${hora}${name}${ev.obs ? "\n" + ev.obs : ""}">
              <span class="event-name">${hora}${name}</span>
            </div>`;
        })
        .join("");

      const moreChip =
        hiddenCount > 0
          ? `<div class="event-chip more" data-date="${iso}" title="Ver mais atendimentos">+${hiddenCount}</div>`
          : "";

      const isToday = iso === todayISO;
      cells.push(`
        <div class="cal-day ${inCurrentMonth ? "" : "other-month"} ${isToday ? "today" : ""}" data-date="${iso}">
          <div class="cal-day-header"><span class="cal-day-number">${d.getDate()}</span></div>
          <div class="cal-events">
            ${chipsVisible}
            ${moreChip}
          </div>
        </div>`);
    }

    grid.innerHTML = cells.join("");

    grid.querySelectorAll(".cal-day").forEach((cell) => {
      const iso = cell.getAttribute("data-date");
      cell.addEventListener("click", () => abrirModalDia(content, iso));
    });
    grid.querySelectorAll(".event-chip.more").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        abrirModalDia(content, chip.getAttribute("data-date"));
      });
    });
  }

  // -------------------------------------------------------
  // Modal Novo atendimento
  // -------------------------------------------------------
  function abrirModalAgenda(content, isoDate) {
    content.querySelector("#agendaData").value = isoDate || toISODate(new Date());
    content.querySelector("#agendaHora").value = "";
    content.querySelector("#agendaObs").value = "";
    content.querySelector("#agendaPacienteId").value = "";
    const inputBusca = content.querySelector("#agendaPacienteSearch .ta-input");
    if (inputBusca) inputBusca.value = "";
    content.querySelector("#agendaStatus").value = "pendente";
    content.querySelector("#repeteWrap").style.display = "none";
    content.querySelector("#diasSemanaWrap").style.display = "none";
    content.querySelector("#agendaRepete").checked = false;
    content.querySelector("#modalAgenda").style.display = "flex";
  }
  function fecharModalAgenda(content) {
    content.querySelector("#modalAgenda").style.display = "none";
  }

  async function salvarAgendaModal(e, content) {
    e.preventDefault();
    const btn = content.querySelector("#agendaSalvar");
    if (UI.inflight.has("agendaSalvar")) return;
    UI.inflight.add("agendaSalvar");
    const restore = withBtnLoader(btn, "Salvando...");

    try {
      const dataStr = content.querySelector("#agendaData").value;
      const hora = content.querySelector("#agendaHora").value;
      const pacienteId = parseInt(content.querySelector("#agendaPacienteId").value, 10);
      const obs = content.querySelector("#agendaObs").value.trim();
      const status = content.querySelector("#agendaStatus").value;

      if (!dataStr || !hora || !pacienteId) {
        showToast("Preencha todos os campos obrigatórios.");
        return;
      }

      const repete = content.querySelector("#agendaRepete").checked;
      const freq = content.querySelector("#agendaFreq").value;
      const ateStr = content.querySelector("#agendaAte").value;
      const diasChk = Array.from(content.querySelectorAll(".chkDiaSemana:checked")).map((c) => Number(c.value));

      const diasGerar = [];
      if (!repete) {
        diasGerar.push(dataStr);
      } else {
        const inicio = fromISODate(dataStr);
        const fim = ateStr ? fromISODate(ateStr) : inicio;
        if (fim < inicio) fim.setTime(inicio.getTime());
        const cur = new Date(inicio);
        while (cur <= fim) {
          if (freq === "diaria") {
            diasGerar.push(toISODate(cur));
          } else {
            const d = cur.getDay();
            if (diasChk.length === 0) {
              if (d === inicio.getDay()) diasGerar.push(toISODate(cur));
            } else {
              if (diasChk.includes(d)) diasGerar.push(toISODate(cur));
            }
          }
          cur.setDate(cur.getDate() + 1);
        }
      }

      const all = await getAgenda();
      const conflitos = diasGerar.filter((iso) =>
        all.some((a) => a.data === iso && a.hora === hora && a.pacienteId !== pacienteId)
      );
      if (conflitos.length) {
        const msg =
          conflitos.length === 1
            ? `Já existe atendimento nesse horário (${hora}) em ${conflitos[0]}. Deseja salvar mesmo assim?`
            : `Já existem ${conflitos.length} conflitos para ${hora} nos dias:\n- ${conflitos.join("\n- ")}\nDeseja salvar mesmo assim?`;
        if (!confirm(msg)) return;
      }

      for (const iso of diasGerar) {
        const atendimento = { pacienteId, data: iso, hora, obs, status, nfeNumero: "" };
        const result = await api({ action: "add", tab: "agenda" }, "POST", atendimento);
        if (!result.ok) { showToast("Erro ao salvar um dos itens. Tente novamente."); return; }
      }

      await getAgenda(true);
      fecharModalAgenda(content);
      await renderAgendaCalendar(content);
      showToast("Atendimento salvo!");
    } finally {
      UI.inflight.delete("agendaSalvar");
      restore();
    }
  }

  // -------------------------------------------------------
  // Modal do dia
  // -------------------------------------------------------
  async function abrirModalDia(content, isoDate) {
    const modal = content.querySelector("#modalDia");
    const titulo = content.querySelector("#diaTitulo");
    const lista = content.querySelector("#diaLista");
    const pacientes = await getPacientes();
    const all = await getAgenda();

    const dataBR = fromISODate(isoDate).toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });
    titulo.textContent = cap(dataBR);
    titulo.dataset.iso = isoDate;

    const doDia = all
      .filter((a) => a.data === isoDate)
      .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

    if (doDia.length === 0) {
      lista.innerHTML = `<p>Sem atendimentos neste dia.</p>`;
    } else {
      lista.innerHTML = doDia.map((a) => {
        const p = pacientes.find((px) => px.id === a.pacienteId);
        const nome = p ? p.nome : "Paciente removido";
        const valor = p?.valor || "R$ 0,00";
        return `
          <div class="day-card" data-id="${a.id}">
            <div class="meta">
              <div><b>paciente:</b> ${nome}</div>
              <div><b>hora:</b> ${a.hora || "--:--"}</div>
              <div><b>valor:</b> ${valor}</div>
            </div>

            <div style="display:grid;grid-template-columns:220px 1fr;gap:12px;align-items:start;margin-top:10px;">
              <label>status:
                <select class="dia-status" data-id="${a.id}">
                  <option value="pendente"  ${a.status === "pendente" ? "selected" : ""}>pendente</option>
                  <option value="realizado" ${a.status === "realizado" ? "selected" : ""}>realizado</option>
                  <option value="nao"       ${a.status === "nao" ? "selected" : ""}>não compareceu</option>
                </select>
              </label>
              <label>observação:
                <textarea class="dia-obs" data-id="${a.id}" rows="2" style="width:100%;">${a.obs || ""}</textarea>
              </label>
            </div>

            <div class="ops">
              <button class="btn-primario btn-quick-done" data-id="${a.id}">marcar como realizado</button>
              <button class="btn-secundario btn-quick-cancel" data-id="${a.id}">cancelar atendimento</button>
              <button class="btn-perigo" data-del-id="${a.id}">Excluir</button>
            </div>
          </div>`;
      }).join("");

      // handlers
      lista.querySelectorAll(".dia-status").forEach((sel) => {
        sel.addEventListener("change", async () => {
          const id = Number(sel.dataset.id);
          const result = await api({ action: "update", tab: "agenda" }, "POST", { id, status: sel.value });
          if (!result.ok) return;
          await getAgenda(true);
          await renderAgendaCalendar(content);
        });
      });
      lista.querySelectorAll(".dia-obs").forEach((ta) => {
        ta.addEventListener("blur", async () => {
          const id = Number(ta.dataset.id);
          await api({ action: "update", tab: "agenda" }, "POST", { id, obs: ta.value.trim() });
        });
      });
      lista.querySelectorAll(".btn-quick-done").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = Number(btn.dataset.id);
          const result = await api({ action: "update", tab: "agenda" }, "POST", { id, status: "realizado" });
          if (!result.ok) return;
          await getAgenda(true);
          await renderAgendaCalendar(content);
          const sel = lista.querySelector(`.dia-status[data-id="${id}"]`);
          if (sel) sel.value = "realizado";
        });
      });
      lista.querySelectorAll(".btn-quick-cancel").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = Number(btn.dataset.id);
          if (!confirm("Cancelar este atendimento?")) return;
          const result = await api({ action: "update", tab: "agenda" }, "POST", { id, status: "nao" });
          if (!result.ok) return;
          await getAgenda(true);
          await renderAgendaCalendar(content);
          const sel = lista.querySelector(`.dia-status[data-id="${id}"]`);
          if (sel) sel.value = "nao";
          showToast("Atendimento marcado como 'não compareceu'.");
        });
      });
      lista.querySelectorAll(".btn-perigo").forEach((b) => {
        b.addEventListener("click", async () => {
          if (!confirm("Excluir este atendimento?")) return;
          const id = Number(b.dataset.delId);
          const result = await api({ action: "delete", tab: "agenda", id });
          if (!result.ok) return;
          await getAgenda(true);
          await abrirModalDia(content, isoDate);
          await renderAgendaCalendar(content);
        });
      });
    }

    modal.style.display = "flex";
  }

  function fecharModalDia(content) {
    content.querySelector("#modalDia").style.display = "none";
  }
})();
