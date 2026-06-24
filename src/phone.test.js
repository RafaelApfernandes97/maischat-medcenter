import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './phone.js';

test('celular com DDD, espaco e hifen -> E.164', () => {
  const r = normalizePhone('19 97148-6054');
  assert.equal(r.valido, true);
  assert.equal(r.e164, '5519971486054');
});

test('celular com DDD colado -> E.164', () => {
  const r = normalizePhone('11988375857');
  assert.equal(r.valido, true);
  assert.equal(r.e164, '5511988375857');
});

test('celular com DDD 77 e espaco -> E.164', () => {
  const r = normalizePhone('77 981244318');
  assert.equal(r.valido, true);
  assert.equal(r.e164, '5577981244318');
});

test('numero ja em E.164 (com 55) permanece valido', () => {
  const r = normalizePhone('5519981253365');
  assert.equal(r.valido, true);
  assert.equal(r.e164, '5519981253365');
});

test('10 digitos (DDD + 8, sem 9o digito) -> invalido', () => {
  const r = normalizePhone('1999869698');
  assert.equal(r.valido, false);
});

test('numero sem DDD com 9 digitos -> invalido', () => {
  const r = normalizePhone('98239-2147');
  assert.equal(r.valido, false);
});

test('fixo antigo 8 digitos sem DDD -> invalido', () => {
  const r = normalizePhone('8835.6285');
  assert.equal(r.valido, false);
});

test('8 digitos com hifen sem DDD -> invalido', () => {
  const r = normalizePhone('3877-4718');
  assert.equal(r.valido, false);
});

test('10 digitos DDD+8 sem 9o digito -> invalido', () => {
  const r = normalizePhone('7188413520');
  assert.equal(r.valido, false);
});

test('12 digitos (excesso) -> invalido', () => {
  const r = normalizePhone('199971616144');
  assert.equal(r.valido, false);
});

test('string vazia -> invalido', () => {
  const r = normalizePhone('');
  assert.equal(r.valido, false);
});

test('celular sem 9o digito na 3a posicao -> invalido', () => {
  // 11 digitos mas 3o digito nao e 9 (DDD 19 + 8 1253365 -> formato invalido)
  const r = normalizePhone('19 8125-3365');
  assert.equal(r.valido, false);
});

test('preserva o valor original informado', () => {
  const r = normalizePhone('19 97148-6054');
  assert.equal(r.original, '19 97148-6054');
});

// --- Classificacao do motivo ---

test('celular sem DDD (9 digitos comecando com 9) -> tipo sem_ddd', () => {
  const r = normalizePhone('98239-2147');
  assert.equal(r.valido, false);
  assert.equal(r.tipo, 'sem_ddd');
  assert.match(r.motivo, /DDD/i);
});

test('outro celular sem DDD -> tipo sem_ddd', () => {
  const r = normalizePhone('996060809');
  assert.equal(r.tipo, 'sem_ddd');
});

test('8 digitos (fixo, nao e celular) -> tipo incorreto', () => {
  const r = normalizePhone('8835.6285');
  assert.equal(r.tipo, 'incorreto');
  assert.match(r.motivo, /incorreto/i);
});

test('10 digitos faltando um digito -> tipo incorreto', () => {
  const r = normalizePhone('1999869698');
  assert.equal(r.tipo, 'incorreto');
});

test('12 digitos em excesso -> tipo incorreto', () => {
  const r = normalizePhone('199971616144');
  assert.equal(r.tipo, 'incorreto');
});

test('vazio -> tipo vazio', () => {
  const r = normalizePhone('');
  assert.equal(r.tipo, 'vazio');
});

test('valido -> tipo valido e motivo nulo', () => {
  const r = normalizePhone('19 97148-6054');
  assert.equal(r.tipo, 'valido');
  assert.equal(r.motivo, null);
});

// --- Higienizacao de caracteres especiais ---

test('higieniza parenteses, barra e espacos', () => {
  const r = normalizePhone('(19) 99898-0291');
  assert.equal(r.valido, true);
  assert.equal(r.e164, '5519998980291');
});

test('higieniza pontos e caracteres diversos', () => {
  const r = normalizePhone('19.99898/0291');
  assert.equal(r.valido, true);
  assert.equal(r.e164, '5519998980291');
});

test('remove zero de tronco a esquerda', () => {
  const r = normalizePhone('019 99898-0291');
  assert.equal(r.valido, true);
  assert.equal(r.e164, '5519998980291');
});

test('expoe a versao higienizada (somente digitos)', () => {
  const r = normalizePhone('(19) 99898-0291');
  assert.equal(r.digits, '19998980291');
});

test('corrigir adicionando DDD torna valido (fluxo de edicao)', () => {
  const r = normalizePhone('19 98239-2147');
  assert.equal(r.valido, true);
  assert.equal(r.e164, '5519982392147');
});
