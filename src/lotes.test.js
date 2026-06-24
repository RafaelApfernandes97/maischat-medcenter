import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapearAck, montarMensagensIniciais, resumoLote } from './lotes.js';

test('mapeia ack do WhatsApp para status de entrega', () => {
  assert.equal(mapearAck('-1'), 'falha');
  assert.equal(mapearAck('0'), 'pendente');
  assert.equal(mapearAck('1'), 'enviado');
  assert.equal(mapearAck('2'), 'entregue');
  assert.equal(mapearAck('3'), 'lido');
});

test('mapeia ack numerico tambem', () => {
  assert.equal(mapearAck(3), 'lido');
  assert.equal(mapearAck(2), 'entregue');
});

test('ack desconhecido ou nulo vira pendente', () => {
  assert.equal(mapearAck(null), 'pendente');
  assert.equal(mapearAck(undefined), 'pendente');
  assert.equal(mapearAck('9'), 'pendente');
});

test('montarMensagensIniciais usa apenas itens validos', () => {
  const preview = {
    medico: 'Adney',
    data: '22/05',
    itens: [
      { id: 'a', valido: true, primeiroNome: 'Clayton', nomeCompleto: 'CLAYTON', e164: '5519971486054', hora: '08h00', medico: 'Adney', data: '22/05' },
      { id: 'b', valido: false, primeiroNome: 'Nelvin', nomeCompleto: 'NELVIN', e164: null, hora: '10h00', medico: 'Adney', data: '22/05' },
    ],
  };
  const msgs = montarMensagensIniciais(preview);
  assert.equal(msgs.length, 1);
  const m = msgs[0];
  assert.equal(m.itemId, 'a');
  assert.equal(m.paciente, 'CLAYTON');
  assert.equal(m.primeiroNome, 'Clayton');
  assert.equal(m.telefone, '5519971486054');
  assert.equal(m.medico, 'Adney');
  assert.equal(m.data, '22/05');
  assert.equal(m.hora, '08h00');
  assert.equal(m.statusEnvio, 'pendente');
  assert.equal(m.statusEntrega, 'pendente');
  assert.equal(m.wamid, null);
});

test('resumoLote conta enviados, falhas e pendentes', () => {
  const msgs = [
    { statusEnvio: 'enviado' },
    { statusEnvio: 'enviado' },
    { statusEnvio: 'falha' },
    { statusEnvio: 'pendente' },
  ];
  assert.deepEqual(resumoLote(msgs), { total: 4, enviados: 2, falhas: 1, pendentes: 1 });
});
