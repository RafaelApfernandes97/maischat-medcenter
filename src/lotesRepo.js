// Repositorio dos lotes/mensagens no PostgreSQL.

import { getPool } from './db.js';

/**
 * Cria um lote e insere suas mensagens iniciais.
 * @param {{ id, medico, data, dryRun, mensagens: Array }} lote
 */
export async function criarLote({ id, medico, data, dryRun, mensagens }) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO medcenter_lotes (id, medico, data, total, status, dry_run)
       VALUES ($1, $2, $3, $4, 'rodando', $5)`,
      [id, medico, data, mensagens.length, dryRun]
    );
    for (const m of mensagens) {
      await client.query(
        `INSERT INTO medcenter_lote_mensagens
           (lote_id, item_id, paciente, primeiro_nome, telefone, medico, data, hora,
            status_envio, status_entrega)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pendente','pendente')`,
        [id, m.itemId, m.paciente, m.primeiroNome, m.telefone, m.medico, m.data, m.hora]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Marca o resultado do envio de uma mensagem (por lote + item).
 */
export async function marcarEnvio(loteId, itemId, { ok, wamid, erro, enviadoEm }) {
  await getPool().query(
    `UPDATE medcenter_lote_mensagens
        SET status_envio = $3,
            status_entrega = $4,
            wamid = $5,
            erro = $6,
            enviado_em = $7
      WHERE lote_id = $1 AND item_id = $2`,
    [loteId, itemId, ok ? 'enviado' : 'falha', ok ? 'enviado' : 'falha', wamid, erro, enviadoEm]
  );
}

export async function concluirLote(loteId) {
  await getPool().query(`UPDATE medcenter_lotes SET status = 'concluido' WHERE id = $1`, [loteId]);
}

/**
 * Atualiza o status de entrega/leitura de uma mensagem (por id da linha).
 * `erro` (opcional) registra o motivo quando a entrega falha (ex.: codigo Meta).
 */
export async function atualizarStatusEntrega(mensagemId, statusEntrega, quando, erro = null) {
  await getPool().query(
    `UPDATE medcenter_lote_mensagens
        SET status_entrega = $2, status_atualizado_em = $3, erro = COALESCE($4, erro)
      WHERE id = $1`,
    [mensagemId, statusEntrega, quando, erro]
  );
}

/** Lista os lotes com contadores agregados, mais recente primeiro. */
export async function listarLotes() {
  const { rows } = await getPool().query(
    `SELECT l.id, l.criado_em, l.medico, l.data, l.total, l.status, l.dry_run,
            COUNT(m.*) FILTER (WHERE m.status_envio = 'enviado') AS enviados,
            COUNT(m.*) FILTER (WHERE m.status_envio = 'falha')   AS falhas,
            COUNT(m.*) FILTER (WHERE m.status_entrega = 'lido')  AS lidos
       FROM medcenter_lotes l
       LEFT JOIN medcenter_lote_mensagens m ON m.lote_id = l.id
      GROUP BY l.id
      ORDER BY l.criado_em DESC
      LIMIT 100`
  );
  return rows.map(formatarResumo);
}

/** Detalhe de um lote com suas mensagens. */
export async function obterLote(loteId) {
  const pool = getPool();
  const lote = await pool.query(
    `SELECT id, criado_em, medico, data, total, status, dry_run
       FROM medcenter_lotes WHERE id = $1`,
    [loteId]
  );
  if (lote.rowCount === 0) return null;
  const msgs = await pool.query(
    `SELECT id, item_id, paciente, primeiro_nome, telefone, medico, data, hora,
            status_envio, enviado_em, wamid, erro, status_entrega, status_atualizado_em
       FROM medcenter_lote_mensagens
      WHERE lote_id = $1
      ORDER BY id ASC`,
    [loteId]
  );
  return { ...formatarLote(lote.rows[0]), mensagens: msgs.rows.map(formatarMensagem) };
}

/** Mensagens de um lote que possuem wamid (para atualizacao de status). */
export async function mensagensComWamid(loteId) {
  const { rows } = await getPool().query(
    `SELECT id, telefone, wamid, status_entrega FROM medcenter_lote_mensagens
      WHERE lote_id = $1 AND wamid IS NOT NULL`,
    [loteId]
  );
  return rows.map((r) => ({ id: r.id, telefone: r.telefone, wamid: r.wamid, statusEntrega: r.status_entrega }));
}

/**
 * Mensagens enviadas com sucesso (para atualizacao de status na API real).
 * Inclui as que ficaram sem wamid, para permitir casamento por horario.
 */
export async function mensagensEnviadas(loteId) {
  const { rows } = await getPool().query(
    `SELECT id, telefone, wamid, status_entrega, enviado_em FROM medcenter_lote_mensagens
      WHERE lote_id = $1 AND status_envio = 'enviado'`,
    [loteId]
  );
  return rows.map((r) => ({
    id: r.id,
    telefone: r.telefone,
    wamid: r.wamid,
    statusEntrega: r.status_entrega,
    enviadoEm: r.enviado_em,
  }));
}

/** Grava (ou corrige) o wamid de uma mensagem. */
export async function definirWamid(mensagemId, wamid) {
  await getPool().query(`UPDATE medcenter_lote_mensagens SET wamid = $2 WHERE id = $1`, [mensagemId, wamid]);
}

function formatarResumo(r) {
  return {
    id: r.id,
    criadoEm: r.criado_em,
    medico: r.medico,
    data: r.data,
    total: r.total,
    status: r.status,
    dryRun: r.dry_run,
    enviados: Number(r.enviados),
    falhas: Number(r.falhas),
    lidos: Number(r.lidos),
  };
}

function formatarLote(r) {
  return {
    id: r.id,
    criadoEm: r.criado_em,
    medico: r.medico,
    data: r.data,
    total: r.total,
    status: r.status,
    dryRun: r.dry_run,
  };
}

function formatarMensagem(r) {
  return {
    id: r.id,
    itemId: r.item_id,
    paciente: r.paciente,
    primeiroNome: r.primeiro_nome,
    telefone: r.telefone,
    medico: r.medico,
    data: r.data,
    hora: r.hora,
    statusEnvio: r.status_envio,
    enviadoEm: r.enviado_em,
    wamid: r.wamid,
    erro: r.erro,
    statusEntrega: r.status_entrega,
    statusAtualizadoEm: r.status_atualizado_em,
  };
}
