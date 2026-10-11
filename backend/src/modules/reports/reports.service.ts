import { callProcedure, query, queryOne, withConnection } from '../../core/db.js';

export type Granularity = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

async function proc(name: string, params: unknown[]) {
  return withConnection(null, (conn) => callProcedure(conn, name, params));
}

export async function financialSummary(from: string, to: string) {
  return (await proc('sp_financial_summary', [from, to])).resultSets[0]?.[0];
}

export async function periodReport(granularity: Granularity, from: string, to: string) {
  return (await proc('sp_period_report', [granularity, from, to])).resultSets[0] ?? [];
}

export async function taxReport(from: string, to: string) {
  return (await proc('sp_tax_report', [from, to])).resultSets[0] ?? [];
}

export async function topProducts(from: string, to: string, limit = 10): Promise<any[]> {
  const rows = (await proc('sp_top_products', [from, to, limit])).resultSets[0] ?? [];
  if (!rows.length) return rows;
  const tr = await query(
    `SELECT product_id, JSON_OBJECTAGG(language_code, name) AS translations FROM product_translations
      WHERE product_id IN (?) GROUP BY product_id`,
    [rows.map((r) => r.product_id)],
  );
  const map = new Map(tr.map((t) => [t.product_id, t.translations]));
  return rows.map((r) => ({ ...r, translations: map.get(r.product_id) ?? null }));
}

/** Données du tableau de bord : KPI, série journalière, top produits, modes de paiement, alertes. */
export async function dashboard(from: string, to: string) {
  const [summary, daily, top, payments, byCategory, stock, alerts, previous] = await Promise.all([
    financialSummary(from, to),
    periodReport('DAY', from, to),
    topProducts(from, to, 8),
    query(
      `SELECT sp.method, ROUND(SUM(sp.amount - IF(sp.method = 'CASH', s.change_due, 0)), 2) AS amount
         FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
        WHERE s.status = 'COMPLETED' AND s.created_at >= ? AND s.created_at < ? + INTERVAL 1 DAY
        GROUP BY sp.method`,
      [from, to],
    ),
    query(
      `SELECT COALESCE(c.id, 0) AS categoryId, COALESCE(c.name, '-') AS name,
              (SELECT JSON_OBJECTAGG(t.language_code, t.name) FROM category_translations t WHERE t.category_id = c.id) AS translations,
              ROUND(SUM(si.net_amount), 2) AS revenue
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id LEFT JOIN categories c ON c.id = p.category_id
        WHERE s.status = 'COMPLETED' AND s.created_at >= ? AND s.created_at < ? + INTERVAL 1 DAY
        GROUP BY c.id, c.name ORDER BY revenue DESC`,
      [from, to],
    ),
    queryOne(
      `SELECT SUM(stock_status = 'OUT_OF_STOCK') AS outOfStock, SUM(stock_status = 'LOW') AS lowStock,
              ROUND(SUM(GREATEST(stock_value, 0)), 2) AS stockValue FROM v_product_stock_status`,
    ),
    query(
      `SELECT alert_type AS type, severity, COUNT(*) AS count FROM smart_alerts
        WHERE status IN ('NEW', 'ACKNOWLEDGED') GROUP BY alert_type, severity`,
    ),
    // Période précédente de même durée, pour les variations
    (async () => {
      const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
      const prevTo = new Date(Date.parse(from) - 86400000).toISOString().slice(0, 10);
      const prevFrom = new Date(Date.parse(from) - days * 86400000).toISOString().slice(0, 10);
      return financialSummary(prevFrom, prevTo);
    })(),
  ]);
  return { from, to, summary, previous, daily, top, payments, byCategory, stock, alerts };
}
