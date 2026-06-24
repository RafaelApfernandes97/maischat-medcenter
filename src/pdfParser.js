// Parser do PDF "Modulo de Agenda Medica".
//
// Usa extracao posicional (coordenadas X/Y de cada texto via pdfjs-dist) para
// reconstruir a tabela de forma confiavel: agrupa itens por linha (Y), inicia um
// registro quando ha uma hora na coluna Hora, e atribui cada texto a uma coluna
// pela faixa de X derivada do cabecalho.

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const MESES = {
  janeiro: '01', fevereiro: '02', marco: '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08',
  setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
};

/**
 * Extrai os itens de texto com posicao de todas as paginas do PDF.
 * @param {Buffer|Uint8Array} buffer
 * @returns {Promise<Array<{ str: string, x: number, y: number, page: number }>>}
 */
export async function extractItems(buffer) {
  // pdfjs exige Uint8Array "puro" (Buffer do Node e rejeitado).
  const data = new Uint8Array(buffer.buffer ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer);
  const doc = await getDocument({ data }).promise;
  const items = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items) {
      const str = (it.str || '').trim();
      if (!str) continue;
      items.push({ str, x: it.transform[4], y: it.transform[5], page: p });
    }
  }
  return items;
}

/**
 * Monta a agenda estruturada a partir dos itens posicionais.
 * @param {Array<{ str: string, x: number, y: number, page: number }>} items
 */
export function buildAgenda(items) {
  const medico = extractMedico(items);
  const { data, dataISO } = extractData(items);
  const cols = detectColumns(items);
  const linhas = extractLinhas(items, cols);
  return { medico, data, dataISO, linhas };
}

/**
 * @param {Buffer|Uint8Array} buffer
 */
export async function parseAgenda(buffer) {
  const items = await extractItems(buffer);
  return buildAgenda(items);
}

function extractMedico(items) {
  // "Agenda:" e o nome vem logo a direita (mesmo Y) ou no proximo item.
  const idx = items.findIndex((i) => i.str.replace(/\s+/g, '') === 'Agenda:');
  if (idx === -1) return '';
  const label = items[idx];
  const sameLine = items
    .filter((i) => i.page === label.page && Math.abs(i.y - label.y) < 3 && i.x > label.x)
    .sort((a, b) => a.x - b.x);
  return sameLine.length ? sameLine[0].str.trim() : '';
}

function extractData(items) {
  // Procura "DD de <mes> de AAAA" em qualquer item.
  const re = /(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i;
  for (const it of items) {
    const m = it.str.match(re);
    if (m) {
      const dia = m[1].padStart(2, '0');
      const mesNome = removerAcentos(m[2].toLowerCase());
      const mes = MESES[mesNome];
      const ano = m[3];
      if (mes) {
        return { data: `${dia}/${mes}`, dataISO: `${ano}-${mes}-${dia}` };
      }
    }
  }
  return { data: '', dataISO: '' };
}

function detectColumns(items) {
  // Localiza o X de cada cabecalho relevante e calcula os limites por ponto medio.
  const header = (label) => {
    const it = items.find((i) => i.str.trim() === label);
    return it ? it.x : null;
  };
  const hora = header('Hora');
  const paciente = header('Paciente');
  const telefone = header('Telefone');
  const categoria = header('Categoria');
  if (hora == null || paciente == null || telefone == null || categoria == null) {
    throw new Error('Cabecalho da tabela nao encontrado (Hora/Paciente/Telefone/Categoria)');
  }
  return {
    horaMax: (hora + paciente) / 2,
    pacienteMax: (paciente + telefone) / 2,
    telefoneMax: (telefone + categoria) / 2,
    headerY: items.find((i) => i.str.trim() === 'Hora').y,
    headerPage: items.find((i) => i.str.trim() === 'Hora').page,
  };
}

function extractLinhas(items, cols) {
  // Itens abaixo do cabecalho, ordenados em ordem de leitura.
  const corpo = items
    .filter((i) => i.page > cols.headerPage || (i.page === cols.headerPage && i.y < cols.headerY - 2))
    .sort((a, b) => (a.page - b.page) || (b.y - a.y) || (a.x - b.x));

  // Agrupa por linha visual (mesmo Y).
  const linhasVisuais = [];
  for (const it of corpo) {
    const ult = linhasVisuais[linhasVisuais.length - 1];
    if (ult && ult.page === it.page && Math.abs(ult.y - it.y) < 4) {
      ult.itens.push(it);
    } else {
      linhasVisuais.push({ page: it.page, y: it.y, itens: [it] });
    }
  }

  const reHora = /^\d{1,2}:\d{2}$/;
  const registros = [];
  for (const lv of linhasVisuais) {
    const horaItem = lv.itens.find((i) => i.x < cols.horaMax && reHora.test(i.str.trim()));
    if (horaItem) {
      registros.push({ hora: horaItem.str.trim(), itens: [...lv.itens] });
    } else if (registros.length) {
      // Continuacao do registro anterior (nome quebrado em mais linhas).
      registros[registros.length - 1].itens.push(...lv.itens);
    }
  }

  return registros.map((r) => montarLinha(r, cols));
}

function montarLinha(registro, cols) {
  const nomeItens = registro.itens
    .filter((i) => i.x >= cols.horaMax && i.x < cols.pacienteMax)
    .sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const telItens = registro.itens
    .filter((i) => i.x >= cols.pacienteMax && i.x < cols.telefoneMax)
    .sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const nomeCompleto = nomeItens.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim();
  const telefone = telItens.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim();

  return {
    hora: registro.hora,
    horaFmt: registro.hora.replace(':', 'h'),
    nomeCompleto,
    primeiroNome: primeiroNome(nomeCompleto),
    telefone,
  };
}

function primeiroNome(nome) {
  const token = nome.trim().split(/\s+/)[0] || '';
  if (!token) return '';
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function removerAcentos(s) {
  // ̀-ͯ = marcas diacriticas combinantes (acentos).
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
