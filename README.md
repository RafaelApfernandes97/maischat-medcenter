# Medcenter — Lembrete de Agendamento via PDF → canal 0800

Aplicação web onde o cliente sobe o PDF da agenda médica ("Módulo de Agenda
Médica"), revisa a lista de envios e dispara o template WhatsApp
`teste_agendamento` pelo canal **0800 - Cloud** (Mais Chat / Meta Cloud API),
acompanhando o progresso em tempo real.

## Como funciona

1. **Upload** do PDF na página.
2. O backend extrai (posicionalmente) **médico**, **data** e a tabela de
   agendamentos (**hora**, **paciente**, **telefone**).
3. Os telefones são normalizados para E.164. Política conservadora: só celular
   brasileiro completo (DDD + 9 + 8 dígitos) é válido; o resto é marcado como
   inválido e **não** é enviado.
4. Tela de **pré-visualização** com válidos/inválidos e o motivo de cada
   exclusão (**Falta DDD** ou **Número incorreto**). O telefone é **editável**
   na própria lista: corrija e clique em **Validar** (ou Enter) para revalidar;
   os contadores e o número WhatsApp são atualizados na hora. Caracteres
   especiais e zero de tronco são higienizados automaticamente.
5. Ao clicar em **Enviar**, cria um **lote** que dispara os templates em
   background (continua mesmo se fechar a aba) e leva para o **Acompanhamento**.

## Acompanhamento de envios

- Cada envio vira um **lote** persistido no PostgreSQL.
- Tela **Acompanhamento**: lista os lotes (data/hora, médico, total,
  enviados, lidos, status). Clicar abre o **detalhe**.
- **Detalhe do lote**: resumo + tabela por contato (paciente, telefone,
  mensagem enviada — médico/data/hora, quando foi enviado, status de envio e de
  entrega/leitura). Atualiza sozinho enquanto o lote roda (polling).
- Botão **Atualizar status**: consulta a API da Mais Chat
  (`GET /messages/destination/{e164}`) e mapeia o `ack` da mensagem
  (`-1` falha · `1` enviado · `2` entregue · `3` lido) por contato.
- Em `DRY_RUN`, o envio e o status são **simulados** (sem chamar a API).

Mapeamento do template (`teste_agendamento`, `pt_BR`):

| Parâmetro | Conteúdo | Origem |
|-----------|----------|--------|
| `{{1}}` | primeiro nome do paciente | coluna Paciente |
| `{{2}}` | médico | cabeçalho `Agenda:` |
| `{{3}}` | data `DD/MM` | cabeçalho `Dia:` |
| `{{4}}` | horário `HHhMM` | coluna Hora |

## Configuração

Copie `.env.example` para `.env` e preencha:

- `MAISCHAT_AUTH` — sua API key/bearer da plataforma (`Bearer ...`).
- `BROKER_TOKEN` — token do broker 0800 (Meta Cloud API).
- `BROKER_APP_ID` / `BROKER_SOURCE` — já apontam para o canal 0800.
- `DATABASE_URL` — conexão PostgreSQL do histórico de lotes
  (`postgres://user:senha@host:5432/banco?sslmode=disable`). O schema
  (`medcenter_lotes`, `medcenter_lote_mensagens`) é criado automaticamente.
- `DRY_RUN=true` — **modo simulado**: roda todo o fluxo sem enviar mensagens
  reais. Coloque `false` para enviar de verdade.

## Rodar

```bash
npm install
npm start        # http://localhost:3000  (usa .env automaticamente)
npm test         # testes (parser, telefone, envio, orquestração)
```

## Estrutura

```
src/
  pdfParser.js    extração posicional do PDF (pdfjs-dist)
  phone.js        normalização/validação E.164
  agenda.js       orquestra parser + telefone -> lista de envios
  maischat.js     cliente da Meta Cloud API (envio + status por wamid)
  lotes.js        lógica pura dos lotes (mapa de ack, resumo)
  lotesRepo.js    persistência dos lotes/mensagens no PostgreSQL
  envioService.js envio em background + atualização de status
  db.js           pool e schema do PostgreSQL
  config.js       configuração por variáveis de ambiente
  server.js       Express: upload, preview, /api/enviar, /api/lotes
public/           front-end (upload, revisão, acompanhamento de envios)
```

## Notas

- Cada linha = 1 mensagem (paciente com 2 horários recebe 2 lembretes).
- Recomenda-se um primeiro disparo real para **um número de teste** antes de
  liberar o lote completo.
- Telefones inválidos: corrija no sistema de origem e gere o PDF novamente.
