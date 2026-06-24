// Repositorio das credenciais de acesso ao app (tabela medcenter_config).
// Guarda o login do app e o hash/salt da senha. A senha nunca e exposta.

import { getPool } from './db.js';
import { hashSenha, verificarSenha } from './auth.js';
import { loadConfig } from './config.js';
import { logInfo } from './log.js';

async function getValor(chave) {
  const { rows } = await getPool().query(
    'SELECT valor FROM medcenter_config WHERE chave = $1',
    [chave],
  );
  return rows[0]?.valor ?? null;
}

async function setValor(chave, valor) {
  await getPool().query(
    `INSERT INTO medcenter_config (chave, valor, atualizado_em)
     VALUES ($1, $2, now())
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
    [chave, valor],
  );
}

// Retorna o login atual do app (ou null se ainda nao definido).
export async function obterLogin() {
  return getValor('app_login');
}

// Grava novo login e senha do app (a senha vira hash + salt).
export async function definirCredenciais(login, senha) {
  const { hash, salt } = hashSenha(senha);
  await setValor('app_login', String(login));
  await setValor('app_senha_hash', hash);
  await setValor('app_senha_salt', salt);
}

// Valida login + senha contra o que esta armazenado.
export async function validarCredenciais(login, senha) {
  const loginGuardado = await getValor('app_login');
  if (!loginGuardado || loginGuardado !== String(login)) return false;
  const hash = await getValor('app_senha_hash');
  const salt = await getValor('app_senha_salt');
  return verificarSenha(senha, hash, salt);
}

// Na primeira subida, se ainda nao ha credenciais, faz o seed a partir das envs
// APP_LOGIN/APP_PASSWORD. Sem APP_PASSWORD nao cria nada (admin define depois).
export async function seedCredenciais() {
  const jaExiste = await getValor('app_senha_hash');
  if (jaExiste) return;
  const { seedLogin, seedPassword } = loadConfig().acesso;
  if (!seedPassword) {
    logInfo('Sem APP_PASSWORD: defina o login/senha pelo painel admin (/admin).');
    return;
  }
  await definirCredenciais(seedLogin, seedPassword);
  logInfo(`Credenciais iniciais do app criadas (login: ${seedLogin}).`);
}
