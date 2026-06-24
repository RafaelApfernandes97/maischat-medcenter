import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTemplatePayload, sendTemplate, extrairWamid, buscarStatusPorDestino, ackDaMensagem, casarPorTempo, extrairErroEntrega } from './maischat.js';

const config = {
  apiBase: 'https://api.maischat.io/v3',
  auth: 'Bearer XYZ',
  template: { name: 'confirmacao_consulta', language: 'pt_BR' },
  broker: { appId: '238057352730277', source: '558000708000', token: 'TOKEN123' },
};

test('monta o payload no formato da Meta com os 3 parametros do template', () => {
  const payload = buildTemplatePayload({
    destination: '5519971486054',
    medico: 'Adney',
    data: '22/05',
    hora: '08h00',
    config,
  });

  assert.equal(payload.type, 'apiTemplate');
  assert.equal(payload.broker, 'wppCloudAPI');
  assert.equal(payload.appId, '238057352730277');
  assert.equal(payload.source, '558000708000');
  assert.equal(payload.destination, '5519971486054');
  assert.equal(payload.token, 'TOKEN123');
  assert.equal(payload.template.name, 'confirmacao_consulta');
  assert.equal(payload.template.language, 'pt_BR');

  const body = payload.template.components.find((c) => c.type === 'body');
  assert.deepEqual(body.parameters.map((p) => p.text), ['Adney', '22/05', '08h00']);
});

test('buildTemplatePayload recusa parametro vazio (evita 131008 da Meta)', () => {
  assert.throws(
    () => buildTemplatePayload({ destination: '5519971486054', medico: 'Adney', data: '22/05', hora: '', config }),
    /hora/,
  );
  assert.throws(
    () => buildTemplatePayload({ destination: '5519971486054', medico: '', data: '22/05', hora: '08h00', config }),
    /medico/,
  );
});

test('sendTemplate faz POST no endpoint correto com Authorization', async () => {
  let captured;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200, json: async () => ({ status: true }) };
  };

  const payload = buildTemplatePayload({
    destination: '5519971486054', medico: 'Adney', data: '22/05', hora: '08h00', config,
  });
  const res = await sendTemplate({ payload, config, fetchImpl: fakeFetch });

  assert.equal(captured.url, 'https://api.maischat.io/v3/template/send/wppCloudAPI');
  assert.equal(captured.opts.method, 'POST');
  assert.equal(captured.opts.headers['Authorization'], 'Bearer XYZ');
  assert.equal(captured.opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(captured.opts.body), payload);
  assert.equal(res.ok, true);
  assert.equal(res.status, 200);
});

test('sendTemplate reporta erro da API sem lancar excecao', async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: 'numero invalido' }),
  });
  const payload = buildTemplatePayload({
    destination: '5519971486054', medico: 'Adney', data: '22/05', hora: '08h00', config,
  });
  const res = await sendTemplate({ payload, config, fetchImpl: fakeFetch });

  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
  assert.deepEqual(res.data, { error: 'numero invalido' });
});

// --- wamid e status ---

test('extrairWamid pega o id da resposta de envio', () => {
  const data = { messaging_product: 'whatsapp', messages: [{ id: 'wamid.ABC', message_status: 'accepted' }] };
  assert.equal(extrairWamid(data), 'wamid.ABC');
});

test('extrairWamid pega o id quando a resposta vem embrulhada em data', () => {
  // Formato real do endpoint /template/send/wppCloudAPI do Mais Chat.
  const data = { status: true, data: { messaging_product: 'whatsapp', messages: [{ id: 'wamid.XYZ' }], msgId: 'abc' } };
  assert.equal(extrairWamid(data), 'wamid.XYZ');
});

test('extrairWamid retorna null quando nao ha id', () => {
  assert.equal(extrairWamid({ status: false }), null);
  assert.equal(extrairWamid({ status: true, data: {} }), null);
  assert.equal(extrairWamid(null), null);
});

test('buscarStatusPorDestino faz GET no endpoint de mensagens com Authorization', () => {
  let captured;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, status: 200, json: async () => ({ status: true, data: [] }) };
  };
  return buscarStatusPorDestino({ destination: '5519971486054', config, fetchImpl: fakeFetch }).then((registros) => {
    assert.equal(captured.url, 'https://api.maischat.io/v3/messages/destination/5519971486054?limit=50');
    assert.equal(captured.opts.headers['Authorization'], 'Bearer XYZ');
    assert.deepEqual(registros, []);
  });
});

test('ackDaMensagem encontra o registro pelo wamid e devolve o ack', () => {
  const registros = [
    { wppMsgId: 'wamid.OUTRO', ack: '1' },
    { wppMsgId: 'wamid.ABC', ack: '3' },
  ];
  assert.equal(ackDaMensagem(registros, 'wamid.ABC'), '3');
});

test('ackDaMensagem retorna null quando nao encontra', () => {
  assert.equal(ackDaMensagem([{ wppMsgId: 'x', ack: '2' }], 'wamid.ABC'), null);
});

test('casarPorTempo escolhe o registro mais proximo do envio', () => {
  const registros = [
    { wppMsgId: 'A', createdAt: '2026-06-22T23:29:58.412Z' },
    { wppMsgId: 'B', createdAt: '2026-06-22T15:34:06.205Z' },
  ];
  const reg = casarPorTempo(registros, '2026-06-22T23:29:56.364Z');
  assert.equal(reg.wppMsgId, 'A');
});

test('casarPorTempo retorna null sem registros ou sem horario', () => {
  assert.equal(casarPorTempo([], '2026-06-22T23:29:56.364Z'), null);
  assert.equal(casarPorTempo([{ wppMsgId: 'A', createdAt: '2026-06-22T23:29:58Z' }], null), null);
});

test('extrairErroEntrega le o erro da Meta no payload.error', () => {
  const registro = {
    payload: {
      error: [{ code: 131049, message: 'This message was not delivered...', error_data: { details: 'healthy ecosystem' } }],
    },
  };
  assert.equal(extrairErroEntrega(registro), '131049: This message was not delivered...');
});

test('extrairErroEntrega retorna null quando nao ha erro', () => {
  assert.equal(extrairErroEntrega({ payload: {} }), null);
  assert.equal(extrairErroEntrega(null), null);
});
