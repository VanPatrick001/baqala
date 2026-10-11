import cron from 'node-cron';
import { env } from '../config/env.js';
import { runAgentSafely } from '../modules/agent/agent.engine.js';

/** Planifie le Smart Agent (par défaut toutes les heures) et lance un premier passage au démarrage. */
export function startAgentJob() {
  if (!env.agent.enabled) return;
  cron.schedule(env.agent.cron, () => void runAgentSafely('cron'));
  setTimeout(() => void runAgentSafely('startup'), 3000);
  console.log(`[agent] scheduled: "${env.agent.cron}"`);
}
