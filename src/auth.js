// Autenticacao: hash de senha (scrypt) e tokens de sessao assinados (HMAC).
// Sem dependencias externas - usa apenas o modulo crypto nativo do Node.

import { scryptSync, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { loadConfig } from './config.js';

const SCRYPT_KEYLEN = 32;
const COOKIE_APP = 'mc_sessao';
const COOKIE_ADMIN = 'mc_admin';

// Gera { hash, salt } em hex para guardar no banco.
export function hashSenha(senha) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(senha), salt, SCRYPT_KEYLEN).toString('hex');
  return { hash, salt };
}

// Compara em tempo constante a senha informada com o hash/salt armazenados.
export function verificarSenha(senha, hash, salt) {
  if (!hash || !salt) return false;
  let esperado;
  try {
    esperado = Buffer.from(hash, 'hex');
  } catch {
    return false;
  }
  const calculado = scryptSync(String(senha), salt, SCRYPT_KEYLEN);
  if (esperado.length !== calculado.length) return false;
  return timingSafeEqual(esperado, calculado);
}

function hmac(dados, secret) {
  return createHmac('sha256', secret).update(dados).digest('base64url');
}

// Cria um token "<payloadBase64url>.<assinatura>" carregando os dados e o
// instante de emissao (emitidoEm em ms). Use lerToken para validar.
export function criarToken(dados, secret, emitidoEm) {
  const corpo = { ...dados, t: emitidoEm };
  const payload = Buffer.from(JSON.stringify(corpo)).toString('base64url');
  return `${payload}.${hmac(payload, secret)}`;
}

// Valida assinatura e (se maxIdadeMs informado) a expiracao. Devolve os dados
// originais ou null se invalido/adulterado/expirado.
export function lerToken(token, secret, maxIdadeMs) {
  if (typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [payload, assinatura] = partes;
  const esperada = hmac(payload, secret);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let corpo;
  try {
    corpo = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
  if (maxIdadeMs !== undefined && maxIdadeMs !== null) {
    if (typeof corpo.t !== 'number' || Date.now() - corpo.t > maxIdadeMs) return null;
  }
  const { t, ...dados } = corpo;
  return dados;
}

// --- Cookies e middlewares (Express) ---

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const parte of header.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    out[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, nome, valor, maxAgeMs) {
  const seguro = process.env.NODE_ENV === 'production';
  const attrs = [
    `${nome}=${encodeURIComponent(valor)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (seguro) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

function clearCookie(res, nome) {
  res.append('Set-Cookie', `${nome}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

// Emite o cookie de sessao do app apos login bem-sucedido.
export function emitirSessaoApp(res) {
  const { sessionSecret, maxAgeMs } = loadConfig().acesso;
  const token = criarToken({ tipo: 'app' }, sessionSecret, Date.now());
  setCookie(res, COOKIE_APP, token, maxAgeMs);
}

// Emite o cookie de sessao do admin apos senha de admin correta.
export function emitirSessaoAdmin(res) {
  const { sessionSecret, maxAgeMs } = loadConfig().acesso;
  const token = criarToken({ tipo: 'admin' }, sessionSecret, Date.now());
  setCookie(res, COOKIE_ADMIN, token, maxAgeMs);
}

export function encerrarSessao(res) {
  clearCookie(res, COOKIE_APP);
  clearCookie(res, COOKIE_ADMIN);
}

function sessaoValida(req, nomeCookie, tipoEsperado) {
  const { sessionSecret, maxAgeMs } = loadConfig().acesso;
  const cookies = parseCookies(req.headers.cookie);
  const dados = lerToken(cookies[nomeCookie], sessionSecret, maxAgeMs);
  return dados?.tipo === tipoEsperado;
}

export function appAutenticado(req) {
  return sessaoValida(req, COOKIE_APP, 'app');
}

export function adminAutenticado(req) {
  return sessaoValida(req, COOKIE_ADMIN, 'admin');
}

// Middleware: exige sessao de app valida. APIs recebem 401; o cliente decide
// redirecionar para /login.
export function requireUser(req, res, next) {
  if (appAutenticado(req)) return next();
  res.status(401).json({ erro: 'Nao autenticado.' });
}

// Middleware: exige sessao de admin valida.
export function requireAdmin(req, res, next) {
  if (adminAutenticado(req)) return next();
  res.status(401).json({ erro: 'Acesso admin negado.' });
}
