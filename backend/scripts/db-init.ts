/**
 * Crée (ou recrée) la base BAQALA à partir de database/schema.sql,
 * crée l'utilisateur applicatif MySQL et, avec --demo, charge seed_demo.sql.
 *
 *   npm run db:init          # base vide prête à l'emploi
 *   npm run db:demo          # + données de démonstration
 *
 * ATTENTION : supprime la base existante (DROP DATABASE). Si elle contient déjà des ventes,
 * le script refuse de continuer sauf avec --force (npm run db:reset / npm run db:demo:reset).
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { splitSql } from './sql.js';
import { markAllMigrationsApplied } from './db-migrate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database');
const demo = process.argv.includes('--demo');
const force = process.argv.includes('--force');

async function runFile(conn: mysql.Connection, file: string) {
  const stmts = splitSql(fs.readFileSync(path.join(root, file), 'utf8'));
  for (const s of stmts) await conn.query(s);
  console.log(`✔ ${file} (${stmts.length} statements)`);
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_ROOT_USER ?? 'root',
    password: process.env.DB_ROOT_PASSWORD ?? '',
    charset: 'UTF8MB4_0900_AI_CI',
  });
  // Garde-fou : ne jamais écraser une base qui contient déjà des ventes réelles
  const [existing] = await conn.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'baqala' AND table_name = 'sales'",
  );
  if (existing[0].n > 0 && !force) {
    const [[{ n }]] = await conn.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS n FROM baqala.sales') as any;
    if (n > 0) {
      console.error(`✖ La base 'baqala' contient déjà ${n} vente(s). Elle serait supprimée.`);
      console.error('  Sauvegardez-la (mysqldump baqala > sauvegarde.sql) puis relancez avec : npm run db:reset (ou npm run db:demo:reset)');
      await conn.end();
      process.exit(1);
    }
  }
  await runFile(conn, 'schema.sql');

  const user = process.env.DB_USER ?? 'baqala';
  const password = process.env.DB_PASSWORD ?? '';
  const dbName = process.env.DB_NAME ?? 'baqala';
  if (user !== (process.env.DB_ROOT_USER ?? 'root')) {
    for (const host of ['localhost', '127.0.0.1']) {
      await conn.query(`CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?`, [user, host, password]);
      await conn.query(`ALTER USER ?@? IDENTIFIED BY ?`, [user, host, password]);
      await conn.query(`GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE, CREATE TEMPORARY TABLES ON \`${dbName}\`.* TO ?@?`, [user, host]);
    }
    console.log(`✔ MySQL user '${user}' granted on ${dbName}`);
  }
  // schema.sql contient déjà toutes les migrations : on les note comme appliquées
  await markAllMigrationsApplied(conn);
  if (demo) {
    await conn.query(`USE \`${dbName}\``);
    await runFile(conn, 'seed_demo.sql');
  }
  await conn.end();
  console.log('Database ready. Default login: admin / Admin@123');
}

main().catch((err) => {
  console.error('✖ Database initialisation failed:', err.message);
  process.exit(1);
});
