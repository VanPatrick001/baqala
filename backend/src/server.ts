import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './core/db.js';
import { startAgentJob } from './jobs/agent.job.js';

const app = createApp();

pool
  .query('SELECT 1')
  .then(() => console.log(`[db] connected to ${env.db.host}:${env.db.port}/${env.db.database}`))
  .catch((err) => console.error('[db] connection failed - check backend/.env and that MySQL is running:', err.message));

app.listen(env.port, () => {
  console.log(`[api] BAQALA API listening on http://localhost:${env.port}`);
  startAgentJob();
});
