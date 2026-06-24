# Automação de Agendamento via PDF → Canal 0800

**Data:** 2026-06-22
**Stack:** Node.js + Express + front-end estático

## Objetivo

Permitir que um cliente suba, em uma página web, o PDF de agenda médica
("Módulo de Agenda Médica"). O sistema extrai os agendamentos, mostra a lista
para revisão e, ao confirmar, dispara o template WhatsApp `teste_agendamento`
pelo canal **0800 - Cloud** para cada paciente com telefone válido, exibindo o
progresso dos envios em tempo real.

## Fluxo do usuário

1. Cliente acessa a página e faz upload do PDF.
2. Backend faz o parsing e a validação dos telefones.
3. Tela de pré-visualização mostra a lista de envios (válidos/inválidos).
4. Cliente clica em **Enviar**.
5. Cliente acompanha os envios sendo realizados (progresso por linha).
6. Relatório final (enviados / falhas).

## Mapeamento de dados (template `teste_agendamento`, pt_BR, POSITIONAL)

Texto do template:
> Olá, {{1}} tudo bem? 😊
> Estamos passando para lembrar da sua consulta com o(a) Dr(a). {{2}}, aqui na MD Clinic.
> 📅 Data: {{3}}  🕒 Horário: {{4}}
> ... responder com "confirmo"?

| Parâmetro | Conteúdo | Fonte no PDF |
|-----------|----------|--------------|
| `{{1}}` | nome do paciente | coluna **Paciente** |
| `{{2}}` | nome do médico | cabeçalho **Agenda:** (ex.: `Adney`) |
| `{{3}}` | data `DD/MM` | cabeçalho **Dia:** (ex.: `22 de maio de 2026` → `22/05`) |
| `{{4}}` | horário `HHhMM` | coluna **Hora** (ex.: `08:10` → `08h10`) |

## Canal de envio (broker 0800 - Cloud)

- broker: `wppCloudAPI`
- appId (Phone Number ID): `238057352730277`
- source (número remetente): `558000708000`
- wabaId: `267150379809056`
- token: do broker (configurável via variável de ambiente, **não** versionado)
- Endpoint: `POST https://api.maischat.io/v3/template/send/wppCloudAPI`

## Componentes (módulos isolados)

| Módulo | Responsabilidade | Entrada → Saída |
|--------|------------------|-----------------|
| `src/pdfParser.js` | Extrai texto do PDF e estrutura os dados | Buffer → `{ medico, data, dataISO, linhas[] }` |
| `src/phone.js` | Normaliza e valida telefone (E.164) | string → `{ original, e164, valido, motivo }` |
| `src/maischat.js` | Cliente HTTP de envio de template | linha → resposta da API |
| `src/server.js` | Rotas Express | — |
| `public/` | Front: upload, tabela de revisão, progresso | — |

## Regras de parsing (formato fixo "Módulo de Agenda Médica")

- **Médico:** regex sobre `Agenda: <nome>`.
- **Data:** regex sobre `Dia: <dia-semana> - DD de <mês> de AAAA`; converter mês
  por extenso (pt-BR) para número; produzir `DD/MM` e ISO `AAAA-MM-DD`.
- **Linhas:** cada registro começa com `HH:MM`. Nome do paciente pode quebrar em
  várias linhas até a próxima coluna (telefone). Remover sufixos de ruído soltos
  (números de ficha, anotações como "Dr Pediu", "retorno cirurgia").
- Linhas sem telefone são incluídas, porém marcadas inválidas.

## Regras de telefone (conservador — "só válidos certos")

Após limpar (remover espaços, `-`, `.`, `(`, `)`):

- **VÁLIDO** somente celular brasileiro completo:
  - 11 dígitos = DDD(2) + `9` + 8 dígitos → resultado `55` + 11 dígitos.
  - Já com `55` na frente (13 dígitos) → valida o restante igual.
- **INVÁLIDO** (não envia): sem DDD, 8/9 dígitos soltos, dígitos a mais/menos,
  número fixo, vazio. Mostrar motivo na tela.

Inválidos **não** são enviados. O motivo é classificado para orientar a correção:
- `vazio` → "Telefone vazio"
- `sem_ddd` → "Falta DDD" (celular completo de 9 dígitos sem código de área)
- `incorreto` → "Número incorreto" (dígitos a mais/menos, fixo, etc.)

A higienização remove caracteres especiais (espaços, `-`, `.`, `(`, `)`) e o
zero de tronco à esquerda antes de validar.

O cliente pode **editar o telefone na própria lista** e revalidar: o backend
(`PATCH /api/preview/:uploadId/itens/:itemId`) renormaliza, atualiza o item em
memória e recalcula os totais; o envio passa a usar o número corrigido.

## Tela de pré-visualização e progresso

- Tabela: status (✅/❌) · Nome · Telefone original → E.164 · Data · Hora · Motivo.
- Contadores: "X válidos · Y inválidos".
- Botão **Enviar válidos**.
- Durante o envio: status por linha atualiza (enviando → enviado/erro). Progresso
  via streaming (SSE) ou polling simples.
- Cada linha = 1 mensagem (paciente com 2 horários recebe 2 lembretes).

## Envio e tratamento de erros

- Backend itera as linhas válidas, chamando o endpoint de template.
- Erro em uma linha não interrompe as demais; cada uma reporta sucesso/erro.
- Rate limit da API: 500 req/min (folgado para o volume do PDF).
- Relatório final com total enviado e lista de falhas.

## Testes

- `phone.js`: testes unitários com os casos reais do PDF (válidos e sujos:
  `19 97148-6054`, `11988375857`, `1999869698`, `98239-2147`, `8835.6285`,
  `3877-4718`, `7188413520`, `77 981244318`, vazio).
- `pdfParser.js`: teste com o `pdfenvio.pdf` real — confere médico, data e
  contagem/conteúdo das linhas.
- Integração de envio: 1 número de teste antes de liberar em lote.

## Configuração (variáveis de ambiente)

- `MAISCHAT_API_BASE` (default `https://api.maischat.io/v3`)
- `MAISCHAT_AUTH` (header de autenticação da plataforma, se exigido)
- `BROKER_APP_ID`, `BROKER_SOURCE`, `BROKER_TOKEN` (canal 0800)
- `PORT`

## Fora de escopo (MVP)

- Autenticação/login na página.
- Dedupe de pacientes repetidos (cada linha = 1 envio).
- Persistência em banco (relatório é por sessão de upload).

## Itens a confirmar com o usuário

1. A chamada REST a `api.maischat.io` exige header de API key/bearer da
   plataforma além do token do broker no corpo?
2. Número de teste (WhatsApp) para o disparo de validação.
