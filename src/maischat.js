// Cliente de envio de template do WhatsApp pela API do Mais Chat
// (broker Meta Cloud API / canal 0800). O nome do template vem do config (.env).

import { logDebug, logError } from './log.js';

const BROKER = 'wppCloudAPI';

/**
 * Monta o corpo da requisicao no formato exigido pela Meta Cloud API.
 * O template aprovado `confirmacao_consulta` tem 3 parametros posicionais:
 * {{1}} medico, {{2}} data, {{3}} hora. (Nao ha placeholder para o nome do paciente.)
 *
 * @param {{ destination: string, medico: string, data: string,
 *           hora: string, config: { broker: { appId: string, source: string, token: string } } }} args
 */
export function buildTemplatePayload({ destination, medico, data, hora, config }) {
  const { appId, source, token } = config.broker;
  // A Meta rejeita parametro com texto vazio com 131008 ("Required parameter is
  // missing"). Falhamos cedo com um motivo claro em vez de enviar algo invalido.
  const faltando = Object.entries({ medico, data, hora })
    .filter(([, v]) => !String(v ?? '').trim())
    .map(([k]) => k);
  if (faltando.length) {
    throw new Error(`Parametro(s) obrigatorio(s) do template vazio(s): ${faltando.join(', ')}`);
  }
  return {
    type: 'apiTemplate',
    broker: BROKER,
    appId,
    source,
    destination,
    token,
    template: {
      name: config.template.name,
      language: config.template.language,
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: medico },
            { type: 'text', text: data },
            { type: 'text', text: hora },
          ],
        },
      ],
    },
  };
}

/**
 * Extrai o wamid (id da mensagem no WhatsApp) da resposta de envio.
 * O endpoint do Mais Chat embrulha a resposta da Meta em `{ status, data }`,
 * entao aceitamos tanto o formato cru (`messages[0].id`) quanto o embrulhado
 * (`data.messages[0].id`).
 * @param {object|null} data  Corpo da resposta da API.
 * @returns {string|null}
 */
export function extrairWamid(data) {
  const meta = data?.data ?? data;
  return meta?.messages?.[0]?.id || null;
}

/**
 * Consulta as mensagens enviadas para um destino, retornando os registros
 * (cada um com `wppMsgId`, `ack`, `ackLog`, etc.).
 *
 * @param {{ destination: string, config: { apiBase: string, auth: string }, fetchImpl?: Function }} args
 * @returns {Promise<Array<object>>}
 */
export async function buscarStatusPorDestino({ destination, config, fetchImpl = fetch }) {
  const base = config.apiBase.replace(/\/$/, '');
  const url = `${base}/messages/destination/${encodeURIComponent(destination)}?limit=50`;
  const headers = {};
  if (config.auth) headers['Authorization'] = config.auth;

  const resp = await fetchImpl(url, { method: 'GET', headers });
  let data = null;
  try {
    data = await resp.json();
  } catch {
    data = null;
  }
  const registros = Array.isArray(data?.data) ? data.data : [];
  logDebug(`buscarStatusPorDestino ${destination}`, { httpStatus: resp.status, registros: registros.length });
  return registros;
}

/**
 * Extrai um motivo legivel da falha de entrega de um registro da API (ack -1).
 * O Mais Chat guarda o erro da Meta em `payload.error` (array) ou
 * `payload.response.error`. Retorna string curta tipo "131049: <mensagem>".
 * @returns {string|null}
 */
export function extrairErroEntrega(registro) {
  const err = registro?.payload?.error ?? registro?.payload?.response?.error;
  if (!err) return null;
  const item = Array.isArray(err) ? err[0] : (err.error ?? err);
  if (!item) return null;
  const code = item.code ?? item.error?.code;
  const message = item.message ?? item.error?.message ?? item.title;
  const detalhe = item.error_data?.details ?? item.error?.error_data?.details;
  return [code != null ? `${code}` : null, message || detalhe || JSON.stringify(item)]
    .filter(Boolean)
    .join(': ');
}

/**
 * Encontra, entre os registros, a mensagem com o wamid informado e devolve seu `ack`.
 * @returns {string|null}
 */
export function ackDaMensagem(registros, wamid) {
  const reg = registros.find((r) => r.wppMsgId === wamid);
  return reg ? String(reg.ack) : null;
}

/**
 * Casa uma mensagem do banco com o registro da API pelo horario de envio, quando
 * nao temos o wamid (ex.: enviada por uma versao antiga que nao capturava o id).
 * Escolhe o registro com `createdAt` mais proximo de `enviadoEm`.
 * @param {Array<{createdAt: string, wppMsgId: string}>} registros
 * @param {string} enviadoEm  ISO de quando o app registrou o envio.
 * @returns {object|null}
 */
export function casarPorTempo(registros, enviadoEm) {
  if (!enviadoEm || !Array.isArray(registros) || registros.length === 0) return null;
  const alvo = new Date(enviadoEm).getTime();
  if (Number.isNaN(alvo)) return null;
  let melhor = null;
  let melhorDiff = Infinity;
  for (const r of registros) {
    const t = new Date(r.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    const diff = Math.abs(t - alvo);
    if (diff < melhorDiff) {
      melhorDiff = diff;
      melhor = r;
    }
  }
  return melhor;
}

/**
 * Envia o template. Nao lanca excecao em erro HTTP: retorna { ok, status, data }.
 *
 * @param {{ payload: object, config: { apiBase: string, auth: string }, fetchImpl?: Function }} args
 */
export async function sendTemplate({ payload, config, fetchImpl = fetch }) {
  const url = `${config.apiBase.replace(/\/$/, '')}/template/send/${BROKER}`;
  const headers = { 'Content-Type': 'application/json' };
  if (config.auth) headers['Authorization'] = config.auth;

  logDebug(`sendTemplate -> ${url}`, { destination: payload.destination, template: payload.template?.name });
  try {
    const resp = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    let data = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }
    if (!resp.ok) {
      logError(`sendTemplate falhou (HTTP ${resp.status}) destino ${payload.destination}`, data);
    } else {
      logDebug(`sendTemplate ok destino ${payload.destination}`, { httpStatus: resp.status, wamid: extrairWamid(data) });
    }
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    logError(`sendTemplate erro de rede destino ${payload.destination}`, err.message);
    return { ok: false, status: 0, data: { error: err.message } };
  }
}
