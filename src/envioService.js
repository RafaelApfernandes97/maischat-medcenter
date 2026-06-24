// Servico de envio em lote: cria o lote, envia em background e atualiza status.

import { randomUUID } from 'node:crypto';
import { montarMensagensIniciais, mapearAck } from './lotes.js';
import { buildTemplatePayload, sendTemplate, extrairWamid, buscarStatusPorDestino, ackDaMensagem, casarPorTempo, extrairErroEntrega } from './maischat.js';
import { criarLote, marcarEnvio, concluirLote, obterLote, mensagensComWamid, mensagensEnviadas, definirWamid, atualizarStatusEntrega } from './lotesRepo.js';
import { logInfo, logError, logDebug } from './log.js';

const ORDEM_ENTREGA = ['pendente', 'enviado', 'entregue', 'lido'];

/**
 * Cria o lote no banco e inicia o envio em background. Retorna o id do lote.
 * @param {{ preview: object, config: object }} args
 * @returns {Promise<string>}
 */
export async function iniciarLote({ preview, config }) {
  const id = randomUUID();
  const mensagens = montarMensagensIniciais(preview);
  await criarLote({ id, medico: preview.medico, data: preview.data, dryRun: config.dryRun, mensagens });
  logInfo(`Lote criado ${id}`, { medico: preview.medico, data: preview.data, total: mensagens.length, dryRun: config.dryRun });

  // Dispara em background (nao bloqueia a resposta da requisicao).
  executarLote(id, mensagens, config).catch((e) => {
    logError(`Falha geral no envio do lote ${id}`, e.message);
  });

  return id;
}

async function executarLote(loteId, mensagens, config) {
  logInfo(`Iniciando envio do lote ${loteId}`, { total: mensagens.length, dryRun: config.dryRun });
  let ok = 0;
  let falhas = 0;
  for (const m of mensagens) {
    const enviadoEm = new Date().toISOString();
    let resultado;
    if (config.dryRun) {
      resultado = { ok: true, wamid: `dry-${m.itemId}`, erro: null };
      await espera(120);
    } else {
      resultado = await enviarReal(m, config);
    }
    if (resultado.ok) {
      ok++;
      logDebug(`Enviado ${m.telefone} (lote ${loteId})`, { wamid: resultado.wamid });
    } else {
      falhas++;
      logError(`Falha ao enviar ${m.telefone} (lote ${loteId})`, resultado.erro);
    }
    await marcarEnvio(loteId, m.itemId, { ...resultado, enviadoEm });
  }
  await concluirLote(loteId);
  logInfo(`Lote ${loteId} concluido`, { enviados: ok, falhas });
}

async function enviarReal(mensagem, config) {
  let payload;
  try {
    payload = buildTemplatePayload({
      destination: mensagem.telefone,
      medico: mensagem.medico,
      data: mensagem.data,
      hora: mensagem.hora,
      config,
    });
  } catch (e) {
    return { ok: false, wamid: null, erro: e.message };
  }
  const res = await sendTemplate({ payload, config });
  if (res.ok) {
    return { ok: true, wamid: extrairWamid(res.data), erro: null };
  }
  return { ok: false, wamid: null, erro: typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data) };
}

/**
 * Atualiza o status de entrega/leitura das mensagens de um lote consultando a
 * API (ou simulando, em DRY_RUN). Retorna o lote atualizado.
 */
export async function atualizarStatusLote(loteId, config) {
  const agora = new Date().toISOString();

  if (config.dryRun) {
    for (const m of await mensagensComWamid(loteId)) {
      const novo = proximoStatusSimulado(m.statusEntrega);
      if (novo && novo !== m.statusEntrega) await atualizarStatusEntrega(m.id, novo, agora);
    }
    return obterLote(loteId);
  }

  // Modo real: consulta a API por destino (cacheando por telefone) e casa cada
  // mensagem pelo wamid; se faltar o wamid, casa pelo horario de envio e o grava.
  const mensagens = await mensagensEnviadas(loteId);
  const cachePorTelefone = new Map();

  for (const m of mensagens) {
    if (!cachePorTelefone.has(m.telefone)) {
      cachePorTelefone.set(m.telefone, await buscarStatusPorDestino({ destination: m.telefone, config }));
    }
    const registros = cachePorTelefone.get(m.telefone);

    let wamid = m.wamid;
    let registro = registros.find((r) => r.wppMsgId === wamid);
    if (!wamid) {
      registro = casarPorTempo(registros, m.enviadoEm);
      if (registro && registro.wppMsgId) {
        wamid = registro.wppMsgId;
        await definirWamid(m.id, wamid);
        logDebug(`wamid recuperado por tempo para ${m.telefone}`, { wamid });
      }
    }

    const ack = ackDaMensagem(registros, wamid);
    if (ack == null) {
      logDebug(`sem ack na API para ${m.telefone}`, { wamid });
      continue; // sem informacao na API: nao mexe no status atual.
    }
    const novo = mapearAck(ack);
    const motivo = novo === 'falha' ? extrairErroEntrega(registro) : null;
    if (novo === 'falha') {
      logError(`Entrega falhou para ${m.telefone} (lote ${loteId})`, { ack, motivo });
    } else {
      logDebug(`Status de ${m.telefone}: ${novo}`, { ack });
    }
    // Grava quando o status muda; tambem grava o motivo de uma falha ainda nao registrada.
    if (novo && (novo !== m.statusEntrega || motivo)) {
      await atualizarStatusEntrega(m.id, novo, agora, motivo);
    }
  }

  return obterLote(loteId);
}

function proximoStatusSimulado(atual) {
  const i = ORDEM_ENTREGA.indexOf(atual);
  return ORDEM_ENTREGA[Math.min(i + 1, ORDEM_ENTREGA.length - 1)];
}

function espera(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
