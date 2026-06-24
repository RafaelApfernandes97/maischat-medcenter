// Conexao com PostgreSQL e criacao do schema.
// Tabelas prefixadas com `medcenter_` para conviver em um banco compartilhado.

import pg from 'pg';
import { loadConfig } from './config.js';

let pool;

export function getPool() {
  if (!pool) {
    const { databaseUrl } = loadConfig();
    if (!databaseUrl) throw new Error('DATABASE_URL nao configurada.');
    pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  }
  return pool;
}

export async function initSchema() {
  const sql = `
    CREATE TABLE IF NOT EXISTS medcenter_lotes (
      id text PRIMARY KEY,
      criado_em timestamptz NOT NULL DEFAULT now(),
      medico text,
      data text,
      total integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'rodando',
      dry_run boolean NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS medcenter_lote_mensagens (
      id bigserial PRIMARY KEY,
      lote_id text NOT NULL REFERENCES medcenter_lotes(id) ON DELETE CASCADE,
      item_id text,
      paciente text,
      primeiro_nome text,
      telefone text,
      medico text,
      data text,
      hora text,
      status_envio text NOT NULL DEFAULT 'pendente',
      enviado_em timestamptz,
      wamid text,
      erro text,
      status_entrega text NOT NULL DEFAULT 'pendente',
      status_atualizado_em timestamptz
    );
    CREATE INDEX IF NOT EXISTS idx_medcenter_msg_lote ON medcenter_lote_mensagens(lote_id);
    CREATE TABLE IF NOT EXISTS medcenter_config (
      chave text PRIMARY KEY,
      valor text NOT NULL,
      atualizado_em timestamptz NOT NULL DEFAULT now()
    );
  `;
  await getPool().query(sql);
}
