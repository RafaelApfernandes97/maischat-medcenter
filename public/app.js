const $ = (id) => document.getElementById(id);

// Sessao expirada/ausente: qualquer 401 leva de volta ao login.
const _fetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const resp = await _fetch(...args);
  if (resp.status === 401) {
    window.location.href = '/login';
    throw new Error('Sessão expirada.');
  }
  return resp;
};

// Botao "Sair": encerra a sessao e volta ao login.
document.getElementById('nav-sair')?.addEventListener('click', async () => {
  try {
    await _fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    /* ignora */
  }
  window.location.href = '/login';
});

// Ícones SVG inline (estilo Lucide, traço 1.75) usados no conteúdo gerado por JS.
const ICON = {
  x: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  info: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
};

// Atualiza só o rótulo de um botão (preserva o ícone SVG, que textContent apagaria).
function setLabel(btn, texto) {
  const lbl = btn.querySelector('.btn-label');
  if (lbl) lbl.textContent = texto;
  else btn.textContent = texto;
}

let arquivo = null;
let uploadId = null;
let loteIdAtual = null;

// ---- Etapa 1: seleção do PDF ----
const input = $('pdf');
const dz = $('dropzone');

function definirArquivo(f) {
  if (!f) return;
  if (f.type !== 'application/pdf') {
    $('upload-erro').textContent = 'O arquivo precisa ser um PDF.';
    return;
  }
  arquivo = f;
  $('upload-erro').textContent = '';
  $('dz-file').textContent = f.name;
  $('btn-processar').disabled = false;
}

input.addEventListener('change', (e) => definirArquivo(e.target.files[0]));
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', (e) => {
  e.preventDefault(); dz.classList.remove('drag');
  definirArquivo(e.dataTransfer.files[0]);
});

$('btn-processar').addEventListener('click', processar);

async function processar() {
  $('btn-processar').disabled = true;
  setLabel($('btn-processar'), 'Processando...');
  $('upload-erro').textContent = '';

  const fd = new FormData();
  fd.append('pdf', arquivo);
  try {
    const resp = await fetch('/api/upload', { method: 'POST', body: fd });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.erro || 'Falha no processamento.');
    uploadId = json.uploadId;
    renderizarPreview(json);
  } catch (e) {
    $('upload-erro').textContent = e.message;
  } finally {
    $('btn-processar').disabled = false;
    setLabel($('btn-processar'), 'Processar PDF');
  }
}

// ---- Etapa 2: preview ----
function renderizarPreview(p) {
  $('r-medico').textContent = p.medico || '—';
  $('r-data').textContent = p.data || '—';
  $('r-validos').textContent = p.totalValidos;
  $('r-invalidos').textContent = p.totalInvalidos;

  const tbody = $('tbody');
  tbody.innerHTML = '';
  for (const i of p.itens) {
    tbody.appendChild(criarLinha(i));
  }

  $('etapa-upload').classList.add('hidden');
  $('etapa-preview').classList.remove('hidden');
  $('btn-enviar').disabled = p.totalValidos === 0;
  setLabel($('btn-enviar'), `Enviar ${p.totalValidos} lembrete(s)`);
}

function criarLinha(i) {
  const tr = document.createElement('tr');
  tr.id = `row-${i.id}`;
  tr.dataset.id = i.id;
  if (!i.valido) tr.classList.add('invalido');
  tr.innerHTML = `
    <td class="c-status">${pillStatus(i.valido)}</td>
    <td>${escapar(i.nomeCompleto)}</td>
    <td class="c-edit">
      <input class="tel-input" type="text" value="${escapar(i.telefoneOriginal || '')}"
             placeholder="(DDD) número" aria-label="Telefone de ${escapar(i.primeiroNome)}" />
    </td>
    <td class="c-e164">${i.e164 ? '+' + i.e164 : '—'}</td>
    <td>${escapar(i.hora)}</td>
    <td class="detalhe">${i.valido ? '' : escapar(i.motivo || '')}</td>
    <td class="c-acoes">
      <button class="btn-remover" type="button" title="Remover da lista" aria-label="Remover contato">${ICON.x}</button>
    </td>`;
  return tr;
}

function pillStatus(valido) {
  return valido
    ? '<span class="pill ok">Válido</span>'
    : '<span class="pill bad">Inválido</span>';
}

// Validacao automatica: ao terminar de editar (sai do campo) ou apos uma pausa
// na digitacao (debounce). Sem botao manual.
$('tbody').addEventListener('input', (e) => {
  if (!e.target.classList.contains('tel-input')) return;
  clearTimeout(e.target._timer);
  e.target._timer = setTimeout(() => validarLinha(e.target.closest('tr')), 600);
});
$('tbody').addEventListener('focusout', (e) => {
  if (!e.target.classList.contains('tel-input')) return;
  clearTimeout(e.target._timer);
  validarLinha(e.target.closest('tr'));
});
$('tbody').addEventListener('keydown', (e) => {
  if (e.target.classList.contains('tel-input') && e.key === 'Enter') {
    e.preventDefault();
    e.target.blur(); // dispara focusout -> valida
  }
});
$('tbody').addEventListener('click', (e) => {
  if (e.target.closest('.btn-remover')) removerLinha(e.target.closest('tr'));
});

async function validarLinha(tr) {
  if (!tr) return;
  const id = tr.dataset.id;
  const telefone = tr.querySelector('.tel-input').value;
  try {
    const resp = await fetch(`/api/preview/${uploadId}/itens/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefone }),
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.erro || 'Falha ao validar.');
    aplicarItem(tr, json.item);
    atualizarTotais(json.totalValidos, json.totalInvalidos);
  } catch (err) {
    tr.querySelector('.detalhe').textContent = err.message;
  }
}

async function removerLinha(tr) {
  if (!tr) return;
  const id = tr.dataset.id;
  try {
    const resp = await fetch(`/api/preview/${uploadId}/itens/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.erro || 'Falha ao remover.');
    tr.remove();
    atualizarTotais(json.totalValidos, json.totalInvalidos);
  } catch (err) {
    tr.querySelector('.detalhe').textContent = err.message;
  }
}

function aplicarItem(tr, item) {
  tr.classList.toggle('invalido', !item.valido);
  tr.querySelector('.c-status').innerHTML = pillStatus(item.valido);
  tr.querySelector('.c-e164').textContent = item.e164 ? '+' + item.e164 : '—';
  const det = tr.querySelector('.detalhe');
  det.classList.remove('ok', 'neutro');
  det.textContent = item.valido ? '' : (item.motivo || '');
}

function atualizarTotais(validos, invalidos) {
  $('r-validos').textContent = validos;
  $('r-invalidos').textContent = invalidos;
  $('btn-enviar').disabled = validos === 0;
  setLabel($('btn-enviar'), `Enviar ${validos} lembrete(s)`);
}

// ---- Adicionar contato ----
$('btn-adicionar').addEventListener('click', adicionarContato);

// Formata o horario em 24h (HH:MM) enquanto digita, so com os digitos informados.
$('add-hora').addEventListener('input', (e) => {
  const d = e.target.value.replace(/\D/g, '').slice(0, 4);
  e.target.value = d.length >= 3 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
});

async function adicionarContato() {
  const nome = $('add-nome').value.trim();
  const telefone = $('add-telefone').value.trim();
  const hora = $('add-hora').value.trim();
  $('add-erro').textContent = '';

  if (!nome) { $('add-erro').textContent = 'Informe o nome.'; return; }
  if (!hora) { $('add-erro').textContent = 'Informe o horário.'; return; }
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(hora)) {
    $('add-erro').textContent = 'Horário inválido. Use HH:MM (24h).';
    return;
  }

  const btn = $('btn-adicionar');
  btn.disabled = true;
  try {
    const resp = await fetch(`/api/preview/${uploadId}/itens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, telefone, hora }),
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.erro || 'Falha ao adicionar.');
    $('tbody').appendChild(criarLinha(json.item));
    atualizarTotais(json.totalValidos, json.totalInvalidos);
    $('add-nome').value = '';
    $('add-telefone').value = '';
    $('add-hora').value = '';
    $('add-nome').focus();
  } catch (err) {
    $('add-erro').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

$('btn-voltar').addEventListener('click', () => {
  $('etapa-preview').classList.add('hidden');
  $('etapa-upload').classList.remove('hidden');
});

// ---- Etapa 3: dispara o lote e vai para o acompanhamento ----
$('btn-enviar').addEventListener('click', enviar);

async function enviar() {
  $('btn-enviar').disabled = true;
  try {
    const resp = await fetch(`/api/enviar/${uploadId}`, { method: 'POST' });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.erro || 'Falha ao iniciar envio.');
    abrirLote(json.loteId);
  } catch (err) {
    alert(err.message);
    $('btn-enviar').disabled = false;
  }
}

// ================= Acompanhamento =================

const SECOES = ['etapa-upload', 'etapa-preview', 'etapa-lotes', 'etapa-lote'];
let pollLoteTimer = null;

function mostrarSecao(id) {
  clearTimeout(pollLoteTimer);
  for (const s of SECOES) $(s).classList.toggle('hidden', s !== id);
  // Destaca o item de navegação correspondente à seção atual.
  const ehAcompanhamento = id === 'etapa-lotes' || id === 'etapa-lote';
  $('nav-novo').classList.toggle('active', !ehAcompanhamento);
  $('nav-lotes').classList.toggle('active', ehAcompanhamento);
}

$('nav-novo').addEventListener('click', () => mostrarSecao('etapa-upload'));
$('nav-lotes').addEventListener('click', abrirLotes);
$('btn-recarregar-lotes').addEventListener('click', abrirLotes);
$('btn-voltar-lotes').addEventListener('click', abrirLotes);

async function abrirLotes() {
  mostrarSecao('etapa-lotes');
  try {
    const { lotes } = await (await fetch('/api/lotes')).json();
    const tbody = $('tbody-lotes');
    tbody.innerHTML = '';
    $('lotes-vazio').classList.toggle('hidden', lotes.length > 0);
    for (const l of lotes) {
      const tr = document.createElement('tr');
      tr.className = 'clicavel';
      tr.innerHTML = `
        <td>${fmtData(l.criadoEm)}</td>
        <td>${escapar(l.medico || '—')}</td>
        <td>${escapar(l.data || '—')}</td>
        <td>${l.total}</td>
        <td>${l.enviados}${l.falhas ? ` <span class="bad-text">(${l.falhas} falha)</span>` : ''}</td>
        <td>${l.lidos}</td>
        <td>${pillLote(l.status)}${l.dryRun ? ' <span class="tag-sim">sim</span>' : ''}</td>`;
      tr.addEventListener('click', () => abrirLote(l.id));
      tbody.appendChild(tr);
    }
  } catch (err) {
    alert('Falha ao listar lotes: ' + err.message);
  }
}

async function abrirLote(loteId) {
  loteIdAtual = loteId;
  mostrarSecao('etapa-lote');
  await carregarLote(loteId);
}

async function carregarLote(loteId) {
  let lote;
  try {
    const resp = await fetch(`/api/lotes/${loteId}`);
    lote = await resp.json();
    if (!resp.ok) throw new Error(lote.erro || 'Lote não encontrado.');
  } catch (err) {
    $('l-status-linha').textContent = err.message;
    return;
  }
  renderLote(lote);

  // Enquanto roda, atualiza sozinho (polling).
  if (lote.status === 'rodando') {
    pollLoteTimer = setTimeout(() => carregarLote(loteId), 1500);
  }
}

function renderLote(lote) {
  const enviados = lote.mensagens.filter((m) => m.statusEnvio === 'enviado').length;
  const falhas = lote.mensagens.filter((m) => m.statusEnvio === 'falha').length;
  const lidos = lote.mensagens.filter((m) => m.statusEntrega === 'lido').length;
  $('l-medico').textContent = lote.medico || '—';
  $('l-data').textContent = lote.data || '—';
  $('l-enviados').textContent = `${enviados}/${lote.total}`;
  $('l-lidos').textContent = lidos;

  const rodando = lote.status === 'rodando';
  $('l-status-linha').innerHTML = rodando
    ? `<span class="pill enviando">Enviando…</span> ${enviados}/${lote.total} processados${lote.dryRun ? ' · modo simulado' : ''}`
    : `<span class="pill enviado">Concluído</span> ${enviados} enviado(s), ${falhas} falha(s)${lote.dryRun ? ' · modo simulado' : ''}`;
  $('btn-atualizar-status').disabled = rodando;

  const tbody = $('tbody-lote');
  tbody.innerHTML = '';
  for (const m of lote.mensagens) {
    const tr = document.createElement('tr');
    if (m.statusEnvio === 'falha') tr.classList.add('invalido');
    tr.innerHTML = `
      <td>${escapar(m.paciente)}</td>
      <td>+${escapar(m.telefone)}</td>
      <td class="msg-cell">Dr(a). ${escapar(m.medico)} · ${escapar(m.data)} · ${escapar(m.hora)}</td>
      <td>${m.enviadoEm ? fmtData(m.enviadoEm) : '—'}</td>
      <td>${pillEnvio(m.statusEnvio, m.erro)}</td>
      <td>${pillEntrega(m.statusEntrega, m.erro)}</td>`;
    tbody.appendChild(tr);
  }
}

$('btn-atualizar-status').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const loteId = loteIdAtual;
  if (!loteId) return;
  btn.disabled = true;
  setLabel(btn, 'Atualizando…');
  try {
    const resp = await fetch(`/api/lotes/${loteId}/atualizar-status`, { method: 'POST' });
    const lote = await resp.json();
    if (!resp.ok) throw new Error(lote.erro || 'Falha ao atualizar.');
    renderLote(lote);
  } catch (err) {
    alert(err.message);
  } finally {
    setLabel(btn, 'Atualizar status');
    btn.disabled = false;
  }
});

function pillLote(status) {
  return status === 'rodando'
    ? '<span class="pill enviando">Rodando</span>'
    : '<span class="pill enviado">Concluído</span>';
}
function pillEnvio(s, erro) {
  if (s === 'enviado') return '<span class="pill enviado">Enviado</span>';
  if (s === 'falha') return pillFalha(erro);
  return '<span class="pill pendente">Pendente</span>';
}
function pillEntrega(s, erro) {
  if (s === 'falha') return pillFalha(erro);
  const map = {
    pendente: '<span class="pill pendente">Pendente</span>',
    enviado: '<span class="pill enviado-azul">Enviado</span>',
    entregue: '<span class="pill entregue">Entregue</span>',
    lido: '<span class="pill lido">Lido</span>',
  };
  return map[s] || map.pendente;
}

// Balão de "Falha". Quando há um motivo (ex.: ACK -1 "131049: ..."),
// exibe-o no tooltip ao passar o mouse e marca o balão como clicável/focável.
function pillFalha(erro) {
  const motivo = humanizarErro(erro);
  if (!motivo) return '<span class="pill erro">Falha</span>';
  return `<span class="pill erro com-motivo" tabindex="0" role="button" title="${escapar(motivo)}">Falha<span class="motivo-ic" aria-hidden="true">${ICON.info}</span></span>`;
}

// O motivo gravado pode ser o texto curto da entrega ("131049: ...") ou, no
// caso de falha de envio, o JSON cru da resposta. Tenta extrair algo legível.
function humanizarErro(erro) {
  if (!erro) return '';
  const txt = String(erro).trim();
  if (!txt || txt[0] !== '{') return txt;
  try {
    const o = JSON.parse(txt);
    const e = o.error?.error ?? o.error ?? o;
    const code = e.code ?? e.error?.code;
    const msg = e.message ?? e.error?.message ?? e.title ?? e.error_data?.details;
    const combinado = [code != null ? String(code) : null, msg].filter(Boolean).join(': ');
    return combinado || txt;
  } catch {
    return txt;
  }
}

function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escapar(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Deep-link simples: #lotes abre o acompanhamento; #lote=<id> abre o detalhe.
function rotaInicial() {
  const h = location.hash;
  if (h === '#lotes') abrirLotes();
  else if (h.startsWith('#lote=')) abrirLote(decodeURIComponent(h.slice(6)));
  else $('nav-novo').classList.add('active'); // tela inicial: upload
}
rotaInicial();
