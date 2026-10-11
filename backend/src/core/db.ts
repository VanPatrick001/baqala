import mysql, { type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { env } from '../config/env.js';

export const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // DECIMAL -> number
  dateStrings: true,    // DATETIME -> 'YYYY-MM-DD HH:mm:ss' (heure locale du magasin, pas de décalage)
  charset: 'UTF8MB4_0900_AI_CI', // même collation que le schéma (évite les conflits de collation)
});

export type Row = RowDataPacket & Record<string, any>;
export type Conn = PoolConnection;

/** SELECT simple sur le pool. */
export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

export async function queryOne<T = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(sql, params))[0];
}

export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [res] = await pool.query(sql, params);
  return res as ResultSetHeader;
}

/**
 * Exécute fn sur une connexion dédiée où @app_user_id est positionné,
 * pour que les triggers d'audit attribuent les modifications à l'utilisateur.
 */
export async function withConnection<T>(userId: number | null, fn: (conn: Conn) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET @app_user_id = ?', [userId]);
    return await fn(conn);
  } finally {
    await conn.query('SET @app_user_id = NULL').catch(() => undefined);
    conn.release();
  }
}

/** Transaction applicative (pour les écritures multi-tables hors procédures). */
export async function withTransaction<T>(userId: number | null, fn: (conn: Conn) => Promise<T>): Promise<T> {
  return withConnection(userId, async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    }
  });
}

/**
 * Appelle une procédure stockée.
 * - inParams : paramètres IN
 * - outNames : noms des paramètres OUT (récupérés via variables de session)
 * Retourne les jeux de résultats et les valeurs OUT.
 */
export async function callProcedure(
  conn: Conn,
  name: string,
  inParams: unknown[],
  outNames: string[] = [],
): Promise<{ resultSets: Row[][]; out: Record<string, any> }> {
  const placeholders = [...inParams.map(() => '?'), ...outNames.map((n) => `@out_${n}`)].join(', ');
  const [raw] = await conn.query(`CALL ${name}(${placeholders})`, inParams.map(serialize));
  const resultSets = (Array.isArray(raw) ? raw : []).filter(Array.isArray) as Row[][];
  let out: Record<string, any> = {};
  if (outNames.length) {
    const [rows] = await conn.query(`SELECT ${outNames.map((n) => `@out_${n} AS \`${n}\``).join(', ')}`);
    out = (rows as Row[])[0] ?? {};
  }
  return { resultSets, out };
}

function serialize(v: unknown): unknown {
  if (v !== null && typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
  return v ?? null;
}
