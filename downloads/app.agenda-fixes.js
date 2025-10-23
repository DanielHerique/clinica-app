// ===========================================
// CONFIGURAÇÃO DA API (Google Sheets Backend)
// ===========================================
// Mantém o endpoint direto informado por você. Se quiser usar o proxy Netlify, troque por '/.netlify/functions/api'.
const API_URL = 'https://script.google.com/macros/s/AKfycbyh3YoV7WOCcC80KLTuaCQsXM-JrP9UryY2FTjVXuFMgdicjB-FrPzeKWsH5-c0tMWX/exec';

// Cache em Memória
const MEMORY = {
  pacientes: null,
  agenda: null,
  nfeRegistros: null,
};

// ===========================================
// FUNÇÕES DE ACESSO À API (fetch)
// ===========================================
async function api(params = {}, method = 'GET', data = null) {
  const url = new URL(API_URL);
  for (const key in params) url.searchParams.append(key, params[key]);

  const options = { method };
  if (data && method === 'POST') {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(data);
  }

  try {
    const resp = await fetch(url.toString(), options);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json.ok) throw new Error(json.error || 'Operação falhou');
    return json;
  } catch (err) {
    console.error('Erro API:', err);
    showToast(`Erro de comunicação com a API (${String(err).replace('Error:','').trim()})`);
    return { ok: false, error: String(err) };
  }
}

// ===========================================
// UTILS GLOBAIS / ESTADO DE UI
// ===========================================
const UI = {
  pageSize: 25,
  currentPage: 1,
  searchTerm: '',
  statusFilter: 'todos',
  // Filtro do calendário por cliente
  agendaFilterClienteId: 'todos',
  // Trava anti-clique duplo em submits
  inflight: new Set(),
};

const CAL = { year: null, month: null };
const STORE = { prefix: 'clinicapp_v1_' };

function getStore(key, fallback) {
  try { return JSON.parse(localStorage.getItem(STORE.prefix + key)) ?? fallback; } catch { return fallback; }
}
function setStore(key, value) { localStorage.setItem(STORE.prefix + key, JSON.stringify(value)); }

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const normalizeText = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const onlyDigits = (s) => (s || '').replace(/\D/g, '');
function moneyToNumber(ptbrMoney) {
  if (!ptbrMoney) return 0;
  return parseFloat(ptbrMoney.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

// Migração dummy
(function migrateOnce(){ if (!localStorage.getItem('migrated_to_v1')) localStorage.setItem('migrated_to_v1','1'); })();

// ===========================================
// GETTERS (com cache)
// ===========================================
async function getPacientes(force = false) {
  if (MEMORY.pacientes && !force) return MEMORY.pacientes;
  const r = await api({ action:'list', tab:'pacientes' });
  if (!r.ok) return MEMORY.pacientes ||= [];
  MEMORY.pacientes = (r.data || []).map(p => {
    const nome = String(p.nome||'').toLowerCase();
    const email = String(p.email||'').toLowerCase();
    const telefone = String(p.telefone||'');
    const cpf = String(p.cpf||'');
    return {
      id: Number(p.id),
      nome, email, telefone, cpf,
      nascimento: String(p.dataNascimento||'').toLowerCase(),
      valor: String(p.valorSessao||'').toLowerCase(),
      status: String(p.status||'ativo').toLowerCase(),
      obs: String(p.obs||'').toLowerCase(),
      createdAt: String(p.createdAt || new Date().toISOString()),
      search_norm: normalizeText(nome+' '+email),
      search_digits: onlyDigits(telefone+cpf),
    };
  });
  return MEMORY.pacientes;
}
async function getAgenda(force = false) {
  if (MEMORY.agenda && !force) return MEMORY.agenda;
  const r = await api({ action:'list', tab:'agenda' });
  if (!r.ok) return MEMORY.agenda ||= [];
  MEMORY.agenda = (r.data || []).map(a => ({
    ...a,
    id: Number(a.id),
    pacienteId: Number(a.pacienteId),
    obs: String(a.obs || ''),
    nfeNumero: String(a.nfeNumero || ''),
    status: String(a.status || 'pendente').toLowerCase(),
  }));
  return MEMORY.agenda;
}
async function getNFEs(force = false) {
  if (MEMORY.nfeRegistros && !force) return MEMORY.nfeRegistros;
  const r = await api({ action:'list', tab:'nfeRegistros' });
  if (!r.ok) return MEMORY.nfeRegistros ||= [];
  MEMORY.nfeRegistros = (r.data || []).map(x => ({
    id: Number(x.id),
    clienteId: Number(x.clienteId),
    clienteNome: String(x.clienteNome||''),
    mesRef: String(x.mesRef||''),
    codigo: String(x.codigo||''),
    valor: String(x.valor||''),
    enviada: String(x.enviada||'nao') === 'true' || String(x.enviada||'nao') === 'sim',
    paga: String(x.paga||'nao') === 'true' || String(x.paga||'nao') === 'sim',
    createdAt: String(x.createdAt || new Date().toISOString()),
  }));
  return MEMORY.nfeRegistros;
}

// ===========================================
// HELPERS: Modal / Toast
// ===========================================
function createModal({ id, title, onMount }) {
  let modal = document.getElementById(id);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content" role="dialog" aria-modal="true">
        <div class="modal-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h3 style="margin:0">${title || ''}</h3>
          <button class="modal-x btn-secundario" title="Fechar">×</button>
        </div>
        <div class="modal-body"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.modal-x').onclick = () => (modal.style.display='none');
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display='none'; });
  }
  const body = modal.querySelector('.modal-body');
  body.innerHTML = '';
  onMount?.(body, modal);
  modal.style.display = 'flex';
  return modal;
}
function showToast(msg, {undo,onUndo}={}){
  const bar = document.createElement('div');
  bar.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:20px;background:#111827;color:#fff;padding:10px 14px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);z-index:9999;display:flex;gap:10px;align-items:center;';
  bar.innerHTML = `<span>${msg}</span>`;
  if (undo){
    const u=document.createElement('button');
    u.className='btn-secundario'; u.textContent='Desfazer';
    u.onclick=()=>{ onUndo?.(); document.body.removeChild(bar); };
    bar.appendChild(u);
  }
  document.body.appendChild(bar);
  setTimeout(()=>{ if (document.body.contains(bar)) document.body.removeChild(bar); }, 4000);
}

// ===========================================
// TYPEAHEAD (com filtro conforme digita)
// ===========================================
function buildClientSearch(containerId, clientes, onSelect, { includeTodos=false, placeholder='Digite para buscar...' } = {}) {
  const cont = document.getElementById(containerId);
  cont.innerHTML = `
    <div class="search-select">
      <input type="text" id="${containerId}_input" placeholder="${placeholder}" autocomplete="off">
      <div class="search-list" id="${containerId}_list"></div>
    </div>`;
  const input = document.getElementById(`${containerId}_input`);
  const list = document.getElementById(`${containerId}_list`);
  const base = includeTodos ? [{id:'todos', nome:'Todos'}, ...clientes] : clientes;

  const render = (term='') => {
    const t = term.trim().toLowerCase();
    const items = base
      .filter(c => !t || c.nome.toLowerCase().includes(t))
      .slice(0, 120)
      .map(c => `<div class="search-item" data-id="${c.id}">${c.nome}</div>`)
      .join('');
    list.innerHTML = items || `<div class="search-empty">Nenhum cliente</div>`;
    list.style.display = 'block';
  };
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('focus', () => render(input.value));
  document.addEventListener('click', (e)=>{ if (!cont.contains(e.target)) list.style.display='none'; });
  list.addEventListener('click', (e)=>{
    const it = e.target.closest('.search-item'); if (!it) return;
    const id = it.dataset.id === 'todos' ? 'todos' : Number(it.dataset.id);
    const cli = it.dataset.id === 'todos' ? {id:'todos', nome:'Todos'} : base.find(c => c.id === id);
    input.value = cli?.nome || '';
    list.style.display='none';
    onSelect?.(cli);
  });
  if (!document.getElementById('search-select-css')) {
    const style = document.createElement('style');
    style.id='search-select-css';
    style.textContent = `.search-select{position:relative}.search-select input{width:100%}.search-list{position:absolute;left:0;right:0;top:100%;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.08);z-index:50;display:none;max-height:260px;overflow:auto}.search-item{padding:8px 10px;cursor:pointer}.search-item:hover{background:#f3f4f6}.search-empty{padding:8px 10px;color:#6b7280}`;
    document.head.appendChild(style);
  }
  return {
    getSelected: () => {
      if (includeTodos && input.value.trim().toLowerCase()==='todos') return {id:'todos', nome:'Todos'};
      return clientes.find(c => c.nome === input.value) || null;
    },
    setValue: (nome) => { input.value = nome || ''; },
    clear: () => { input.value=''; }
  };
}

// ===========================================
// PACIENTES (lista) — mantido resumido
// ===========================================
// (Para focar nas correções da agenda, omitimos as telas completas não solicitadas. 
// Se você quiser o arquivo completo com todas as telas reproduzidas, me avise que gero a versão integral.)
async function pagePacientes(content){ content.innerHTML = '<h2>Pacientes</h2><p>A tela de pacientes permanece igual à versão anterior.</p>'; }

// ===========================================
// AGENDA — Correções solicitadas
// ===========================================
async function pageAgenda(content){
  const today = new Date();
  CAL.year = today.getFullYear();
  CAL.month = today.getMonth();

  const pacientes = await getPacientes();

  const weekDays = ['dom','seg','ter','qua','qui','sex','sáb'];

  content.innerHTML = `
    <h2>Agenda</h2>
    <div class="calendar-header">
      <div class="cal-nav">
        <button id="calPrev" class="btn-secundario">‹</button>
        <h2 id="calTitle"></h2>
        <button id="calNext" class="btn-primario">›</button>
        <button id="calToday" class="btn-secundario">Hoje</button>
        <button id="calNew" class="btn-primario">+ Novo atendimento</button>
        <span style="flex:1"></span>
        <div style="min-width:280px" id="agendaClienteFilter"></div>
      </div>
    </div>

    <div class="calendar">
      <div class="cal-weekdays"><div>${weekDays.join('</div><div>')}</div></div>
      <div id="calGrid" class="cal-grid"></div>
    </div>

    <!-- Modal Novo Atendimento -->
    <div id="modalAgenda" class="modal">
      <div class="modal-content" style="max-width:720px;">
        <h3 style="margin-bottom:8px;">Novo atendimento</h3>
        <form id="agendaForm" class="form-grid" novalidate>
          <label>Data:
            <input type="date" id="agendaData" required>
          </label>
          <label>Hora:
            <input type="time" id="agendaHora" required>
          </label>

          <label style="grid-column:1/-1">Paciente:
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

          <label style="grid-column:1/-1">Observação (opcional):
            <textarea id="agendaObs" rows="3" placeholder="Observações sobre o atendimento..."></textarea>
          </label>

          <div style="grid-column:1/-1;border-top:1px solid #eee;margin-top:8px;padding-top:8px;">
            <label style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="agendaRepete"> Criar com repetição
            </label>
            <div id="repeteWrap" style="display:none;margin-top:8px;gap:12px;align-items:flex-start" class="form-grid">
              <label>Frequência:
                <select id="agendaFreq">
                  <option value="diaria">Diariamente</option>
                  <option value="semanal">Semanalmente</option>
                </select>
              </label>
              <div id="diasSemanaWrap" style="display:none;">
                <div style="font-size:.9rem;margin-bottom:4px;">Dias da semana:</div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                  ${weekDays.map((d,i)=>`
                    <label style="display:flex;gap:6px;align-items:center;">
                      <input type="checkbox" class="chkDiaSemana" value="${i}">${d}
                    </label>`).join('')}
                </div>
              </div>
              <label>Repetir até:
                <input type="date" id="agendaAte">
              </label>
            </div>
          </div>

          <div class="modal-buttons" style="grid-column:1/-1;">
            <button type="submit" id="agendaSalvar" class="btn-primario">Salvar</button>
            <button type="button" id="agendaCancelar" class="btn-secundario">Cancelar</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Modal do Dia -->
    <div id="modalDia" class="modal">
      <div class="modal-content" style="max-width:640px;">
        <h3 id="diaTitulo" data-iso=""></h3>
        <div id="diaLista"></div>
        <div class="modal-buttons">
          <button type="button" id="diaNovo" class="btn-primario">+ Novo atendimento</button>
          <button type="button" id="diaFechar" class="btn-secundario">Fechar</button>
        </div>
      </div>
    </div>
  `;

  // TYPEAHEAD (filtro calendário)
  buildClientSearch('agendaClienteFilter', [{id:'todos',nome:'Todos'}, ...pacientes], (cli) => {
    UI.agendaFilterClienteId = cli?.id ?? 'todos';
    renderAgendaCalendar();
  }, { includeTodos:true, placeholder:'Filtrar por cliente (Agenda)...' });

  // TYPEAHEAD (seleção do modal)
  buildClientSearch('agendaPacienteSearch', pacientes, (cli) => {
    document.getElementById('agendaPacienteId').value = cli ? cli.id : '';
  }, { placeholder:'Digite para buscar ou selecione um paciente...' });

  // Navegação
  document.getElementById('calPrev').addEventListener('click', ()=>{ CAL.month--; if(CAL.month<0){CAL.month=11;CAL.year--;} renderAgendaCalendar(); });
  document.getElementById('calNext').addEventListener('click', ()=>{ CAL.month++; if(CAL.month>11){CAL.month=0;CAL.year++;} renderAgendaCalendar(); });
  document.getElementById('calToday').addEventListener('click', ()=>{ const now=new Date(); CAL.year=now.getFullYear(); CAL.month=now.getMonth(); renderAgendaCalendar(); });
  document.getElementById('calNew').addEventListener('click', ()=> abrirModalAgenda());

  // Modal novo
  document.getElementById('agendaCancelar').addEventListener('click', fecharModalAgenda);
  // Travar submits duplicados
  document.getElementById('agendaForm').addEventListener('submit', salvarAgendaModal);

  // Recorrência – mostra/esconde
  const repete = document.getElementById('agendaRepete');
  const wrap = document.getElementById('repeteWrap');
  const freq = document.getElementById('agendaFreq');
  const diasWrap = document.getElementById('diasSemanaWrap');
  repete.addEventListener('change', ()=> (wrap.style.display = repete.checked ? 'grid' : 'none'));
  freq.addEventListener('change', ()=> (diasWrap.style.display = freq.value === 'semanal' ? 'block' : 'none'));

  // Modal do dia
  document.getElementById('diaFechar').addEventListener('click', fecharModalDia);
  document.getElementById('diaNovo').addEventListener('click', ()=>{
    const iso = document.getElementById('diaTitulo').dataset.iso;
    fecharModalDia(); abrirModalAgenda(iso);
  });

  renderAgendaCalendar();
}

async function renderAgendaCalendar(){
  const title = document.getElementById('calTitle');
  const grid = document.getElementById('calGrid');
  const agenda = await getAgenda(); // usa cache
  const pacientes = await getPacientes();

  // Título
  const titulo = new Date(CAL.year, CAL.month, 1).toLocaleDateString('pt-BR',{ month:'long', year:'numeric' });
  const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
  title.textContent = cap(titulo);

  const firstDay = new Date(CAL.year, CAL.month, 1);
  const startWeekday = firstDay.getDay();
  const gridStart = new Date(CAL.year, CAL.month, 1 - startWeekday);
  const todayISO = toISODate(new Date());

  const filterId = UI.agendaFilterClienteId;

  const cells = [];
  for (let i=0;i<42;i++){
    const d = new Date(gridStart); d.setDate(gridStart.getDate()+i);
    const inCurrentMonth = d.getMonth() === CAL.month;
    const iso = toISODate(d);

    const events = agenda
      .filter(ev => ev.data === iso)
      .filter(ev => filterId === 'todos' ? true : ev.pacienteId === Number(filterId))
      .sort((a,b)=> (a.hora||'').localeCompare(b.hora||''));

    // Conflitos
    const horas = events.reduce((acc,ev)=>{ if(ev.hora){acc[ev.hora]=(acc[ev.hora]||0)+1;} return acc; },{});
    const horasConflitantes = new Set(Object.keys(horas).filter(h => horas[h]>1));

    const chips = events.map(ev => {
      const p = pacientes.find(px => px.id === ev.pacienteId);
      const name = p ? p.nome : 'Paciente removido';
      const hora = ev.hora ? `${ev.hora} ` : '';
      const cls = ev.status === 'realizado' ? 'done' : ev.status === 'nao' ? 'missed' : 'pending';
      const hasConflict = ev.hora && horasConflitantes.has(ev.hora);
      return `<div class="event-chip ${cls} ${hasConflict ? 'conflict' : ''}" title="${hora}${name}${ev.obs ? '\n'+ev.obs : ''}">
        <span class="event-name">${hora}${name}</span>
        <button class="event-del" data-agenda-id="${ev.id ?? ''}" aria-label="Remover">×</button>
      </div>`;
    }).join('');

    const isToday = iso === todayISO;
    cells.push(`<div class="cal-day ${inCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''}" data-date="${iso}">
      <div class="cal-day-header"><span class="cal-day-number">${d.getDate()}</span></div>
      <div class="cal-events">${chips}</div>
    </div>`);
  }

  grid.innerHTML = cells.join('');

  // Remover evento
  grid.querySelectorAll('.event-del').forEach(btn => {
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      if (!confirm('Remover este atendimento?')) return;
      const id = btn.getAttribute('data-agenda-id');
      const res = await api({ action:'delete', tab:'agenda', id });
      if (!res.ok) return;
      await getAgenda(true);
      renderAgendaCalendar();
    });
  });

  // Abrir detalhes do dia
  grid.querySelectorAll('.cal-day').forEach(cell => {
    cell.addEventListener('click', async (e)=>{
      if (e.target.closest('.event-del')) return;
      await abrirModalDia(cell.getAttribute('data-date'));
    });
  });
}

function abrirModalAgenda(isoDate){
  const modal = document.getElementById('modalAgenda');
  document.getElementById('agendaData').value = isoDate || toISODate(new Date());
  document.getElementById('agendaHora').value = '';
  document.getElementById('agendaObs').value = '';
  document.getElementById('agendaPacienteId').value = '';
  const searchInput = document.querySelector('#agendaPacienteSearch input');
  if (searchInput) searchInput.value='';
  document.getElementById('agendaStatus').value='pendente';
  modal.style.display='flex';
}
function fecharModalAgenda(){ document.getElementById('modalAgenda').style.display='none'; }

async function salvarAgendaModal(e){
  e.preventDefault();
  const submitBtn = document.getElementById('agendaSalvar');

  // anti-duplo clique
  if (UI.inflight.has('agendaSalvar')) return;
  UI.inflight.add('agendaSalvar'); submitBtn.disabled = true;

  try{
    const dataStr = document.getElementById('agendaData').value;
    const hora = document.getElementById('agendaHora').value;
    const pacienteId = parseInt(document.getElementById('agendaPacienteId').value,10);
    const obs = document.getElementById('agendaObs').value.trim();
    const status = document.getElementById('agendaStatus').value;
    if (!dataStr || !hora || !pacienteId) { showToast('Preencha todos os campos obrigatórios.'); return; }

    const repete = document.getElementById('agendaRepete').checked;
    const freq = document.getElementById('agendaFreq').value;
    const ateStr = document.getElementById('agendaAte').value;
    const diasChk = Array.from(document.querySelectorAll('.chkDiaSemana:checked')).map(c => Number(c.value));

    const all = await getAgenda();
    const diasGerar = [];
    if (!repete){ diasGerar.push(dataStr); } else {
      const inicio = fromISODate(dataStr);
      const fim = ateStr ? fromISODate(ateStr) : inicio;
      if (fim < inicio) fim.setTime(inicio.getTime());
      const cur = new Date(inicio);
      while (cur <= fim){
        if (freq === 'diaria'){
          diasGerar.push(toISODate(cur));
        } else {
          const d = cur.getDay();
          if (diasChk.length===0) {
            const diaInicio = inicio.getDay();
            if (d === diaInicio) diasGerar.push(toISODate(cur));
          } else {
            if (diasChk.includes(d)) diasGerar.push(toISODate(cur));
          }
        }
        cur.setDate(cur.getDate()+1);
      }
    }

    // conflito
    const diasComConflito = diasGerar.filter(iso => 
      all.some(a => a.data===iso && a.hora===hora && a.pacienteId !== pacienteId)
    );
    if (diasComConflito.length){
      const msg = diasComConflito.length === 1
        ? `Já existe atendimento nesse horário (${hora}) em ${diasComConflito[0]}. Deseja salvar mesmo assim?`
        : `Já existem ${diasComConflito.length} conflitos para o horário ${hora} nos dias:\n- ${diasComConflito.join('\n- ')}\nDeseja salvar mesmo assim?`;
      if (!window.confirm(msg)) return;
    }

    // grava
    for (const iso of diasGerar){
      const atendimento = { pacienteId, data: iso, hora, obs, status, nfeNumero: '' };
      const r = await api({ action:'add', tab:'agenda' }, 'POST', atendimento);
      if (!r.ok){ showToast('Erro ao salvar um dos itens.'); return; }
    }

    await getAgenda(true);
    fecharModalAgenda(); // fecha automaticamente após salvar
    renderAgendaCalendar();
  } finally {
    UI.inflight.delete('agendaSalvar');
    submitBtn.disabled = false;
  }
}

async function abrirModalDia(isoDate){
  const modal = document.getElementById('modalDia');
  const titulo = document.getElementById('diaTitulo');
  const lista = document.getElementById('diaLista');
  const pacientes = await getPacientes();
  const all = await getAgenda();

  const dataBR = fromISODate(isoDate).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const cap = (s)=> s.charAt(0).toUpperCase()+s.slice(1);
  titulo.textContent = cap(dataBR);
  titulo.dataset.iso = isoDate;

  const doDia = all.filter(a => a.data===isoDate).sort((a,b)=> (a.hora||'').localeCompare(b.hora||''));

  const horas = doDia.reduce((acc,ev)=>{ if(ev.hora){acc[ev.hora]=(acc[ev.hora]||0)+1;} return acc; },{});
  const horasConflitantes = new Set(Object.keys(horas).filter(h => horas[h]>1));

  if (!doDia.length){ lista.innerHTML = '<p>Sem atendimentos neste dia.</p>'; }
  else {
    lista.innerHTML = doDia.map(a => {
      const p = pacientes.find(px => px.id === a.pacienteId);
      const nome = p ? p.nome : 'Paciente removido';
      const conflitoBadge = a.hora && horasConflitantes.has(a.hora) ? `<span class="badge missed" style="margin-left:auto;">Conflito</span>` : '';
      return `<div class="day-card" data-id="${a.id}">
        <div class="meta" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
          <div><b>paciente:</b> ${nome}</div>
          <div><b>hora:</b> ${a.hora || '--:--'}</div>
          <div><b>valor:</b> ${p?.valor || 'R$ 0,00'}</div>
          ${conflitoBadge}
        </div>
        <div style="display:grid;grid-template-columns:180px 1fr;gap:10px;align-items:start;margin-top:8px;">
          <label>status:
            <select class="dia-status" data-id="${a.id}">
              <option value="pendente" ${a.status==='pendente'?'selected':''}>pendente</option>
              <option value="realizado" ${a.status==='realizado'?'selected':''}>realizado</option>
              <option value="nao" ${a.status==='nao'?'selected':''}>não compareceu</option>
            </select>
          </label>
          <label>observação:
            <textarea class="dia-obs" data-id="${a.id}" rows="2" style="width:100%;">${a.obs || ''}</textarea>
          </label>
        </div>
        <div class="ops" style="display:flex;gap:8px;margin-top:8px;">
          <button class="btn-primario btn-quick-done" data-id="${a.id}">marcar como realizado</button>
          <button class="btn-secundario btn-quick-cancel" data-id="${a.id}">cancelar atendimento</button>
          <button class="btn-excluir" data-del-id="${a.id}">Excluir</button>
        </div>
      </div>`;
    }).join('');

    // status
    lista.querySelectorAll('.dia-status').forEach(sel => {
      sel.addEventListener('change', async ()=>{
        const id = Number(sel.dataset.id);
        const r = await api({ action:'update', tab:'agenda' }, 'POST', { id, status: sel.value });
        if (!r.ok) return;
        await getAgenda(true); renderAgendaCalendar();
      });
    });
    // obs
    lista.querySelectorAll('.dia-obs').forEach(ta => {
      ta.addEventListener('blur', async ()=>{
        const id = Number(ta.dataset.id);
        await api({ action:'update', tab:'agenda' }, 'POST', { id, obs: ta.value.trim() });
      });
    });
    // ações rápidas
    lista.querySelectorAll('.btn-quick-done').forEach(btn => {
      btn.addEventListener('click', async ()=>{
        const id = Number(btn.dataset.id);
        const r = await api({ action:'update', tab:'agenda' }, 'POST', { id, status:'realizado' });
        if (!r.ok) return;
        await getAgenda(true); renderAgendaCalendar();
        const sel = lista.querySelector(`.dia-status[data-id="${id}"]`); if (sel) sel.value='realizado';
      });
    });
    lista.querySelectorAll('.btn-quick-cancel').forEach(btn => {
      btn.addEventListener('click', async ()=>{
        const id = Number(btn.dataset.id);
        if (!confirm('Cancelar este atendimento?')) return;
        const r = await api({ action:'update', tab:'agenda' }, 'POST', { id, status:'nao' });
        if (!r.ok) return;
        await getAgenda(true); renderAgendaCalendar();
        const sel = lista.querySelector(`.dia-status[data-id="${id}"]`); if (sel) sel.value='nao';
        showToast("Atendimento marcado como 'não compareceu'.");
      });
    });
    // excluir
    lista.querySelectorAll('.btn-excluir').forEach(b => {
      b.addEventListener('click', async ()=>{
        if (!confirm('Excluir este atendimento?')) return;
        const id = Number(b.dataset.delId);
        const r = await api({ action:'delete', tab:'agenda', id });
        if (!r.ok) return;
        await getAgenda(true); await abrirModalDia(isoDate); renderAgendaCalendar();
      });
    });
  }
  modal.style.display = 'flex';
}
function fecharModalDia(){ document.getElementById('modalDia').style.display='none'; }

// ===========================================
// NF-e (placeholder para manter rotas)
async function pageFiscal(content){ content.innerHTML='<h2>Fiscal</h2><p>Sem alterações para esta etapa.</p>'; }
async function pageNFe(content){ content.innerHTML='<h2>NF-e</h2><p>Sem alterações para esta etapa.</p>'; }

// ===========================================
// Máscaras (mantidas)
function mascaraCPF(input){ input.value = input.value.replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2'); }
function mascaraData(input){ input.value = input.value.replace(/\D/g,'').replace(/(\d{2})(\d)/,'$1/$2').replace(/(\d{2})(\d)/,'$1/$2'); }
function mascaraMoeda(input){ let v=input.value.replace(/\D/g,''); v=(v/100).toFixed(2)+''; v=v.replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.'); input.value='R$ '+v; }
function mascaraTelefone(input){ let v=input.value.replace(/\D/g,''); v = v.length<=10 ? v.replace(/^(\d{2})(\d{4})(\d)/,'($1) $2-$3') : v.replace(/^(\d{2})(\d{5})(\d)/,'($1) $2-$3'); input.value=v; }

// ===========================================
// ROTEAMENTO
window.onload = () => showPage('agenda');
async function showPage(page){
  const content = document.getElementById('content');
  if (!MEMORY.pacientes){ content.innerHTML='<div style="padding:20px;text-align:center">Carregando dados...</div>'; await getPacientes(true); await getAgenda(true); }
  document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
  const btn = document.querySelector(`nav button[onclick="showPage('${page}')"]`); if (btn) btn.classList.add('active');
  content.innerHTML = `<div class="page-indicator"><span>Você está na aba <strong>${({pacientes:'Pacientes',agenda:'Agenda',fiscal:'Fiscal',nfe:'NF-e'})[page]||''}</strong></span></div>`;
  switch(page){
    case 'pacientes': return await pagePacientes(content);
    case 'agenda':    return await pageAgenda(content);
    case 'fiscal':    return await pageFiscal(content);
    case 'nfe':       return await pageNFe(content);
  }
}
