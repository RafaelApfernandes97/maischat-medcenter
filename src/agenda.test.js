import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prepararPreview, revalidarItem, removerItem, adicionarItem } from './agenda.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_PATH = join(__dirname, '..', 'pdfenvio.pdf');

async function preview() {
  const buf = await readFile(PDF_PATH);
  return prepararPreview(buf);
}

test('inclui cabecalho medico e data', async () => {
  const p = await preview();
  assert.equal(p.medico, 'Adney');
  assert.equal(p.data, '22/05');
});

test('cada item traz nome, telefone normalizado e status de validade', async () => {
  const p = await preview();
  const clayton = p.itens.find((i) => i.primeiroNome === 'Clayton');
  assert.equal(clayton.e164, '5519971486054');
  assert.equal(clayton.valido, true);
  assert.equal(clayton.medico, 'Adney');
  assert.equal(clayton.data, '22/05');
  assert.equal(clayton.hora, '08h00');
});

test('itens invalidos vem com motivo e sem e164', async () => {
  const p = await preview();
  const andreia = p.itens.find((i) => i.primeiroNome === 'Andreia');
  assert.equal(andreia.valido, false);
  assert.equal(andreia.e164, null);
  assert.match(andreia.motivo, /vazio/);
});

test('contadores de validos e invalidos', async () => {
  const p = await preview();
  assert.equal(p.totalValidos, 33);
  assert.equal(p.totalInvalidos, 15);
  assert.equal(p.itens.length, 48);
});

test('cada item tem um id estavel para acompanhar o envio', async () => {
  const p = await preview();
  const ids = p.itens.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('item traz o tipo do erro (sem_ddd / incorreto / vazio)', async () => {
  const p = await preview();
  const nelvin = p.itens.find((i) => i.primeiroNome === 'Nelvin'); // 98239-2147
  assert.equal(nelvin.tipo, 'sem_ddd');
  assert.equal(nelvin.motivo, 'Falta DDD');
});

test('revalidarItem corrige um telefone e atualiza o item e os totais', async () => {
  const p = await preview();
  const alvo = p.itens.find((i) => i.primeiroNome === 'Nelvin'); // invalido: 98239-2147
  const validosAntes = p.totalValidos;

  const r = revalidarItem(p, alvo.id, '19 98239-2147');

  assert.equal(r.item.valido, true);
  assert.equal(r.item.e164, '5519982392147');
  assert.equal(r.item.telefoneOriginal, '19 98239-2147');
  assert.equal(r.totalValidos, validosAntes + 1);
  assert.equal(r.totalInvalidos, p.itens.length - (validosAntes + 1));
  // O preview foi atualizado in-place para o envio usar o numero corrigido.
  assert.equal(p.itens.find((i) => i.id === alvo.id).e164, '5519982392147');
});

test('revalidarItem higieniza caracteres especiais do telefone editado', () => {
  const preview = { itens: [{ id: 'x', valido: false, telefoneOriginal: '', e164: null }] };
  const r = revalidarItem(preview, 'x', '(19) 99898-0291');
  assert.equal(r.item.valido, true);
  assert.equal(r.item.e164, '5519998980291');
});

test('revalidarItem com id inexistente retorna null', async () => {
  const p = await preview();
  assert.equal(revalidarItem(p, 'nao-existe', '11999999999'), null);
});

// --- remover contato ---

test('removerItem tira o contato da lista e recalcula totais', async () => {
  const p = await preview();
  const alvo = p.itens.find((i) => i.primeiroNome === 'Clayton'); // valido
  const totalAntes = p.itens.length;
  const validosAntes = p.totalValidos;

  const r = removerItem(p, alvo.id);

  assert.equal(p.itens.length, totalAntes - 1);
  assert.equal(p.itens.find((i) => i.id === alvo.id), undefined);
  assert.equal(r.totalValidos, validosAntes - 1);
  assert.equal(r.totalInvalidos, p.itens.filter((i) => !i.valido).length);
});

test('removerItem com id inexistente retorna null', async () => {
  const p = await preview();
  assert.equal(removerItem(p, 'nao-existe'), null);
});

// --- adicionar contato ---

test('adicionarItem cria contato valido herdando medico e data da agenda', async () => {
  const p = await preview();
  const totalAntes = p.itens.length;
  const validosAntes = p.totalValidos;

  const r = adicionarItem(p, { nome: 'joão paulo', telefone: '(19) 99999-8888', hora: '08:00' });

  assert.equal(r.item.valido, true);
  assert.equal(r.item.e164, '5519999998888');
  assert.equal(r.item.medico, 'Adney');
  assert.equal(r.item.data, '22/05');
  assert.equal(r.item.primeiroNome, 'João');
  assert.equal(r.item.nomeCompleto, 'joão paulo');
  assert.equal(r.item.hora, '08h00');
  assert.equal(p.itens.length, totalAntes + 1);
  assert.equal(r.totalValidos, validosAntes + 1);
});

test('adicionarItem com telefone invalido entra como invalido', async () => {
  const p = await preview();
  const invalidosAntes = p.totalInvalidos;
  const r = adicionarItem(p, { nome: 'Maria', telefone: '8835-6285', hora: '09:00' });
  assert.equal(r.item.valido, false);
  assert.equal(r.item.tipo, 'incorreto');
  assert.equal(r.totalInvalidos, invalidosAntes + 1);
});

test('adicionarItem gera ids unicos', async () => {
  const p = await preview();
  const a = adicionarItem(p, { nome: 'A', telefone: '11999998888', hora: '10:00' });
  const b = adicionarItem(p, { nome: 'B', telefone: '11999998888', hora: '10:00' });
  assert.notEqual(a.item.id, b.item.id);
});

test('adicionarItem exige nome', async () => {
  const p = await preview();
  assert.throws(() => adicionarItem(p, { nome: '', telefone: '11999998888', hora: '10:00' }));
});

test('adicionarItem exige hora (parametro obrigatorio do template)', async () => {
  const p = await preview();
  assert.throws(
    () => adicionarItem(p, { nome: 'Maria', telefone: '11999998888', hora: '' }),
    /[Hh]or/,
  );
});
