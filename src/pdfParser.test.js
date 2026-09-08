import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseAgenda } from './pdfParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_PATH = join(__dirname, '..', 'pdfenvio.pdf');

async function parsed() {
  const buf = await readFile(PDF_PATH);
  return parseAgenda(buf);
}

test('extrai a data e formata DD/MM e ISO', async () => {
  const r = await parsed();
  assert.equal(r.data, '22/05');
  assert.equal(r.dataISO, '2026-05-22');
});

test('extrai todas as 48 linhas de agendamento (2 paginas)', async () => {
  const r = await parsed();
  assert.equal(r.linhas.length, 48);
});

test('primeira linha: hora, nome e telefone corretos', async () => {
  const r = await parsed();
  const l = r.linhas[0];
  assert.equal(l.hora, '08:00');
  assert.equal(l.horaFmt, '08h00');
  assert.equal(l.nomeCompleto, 'CLAYTON');
  assert.equal(l.primeiroNome, 'Clayton');
  assert.equal(l.telefone, '19 97148-6054');
});

test('nome que quebra em duas linhas e juntado', async () => {
  const r = await parsed();
  // 08:00 CLEONICE SOUZA DE / MELO  -> telefone 11988375857
  const l = r.linhas.find((x) => x.telefone.replace(/\D/g, '') === '11988375857');
  assert.equal(l.nomeCompleto, 'CLEONICE SOUZA DE MELO');
  assert.equal(l.primeiroNome, 'Cleonice');
});

test('linha sem telefone retorna telefone vazio', async () => {
  const r = await parsed();
  // 13:30 ANDREIA DA SILVA GONZAGA -> sem telefone
  const l = r.linhas.find((x) => x.nomeCompleto.startsWith('ANDREIA'));
  assert.equal(l.telefone, '');
});

test('horario com minutos formata HHhMM', async () => {
  const r = await parsed();
  const l = r.linhas.find((x) => x.hora === '08:10');
  assert.equal(l.horaFmt, '08h10');
});
