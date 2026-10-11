import { callProcedure, pool, query, withConnection } from '../../core/db.js';
import { getSettings } from '../settings/settings.routes.js';
import { evaluateRules, type AgentData } from './domain/rules.js';

let running: Promise<AgentRunResult> | null = null;

export interface AgentRunResult {
  trigger: string;
  sqlSummary: { alert_type: string; severity: string; open_alerts: number }[];
  appAlerts: number;
  appResolved: number;
  durationMs: number;
}

async function loadData(): Promise<AgentData> {
  const s = await getSettings();
  const [customers, closedSessions, products] = await Promise.all([
    query(`SELECT id, full_name AS fullName, balance, credit_limit AS creditLimit FROM customers WHERE is_active = 1 AND is_walk_in = 0 AND balance > 0`),
    query(
      `SELECT cs.id, cs.closed_at AS closedAt, cs.difference, u.full_name AS closedBy,
              (SELECT COALESCE(SUM(total), 0) FROM sales s WHERE s.session_id = cs.id AND s.status = 'COMPLETED') AS salesTotal
         FROM cash_sessions cs LEFT JOIN users u ON u.id = cs.closed_by
        WHERE cs.status = 'CLOSED' AND cs.closed_at >= NOW() - INTERVAL 7 DAY`,
    ),
    query(
      `SELECT p.id, p.name, p.sale_price AS salePrice, p.avg_cost AS avgCost,
              COALESCE(SUM(IF(t.tax_type = 'PERCENT', t.rate, 0)), 0) AS taxPct,
              COALESCE(SUM(IF(t.tax_type = 'FIXED', t.rate, 0)), 0) AS fixedTaxPerUnit
         FROM products p
         LEFT JOIN product_taxes pt ON pt.product_id = p.id
         LEFT JOIN taxes t ON t.id = pt.tax_id AND t.is_active = 1 AND t.applies_to IN ('SALES', 'BOTH')
        WHERE p.is_active = 1 AND p.deleted_at IS NULL
        GROUP BY p.id`,
    ),
  ]);
  return {
    customers: customers as AgentData['customers'],
    closedSessions: closedSessions as AgentData['closedSessions'],
    products: products as AgentData['products'],
    settings: {
      pricesIncludeTax: Boolean(s.prices_include_tax),
      minMarginPct: Number(s.agent_min_margin_pct ?? 5),
      cashToleranceAbs: Number(s.agent_cash_tolerance ?? 200),
      cashTolerancePct: Number(s.agent_cash_tolerance_pct ?? 0.5),
    },
  };
}

async function runOnce(trigger: string): Promise<AgentRunResult> {
  const started = Date.now();
  // 1) Règles SQL (stock, péremption, réassort, anomalies, promotions, paniers)
  const sql = await withConnection(null, (conn) => callProcedure(conn, 'sp_agent_run', []));

  // 2) Règles TypeScript : upsert puis résolution des alertes 'APP:' non revues
  const [[{ startTs }]]: any = await pool.query('SELECT NOW(6) AS startTs');
  const drafts = evaluateRules(await loadData());
  for (const d of drafts) {
    await pool.query(
      `INSERT INTO smart_alerts (alert_type, severity, product_id, dedupe_key, message_key, payload, score)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE severity = VALUES(severity), payload = VALUES(payload), score = VALUES(score),
         last_seen_at = CURRENT_TIMESTAMP(6), status = IF(status = 'RESOLVED', 'NEW', status)`,
      [d.type, d.severity, d.productId ?? null, `APP:${d.key}`, d.messageKey, JSON.stringify(d.payload), d.score],
    );
  }
  const [resolved]: any = await pool.query(
    `UPDATE smart_alerts SET status = 'RESOLVED', handled_at = NOW()
      WHERE dedupe_key LIKE 'APP:%' AND status IN ('NEW', 'ACKNOWLEDGED') AND last_seen_at < ?`,
    [startTs],
  );
  return {
    trigger,
    sqlSummary: (sql.resultSets[0] ?? []) as AgentRunResult['sqlSummary'],
    appAlerts: drafts.length,
    appResolved: resolved.affectedRows,
    durationMs: Date.now() - started,
  };
}

/** Un seul passage à la fois : un appel concurrent attend le passage en cours. */
export function runAgent(trigger = 'manual'): Promise<AgentRunResult> {
  if (!running) running = runOnce(trigger).finally(() => (running = null));
  return running;
}

export async function runAgentSafely(trigger: string) {
  try {
    const r = await runAgent(trigger);
    console.log(`[agent] ${trigger}: ${r.appAlerts} app alerts, ${r.durationMs} ms`);
  } catch (err) {
    console.error('[agent] run failed', err);
  }
}
