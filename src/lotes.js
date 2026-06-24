// Logica pura dos lotes de envio (sem banco e sem rede).

const ACK_STATUS = {
  '-1': 'falha',
  '0': 'pendente',
  '1': 'enviado',
  '2': 'entregue',
  '3': 'lido',
};

/**
 * Converte o `ack` do WhatsApp (string ou numero) em status de entrega legivel.
 * @param {string|number|null|undefined} ack
 * @returns {'falha'|'pendente'|'enviado'|'entregue'|'lido'}
 */
export function mapearAck(ack) {
  if (ack == null) return 'pendente';
  return ACK_STATUS[String(ack)] || 'pendente';
}

/**
 * Monta as mensagens iniciais de um lote a partir do preview, usando apenas os
 * itens validos (que serao efetivamente enviados).
 * @param {{ itens: Array }} preview
 */
export function montarMensagensIniciais(preview) {
  return preview.itens
    .filter((i) => i.valido)
    .map((i) => ({
      itemId: i.id,
      paciente: i.nomeCompleto,
      primeiroNome: i.primeiroNome,
      telefone: i.e164,
      medico: i.medico,
      data: i.data,
      hora: i.hora,
      statusEnvio: 'pendente', // pendente | enviado | falha
      enviadoEm: null,
      wamid: null,
      erro: null,
      statusEntrega: 'pendente', // pendente | enviado | entregue | lido | falha
      statusAtualizadoEm: null,
    }));
}

/**
 * Resumo de um conjunto de mensagens.
 */
export function resumoLote(mensagens) {
  return {
    total: mensagens.length,
    enviados: mensagens.filter((m) => m.statusEnvio === 'enviado').length,
    falhas: mensagens.filter((m) => m.statusEnvio === 'falha').length,
    pendentes: mensagens.filter((m) => m.statusEnvio === 'pendente').length,
  };
}
