// Configuracao via variaveis de ambiente. Os defaults do broker correspondem ao
// canal "0800 - Cloud". Segredos (token do broker e Authorization da plataforma)
// devem vir do .env e nao sao versionados.

export function loadConfig() {
  return {
    apiBase: process.env.MAISCHAT_API_BASE || 'https://api.maischat.io/v3',
    auth: process.env.MAISCHAT_AUTH || '',
    // Template do WhatsApp disparado. O nome vem do .env para nao precisar
    // alterar o codigo ao trocar de template (deve existir e estar aprovado).
    template: {
      name: process.env.TEMPLATE_NAME || 'teste_agendamento',
      language: process.env.TEMPLATE_LANG || 'pt_BR',
    },
    broker: {
      appId: process.env.BROKER_APP_ID || '238057352730277',
      source: process.env.BROKER_SOURCE || '558000708000',
      token: process.env.BROKER_TOKEN || '',
    },
    // Em modo simulado nao chama a API: util para validar o fluxo sem disparar mensagens.
    dryRun: String(process.env.DRY_RUN || '').toLowerCase() === 'true',
    databaseUrl: process.env.DATABASE_URL || '',
    port: Number(process.env.PORT || 3000),
  };
}
