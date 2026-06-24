import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashSenha, verificarSenha, criarToken, lerToken } from './auth.js';

// --- Hash de senha (scrypt) ---

test('hashSenha gera hash e salt em hex distintos a cada chamada', () => {
  const a = hashSenha('minha-senha');
  const b = hashSenha('minha-senha');
  assert.match(a.hash, /^[0-9a-f]+$/);
  assert.match(a.salt, /^[0-9a-f]+$/);
  // salt aleatorio -> hashes diferentes para a mesma senha
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
});

test('verificarSenha aceita a senha correta', () => {
  const { hash, salt } = hashSenha('medcenter');
  assert.equal(verificarSenha('medcenter', hash, salt), true);
});

test('verificarSenha rejeita a senha errada', () => {
  const { hash, salt } = hashSenha('medcenter');
  assert.equal(verificarSenha('errada', hash, salt), false);
});

test('verificarSenha rejeita quando hash/salt ausentes', () => {
  assert.equal(verificarSenha('x', '', ''), false);
  assert.equal(verificarSenha('x', undefined, undefined), false);
});

// --- Token de sessao assinado (HMAC) ---

test('lerToken devolve os dados de um token valido', () => {
  const token = criarToken({ tipo: 'app' }, 'segredo', 0);
  const dados = lerToken(token, 'segredo');
  assert.equal(dados.tipo, 'app');
});

test('lerToken rejeita token assinado com outro segredo', () => {
  const token = criarToken({ tipo: 'app' }, 'segredo', 0);
  assert.equal(lerToken(token, 'outro-segredo'), null);
});

test('lerToken rejeita token adulterado', () => {
  const token = criarToken({ tipo: 'app' }, 'segredo', 0);
  const adulterado = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
  assert.equal(lerToken(adulterado, 'segredo'), null);
});

test('lerToken rejeita token expirado', () => {
  // emitido 100ms atras, validade de 1ms -> expirado
  const token = criarToken({ tipo: 'app' }, 'segredo', Date.now() - 100);
  assert.equal(lerToken(token, 'segredo', 1), null);
});

test('lerToken aceita token dentro da validade', () => {
  const token = criarToken({ tipo: 'app' }, 'segredo', Date.now());
  const dados = lerToken(token, 'segredo', 60_000);
  assert.equal(dados.tipo, 'app');
});

test('lerToken rejeita lixo', () => {
  assert.equal(lerToken('', 'segredo'), null);
  assert.equal(lerToken('abc', 'segredo'), null);
  assert.equal(lerToken('a.b.c.d', 'segredo'), null);
});
