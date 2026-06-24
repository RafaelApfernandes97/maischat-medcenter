// Orquestracao: a partir do PDF, produz a lista de envios pronta para a tela de
// pre-visualizacao (parser + normalizacao de telefone).

import { parseAgenda } from './pdfParser.js';
import { normalizePhone } from './phone.js';

/**
 * @param {Buffer|Uint8Array} buffer  PDF da agenda.
 * @returns {Promise<{ medico, data, dataISO, itens: Array, totalValidos, totalInvalidos }>}
 */
export async function prepararPreview(buffer) {
  const agenda = await parseAgenda(buffer);

  const itens = agenda.linhas.map((linha, idx) => {
    const tel = normalizePhone(linha.telefone);
    return {
      id: `${idx}-${linha.hora}`,
      hora: linha.horaFmt,
      horaTabela: linha.hora,
      nomeCompleto: linha.nomeCompleto,
      primeiroNome: linha.primeiroNome,
      medico: agenda.medico,
      data: agenda.data,
      telefoneOriginal: linha.telefone,
      e164: tel.e164,
      valido: tel.valido,
      tipo: tel.tipo,
      motivo: tel.motivo,
    };
  });

  return {
    medico: agenda.medico,
    data: agenda.data,
    dataISO: agenda.dataISO,
    itens,
    totalValidos: itens.filter((i) => i.valido).length,
    totalInvalidos: itens.filter((i) => !i.valido).length,
  };
}

/**
 * Revalida o telefone de um item (apos edicao manual), atualiza o preview
 * in-place e devolve o item atualizado com os totais recalculados.
 *
 * @param {{ itens: Array, totalValidos?: number, totalInvalidos?: number }} preview
 * @param {string} itemId
 * @param {string} novoTelefone
 * @returns {{ item: object, totalValidos: number, totalInvalidos: number } | null}
 */
export function revalidarItem(preview, itemId, novoTelefone) {
  const item = preview.itens.find((i) => i.id === itemId);
  if (!item) return null;

  const tel = normalizePhone(novoTelefone);
  item.telefoneOriginal = novoTelefone;
  item.e164 = tel.e164;
  item.valido = tel.valido;
  item.tipo = tel.tipo;
  item.motivo = tel.motivo;

  return { item, ...recalcular(preview) };
}

/**
 * Remove um contato da lista de envio e recalcula os totais.
 * @returns {{ totalValidos: number, totalInvalidos: number } | null}
 */
export function removerItem(preview, itemId) {
  const idx = preview.itens.findIndex((i) => i.id === itemId);
  if (idx === -1) return null;
  preview.itens.splice(idx, 1);
  return recalcular(preview);
}

/**
 * Adiciona um contato manualmente. Herda medico/data da agenda; valida o
 * telefone informado (entra como invalido se nao passar).
 *
 * @param {object} preview
 * @param {{ nome: string, telefone: string, hora: string }} dados
 * @returns {{ item: object, totalValidos: number, totalInvalidos: number }}
 */
export function adicionarItem(preview, { nome, telefone, hora }) {
  const nomeLimpo = String(nome ?? '').trim();
  if (!nomeLimpo) throw new Error('Nome é obrigatório.');
  // Hora é parâmetro obrigatório do template ({{3}}); sem ela a Meta recusa o
  // envio com 131008. Exigimos aqui para não criar um contato que falha no envio.
  if (!String(hora ?? '').trim()) throw new Error('Horário é obrigatório.');

  preview.proximoId = (preview.proximoId || 0) + 1;
  const tel = normalizePhone(telefone || '');
  const horaFmt = formatarHora(hora);

  const item = {
    id: `novo-${preview.proximoId}`,
    hora: horaFmt,
    horaTabela: String(hora ?? '').trim(),
    nomeCompleto: nomeLimpo,
    primeiroNome: primeiroNome(nomeLimpo),
    medico: preview.medico,
    data: preview.data,
    telefoneOriginal: telefone || '',
    e164: tel.e164,
    valido: tel.valido,
    tipo: tel.tipo,
    motivo: tel.motivo,
    adicionado: true,
  };
  preview.itens.push(item);

  return { item, ...recalcular(preview) };
}

function recalcular(preview) {
  const totalValidos = preview.itens.filter((i) => i.valido).length;
  const totalInvalidos = preview.itens.filter((i) => !i.valido).length;
  preview.totalValidos = totalValidos;
  preview.totalInvalidos = totalInvalidos;
  return { totalValidos, totalInvalidos };
}

function formatarHora(hora) {
  const h = String(hora ?? '').trim();
  // "08:00" -> "08h00"; demais formatos mantidos.
  return /^\d{1,2}:\d{2}$/.test(h) ? h.replace(':', 'h') : h;
}

function primeiroNome(nome) {
  const token = nome.trim().split(/\s+/)[0] || '';
  if (!token) return '';
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}
