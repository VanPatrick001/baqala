import os from 'node:os';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './core/db.js';
import { startAgentJob } from './jobs/agent.job.js';

const app = createApp();

pool
  .query('SELECT 1')
  .then(() => console.log(`[db] connected to ${env.db.host}:${env.db.port}/${env.db.database}`))
  .catch((err) => console.error('[db] connection failed - check backend/.env and that MySQL is running:', err.message));

app.listen(env.port, env.host, () => {
  console.log(`[api] BAQALA sur ce PC     : http://localhost:${env.port}`);
  if (env.host !== '127.0.0.1' && env.host !== 'localhost') {
    // Adresses à taper depuis une tablette, un autre PC ou via Tailscale (100.x.x.x)
    for (const nets of Object.values(os.networkInterfaces())) {
      for (const n of nets ?? []) {
        if (n.family === 'IPv4' && !n.internal) console.log(`[api] BAQALA sur le réseau : http://${n.address}:${env.port}`);
      }
    }
  }
  startAgentJob();
});
