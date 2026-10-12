/**
 * Applique les évolutions de la base (database/migrations/*.sql) sans perdre les données.
 * À lancer après chaque mise à jour de BAQALA :   npm run db:migrate
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { splitSql } from './sql.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database/migrations');
const dbName = process.env.DB_NAME ?? 'baqala';

const listMigrations = () => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : []);

async function ensureTable(conn: mysql.Connection) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS \`${dbName}\`.schema_migrations (
       version VARCHAR(100) NOT NULL PRIMARY KEY,
       applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB`,
  );
}

/** Appelé par db-init : une base neuve contient déjà toutes les migrations. */
export async function markAllMigrationsApplied(conn: mysql.Connection) {
  await ensureTable(conn);
  for (const f of listMigrations()) {
    await conn.query(`INSERT IGNORE INTO \`${dbName}\`.schema_migrations (version) VALUES (?)`, [f]);
  }
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_ROOT_USER ?? 'root',
    password: process.env.DB_ROOT_PASSWORD ?? '',
    charset: 'UTF8MB4_0900_AI_CI',
  });
  await ensureTable(conn);
  await conn.query(`USE \`${dbName}\``);
  const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT version FROM schema_migrations');
  const done = new Set(rows.map((r) => r.version));
  let applied = 0;
  for (const f of listMigrations()) {
    if (done.has(f)) continue;
    for (const stmt of splitSql(fs.readFileSync(path.join(dir, f), 'utf8'))) await conn.query(stmt);
    await conn.query('INSERT INTO schema_migrations (version) VALUES (?)', [f]);
    console.log(`✔ ${f}`);
    applied++;
  }
  console.log(applied ? `${applied} migration(s) appliquée(s).` : 'Base déjà à jour.');
  await conn.end();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error('✖ Migration échouée :', err.message);
    process.exit(1);
  });
}
