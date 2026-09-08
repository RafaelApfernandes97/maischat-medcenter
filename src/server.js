// Servidor Express: upload do PDF, pre-visualizacao e envio com progresso (SSE).

import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from './config.js';
import { prepararPreview, revalidarItem, removerItem, adicionarItem } from './agenda.js';
import { initSchema } from './db.js';
import { iniciarLote, atualizarStatusLote } from './envioService.js';
import { listarLotes, obterLote } from './lotesRepo.js';
import { logInfo, logError, debugAtivo } from './log.js';
import {
  requireAdmin,
  appAutenticado,
  adminAutenticado,
  emitirSessaoApp,
  emitirSessaoAdmin,
  encerrarSessao,
} from './auth.js';
import { validarCredenciais, obterLogin, definirCredenciais, seedCredenciais } from './configRepo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = loadConfig();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Envie um arquivo PDF.'));
  },
});

// Guarda as previas em memoria por uploadId (o envio usa os dados validados no
// servidor, nao confia em dados vindos do cliente).
const previas = new Map();

const publicDir = join(__dirname, '..', 'public');

// Arquivos servidos sem login: telas de login/admin e recursos visuais.
const ASSETS_PUBLICOS =
  /^\/(login\.html|admin\.html|login\.js|admin\.js|style\.css|favicon\.(ico|svg)|favicon-96x96\.png|site\.webmanifest|web-app-manifest-[\w.-]+\.png|assets\/.*)$/;

app.use(express.json());

// --- Autenticacao do app (rotas publicas) ---
app.post('/api/auth/login', async (req, res) => {
  const { login, senha } = req.body || {};
  try {
    if (await validarCredenciais(login, senha)) {
      emitirSessaoApp(res);
      return res.json({ ok: true });
    }
    res.status(401).json({ erro: 'Login ou senha invalidos.' });
  } catch (e) {
    logError('Falha no login', e.stack || e.message);
    res.status(500).json({ erro: 'Erro interno ao validar o login.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  encerrarSessao(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ autenticado: appAutenticado(req), admin: adminAutenticado(req) });
});

// --- Painel admin ---
app.post('/api/admin/login', (req, res) => {
  const { senha } = req.body || {};
  const esperada = config.acesso.adminPassword;
  if (esperada && senha === esperada) {
    emitirSessaoAdmin(res);
    return res.json({ ok: true });
  }
  res.status(401).json({ erro: 'Senha de admin invalida.' });
});

app.get('/api/admin/credenciais', requireAdmin, async (req, res) => {
  try {
    res.json({ login: (await obterLogin()) || '' });
  } catch (e) {
    logError('Falha ao ler credenciais', e.stack || e.message);
    res.status(500).json({ erro: e.message });
  }
});

app.post('/api/admin/credenciais', requireAdmin, async (req, res) => {
  const { login, senha } = req.body || {};
  if (!login || !senha) return res.status(400).json({ erro: 'Informe login e senha.' });
  try {
    await definirCredenciais(login, senha);
    logInfo('Credenciais do app atualizadas pelo painel admin.', { login });
    res.json({ ok: true });
  } catch (e) {
    logError('Falha ao definir credenciais', e.stack || e.message);
    res.status(500).json({ erro: e.message });
  }
});

// Paginas publicas de login/admin.
app.get('/login', (req, res) => res.sendFile(join(publicDir, 'login.html')));
app.get('/admin', (req, res) => res.sendFile(join(publicDir, 'admin.html')));

// Gate: libera os assets publicos; o resto exige sessao de app valida.
app.use((req, res, next) => {
  if (req.method === 'GET' && ASSETS_PUBLICOS.test(req.path)) return next();
  if (appAutenticado(req)) return next();
  // APIs sempre recebem 401 (o cliente trata e redireciona); navegacao de
  // pagina e redirecionada direto para a tela de login.
  if (!req.path.startsWith('/api/') && req.method === 'GET') return res.redirect('/login');
  return res.status(401).json({ erro: 'Nao autenticado.' });
});

// Daqui em diante tudo exige login.
app.use(express.static(publicDir));

app.post('/api/upload', (req, res) => {
  upload.single('pdf')(req, res, async (err) => {
    if (err) return res.status(400).json({ erro: err.message });
    if (!req.file) return res.status(400).json({ erro: 'Nenhum PDF enviado.' });
    const medico = String((req.body && req.body.medico) || '').trim();
    if (!medico) return res.status(400).json({ erro: 'Informe o nome do médico.' });
    try {
      const preview = await prepararPreview(req.file.buffer, medico);
      const uploadId = randomUUID();
      previas.set(uploadId, preview);
      logInfo('Upload processado', { arquivo: req.file.originalname, medico, validos: preview.totalValidos, invalidos: preview.totalInvalidos });
      res.json({ uploadId, ...preview });
    } catch (e) {
      logError('Falha ao ler o PDF', e.stack || e.message);
      res.status(422).json({ erro: `Falha ao ler o PDF: ${e.message}` });
    }
  });
});

app.patch('/api/preview/:uploadId/itens/:itemId', (req, res) => {
  const preview = previas.get(req.params.uploadId);
  if (!preview) return res.status(404).json({ erro: 'Upload nao encontrado ou expirado.' });

  const telefone = (req.body && req.body.telefone) || '';
  const r = revalidarItem(preview, req.params.itemId, telefone);
  if (!r) return res.status(404).json({ erro: 'Item nao encontrado.' });

  res.json({
    item: r.item,
    totalValidos: r.totalValidos,
    totalInvalidos: r.totalInvalidos,
  });
});

app.delete('/api/preview/:uploadId/itens/:itemId', (req, res) => {
  const preview = previas.get(req.params.uploadId);
  if (!preview) return res.status(404).json({ erro: 'Upload nao encontrado ou expirado.' });

  const r = removerItem(preview, req.params.itemId);
  if (!r) return res.status(404).json({ erro: 'Item nao encontrado.' });

  res.json({ totalValidos: r.totalValidos, totalInvalidos: r.totalInvalidos });
});

app.post('/api/preview/:uploadId/itens', (req, res) => {
  const preview = previas.get(req.params.uploadId);
  if (!preview) return res.status(404).json({ erro: 'Upload nao encontrado ou expirado.' });

  const { nome, telefone, hora } = req.body || {};
  try {
    const r = adicionarItem(preview, { nome, telefone, hora });
    res.status(201).json({
      item: r.item,
      totalValidos: r.totalValidos,
      totalInvalidos: r.totalInvalidos,
    });
  } catch (e) {
    res.status(400).json({ erro: e.message });
  }
});

// Cria um lote e inicia o envio em background; responde com o id do lote.
app.post('/api/enviar/:uploadId', async (req, res) => {
  const preview = previas.get(req.params.uploadId);
  if (!preview) return res.status(404).json({ erro: 'Upload nao encontrado ou expirado.' });

  const validos = preview.itens.filter((i) => i.valido);
  if (validos.length === 0) return res.status(400).json({ erro: 'Nenhum contato valido para enviar.' });

  try {
    const loteId = await iniciarLote({ preview, config });
    res.status(202).json({ loteId, total: validos.length, dryRun: config.dryRun });
  } catch (e) {
    logError('Falha ao criar lote', e.stack || e.message);
    res.status(500).json({ erro: `Falha ao criar lote: ${e.message}` });
  }
});

// Acompanhamento: lista de lotes.
app.get('/api/lotes', async (req, res) => {
  try {
    res.json({ lotes: await listarLotes() });
  } catch (e) {
    logError('Falha ao listar lotes', e.stack || e.message);
    res.status(500).json({ erro: e.message });
  }
});

// Detalhe de um lote.
app.get('/api/lotes/:id', async (req, res) => {
  try {
    const lote = await obterLote(req.params.id);
    if (!lote) return res.status(404).json({ erro: 'Lote nao encontrado.' });
    res.json(lote);
  } catch (e) {
    logError(`Falha ao obter lote ${req.params.id}`, e.stack || e.message);
    res.status(500).json({ erro: e.message });
  }
});

// Atualiza o status de entrega/leitura das mensagens do lote.
app.post('/api/lotes/:id/atualizar-status', async (req, res) => {
  try {
    const lote = await atualizarStatusLote(req.params.id, config);
    if (!lote) return res.status(404).json({ erro: 'Lote nao encontrado.' });
    res.json(lote);
  } catch (e) {
    logError(`Falha ao atualizar status do lote ${req.params.id}`, e.stack || e.message);
    res.status(500).json({ erro: e.message });
  }
});

async function start() {
  try {
    await initSchema();
    await seedCredenciais();
    logInfo('Banco conectado e schema pronto.');
  } catch (e) {
    logError('Falha ao inicializar o banco', e.stack || e.message);
  }
  app.listen(config.port, () => {
    logInfo(`Servidor em http://localhost:${config.port}`, { debug: debugAtivo });
    if (config.dryRun) logInfo('MODO SIMULADO (DRY_RUN) — nenhuma mensagem real sera enviada.');
    if (!config.auth && !config.dryRun) {
      logError('MAISCHAT_AUTH vazio — configure o .env antes de enviar de verdade.');
    }
  });
}

start();
