# Nome do médico informado no upload

## Problema

Hoje o nome do médico é extraído do cabeçalho ("Agenda:") do PDF pela função
`extractMedico()` em `src/pdfParser.js`. Esse valor propaga para o preview, para
o lote e para o template do WhatsApp como parâmetro `{{1}}`.

O usuário quer que o nome do médico seja **informado manualmente** no momento do
upload (ex.: `Dr. Rodrigo Ubiratan`), tornando a extração do PDF desnecessária.
O nome usado no template passa a ser exatamente o que o usuário digitou.

## Escopo

**Dentro:**
- Campo obrigatório para o nome do médico na tela de upload (Etapa 1).
- Envio do nome junto ao PDF e validação no backend.
- Uso do nome informado como fonte da verdade em todo o fluxo (preview → lote →
  template).
- Remoção da extração do nome a partir do PDF.

**Fora:**
- Edição do nome depois de processado (preview permanece somente leitura para o
  campo médico).
- Qualquer mudança de schema no banco (colunas `medico` já existem e continuam
  sendo preenchidas).
- Mudanças em `data`/`dataISO`, que continuam vindo do PDF.

## Requisitos funcionais

1. Na Etapa 1 (`#etapa-upload`) existe um campo de texto obrigatório para o nome
   do médico, com placeholder de exemplo (`Dr. Rodrigo Ubiratan`).
2. O botão "Processar PDF" (`#btn-processar`) só habilita quando **há um arquivo
   PDF selecionado E o nome do médico não está vazio**.
3. Ao processar, o nome é enviado no mesmo `FormData` do PDF (campo `medico`).
4. O backend valida o nome: se vazio após `trim()`, responde `400` com
   `{ erro: 'Informe o nome do médico.' }` e não processa o PDF.
5. O nome informado (após `trim()`) é usado como `medico` do preview e de cada
   item, substituindo o valor que antes vinha do PDF.
6. O resumo do preview (`#r-medico`) exibe o nome informado.
7. O parser não extrai mais o nome do médico do PDF.

## Requisitos não-funcionais

- **Correção:** o nome exibido/enviado é exatamente o digitado (só `trim()`).
- **Segurança:** validação no backend, não só no frontend (o botão desabilitado
  não é autorização). Nome já é escapado na renderização (`escapar`).
- **Manutenibilidade:** parser fica mais enxuto sem `extractMedico()`.
- **Sem regressão:** `lotes.js`, `lotesRepo.js`, `envioService.js` e
  `maischat.js` já consomem `preview.medico`/`item.medico` prontos e não mudam.

## Mudanças por arquivo

### `public/index.html` (Etapa 1)
- Novo `<input type="text" id="medico">` obrigatório dentro de `#etapa-upload`,
  com `<label>` e placeholder `Dr. Rodrigo Ubiratan`, posicionado acima do
  botão "Processar PDF".

### `public/app.js`
- Estado do nome do médico considerado ao habilitar `#btn-processar`.
- Função de reavaliação chamada tanto em `definirArquivo` quanto num listener de
  `input` do campo `#medico`, habilitando o botão só com arquivo + nome.
- `processar()` faz `fd.append('medico', $('medico').value.trim())`.

### `src/server.js` (`POST /api/upload`)
- Ler `req.body.medico` (o multer popula campos de texto do multipart).
- Se vazio após `trim()`: `res.status(400).json({ erro: 'Informe o nome do médico.' })`.
- Chamar `prepararPreview(req.file.buffer, medico)`.

### `src/agenda.js`
- `prepararPreview(buffer, medico)`: usar o `medico` recebido (após `trim()`)
  como valor de `medico` no retorno e em cada item, em vez de `agenda.medico`.

### `src/pdfParser.js`
- Remover `extractMedico()`.
- `buildAgenda()` deixa de calcular/retornar `medico` (retorna `data`,
  `dataISO`, `linhas`).
- `parseAgenda()` reflete o novo retorno.

### Testes
- `src/pdfParser.test.js`: remover o teste "extrai o medico do cabecalho".
- `src/agenda.test.js`: o helper `preview()` passa a chamar
  `prepararPreview(buf, 'Adney')` (nome informado); asserções de `medico`
  validam esse valor. O teste de "adicionarItem herda medico" continua válido
  (herda de `preview.medico`).
- Novo teste em `src/agenda.test.js`: `prepararPreview` usa o nome fornecido em
  todos os itens.
- `src/maischat.test.js` e `src/lotes.test.js`: sem mudança (já recebem `medico`
  pronto).

## Fluxo de dados (novo)

```
Etapa 1: [PDF] + [nome do médico digitado]
   -> POST /api/upload (multipart: pdf + medico)
   -> valida medico não-vazio
   -> prepararPreview(buffer, medico)
        parseAgenda(buffer) -> { data, dataISO, linhas }   (sem medico)
        medico := medico informado (trim)
   -> preview { medico, data, itens[...].medico = medico }
   -> lote / template {{1}} = medico
```

## Critérios de aceitação

1. Sem nome no campo, o botão "Processar PDF" permanece desabilitado.
2. Enviar upload sem `medico` (ou vazio) resulta em `400` e nenhum
   processamento.
3. Com nome válido, o preview mostra exatamente o nome digitado em `#r-medico` e
   todos os itens carregam esse nome.
4. O lote criado e o template enviado usam o nome digitado como `{{1}}`.
5. O parser não referencia mais o cabeçalho "Agenda:" para o nome do médico.
6. `npm test` passa (testes ajustados/adicionados incluídos).
