import { Router } from 'express';
import { z } from 'zod';
import { callProcedure, execute, query, queryOne, withConnection, withTransaction } from '../../core/db.js';
import { ah, AppError, notFound } from '../../core/errors.js';
import { can, userId } from '../../core/auth.js';
import { id } from '../../core/http.js';
import { runAgent } from './agent.engine.js';
import { createDraftPurchase } from '../purchases/purchases.routes.js';

export const agentRouter = Router();

const ALERT_TYPES = ['LOW_STOCK', 'OUT_OF_STOCK', 'NEAR_EXPIRY', 'EXPIRED', 'REORDER', 'ANOMALY', 'PROMOTION', 'CROSS_SELL', 'CREDIT_RISK'] as const;

agentRouter.get(
  '/alerts',
  can('agent.view', 'stock.view'),
  ah(async (req, res) => {
    const q = z
      .object({
        status: z.enum(['OPEN', 'NEW', 'ACKNOWLEDGED', 'DISMISSED', 'RESOLVED', 'ALL']).default('OPEN'),
        type: z.enum(ALERT_TYPES).optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(300),
      })
      .parse(req.query);
    const where = ['1 = 1'];
    const params: unknown[] = [];
    if (q.status === 'OPEN') where.push("a.status IN ('NEW', 'ACKNOWLEDGED')");
    else if (q.status !== 'ALL') { where.push('a.status = ?'); params.push(q.status); }
    if (q.type) { where.push('a.alert_type = ?'); params.push(q.type); }
    res.json(
      await query(
        `SELECT a.id, a.alert_type AS type, a.severity, a.status, a.product_id AS productId, a.batch_id AS batchId,
                a.message_key AS messageKey, a.payload, a.score, a.first_seen_at AS firstSeenAt, a.last_seen_at AS lastSeenAt,
                a.handled_at AS handledAt, u.full_name AS handledBy,
                (SELECT JSON_OBJECTAGG(t.language_code, t.name) FROM product_translations t WHERE t.product_id = a.product_id) AS translations
           FROM smart_alerts a LEFT JOIN users u ON u.id = a.handled_by
          WHERE ${where.join(' AND ')}
          ORDER BY FIELD(a.severity, 'CRITICAL', 'WARNING', 'INFO'), a.score DESC, a.id DESC LIMIT ?`,
        [...params, q.limit],
      ),
    );
  }),
);

agentRouter.get(
  '/summary',
  can('agent.view', 'stock.view', 'pos.use'),
  ah(async (_req, res) => {
    const counts = await query(
      `SELECT alert_type AS type, severity, COUNT(*) AS count FROM smart_alerts
        WHERE status IN ('NEW', 'ACKNOWLEDGED') GROUP BY alert_type, severity`,
    );
    const lastRun = await queryOne(
      `SELECT id, started_at AS startedAt, finished_at AS finishedAt, status, alerts_upserted AS upserted,
              alerts_resolved AS resolved, error_message AS error FROM agent_runs ORDER BY id DESC LIMIT 1`,
    );
    res.json({ counts, lastRun });
  }),
);

agentRouter.post('/run', can('agent.manage', 'agent.view'), ah(async (_req, res) => res.json(await runAgent('manual'))));

async function setStatus(alertId: number, status: 'ACKNOWLEDGED' | 'DISMISSED', uid: number) {
  const r = await execute(
    `UPDATE smart_alerts SET status = ?, handled_by = ?, handled_at = NOW() WHERE id = ? AND status IN ('NEW', 'ACKNOWLEDGED')`,
    [status, uid, alertId],
  );
  if (!r.affectedRows) throw notFound('alert');
}

agentRouter.post('/alerts/:id/ack', can('agent.manage', 'stock.manage'), ah(async (req, res) => {
  await setStatus(id.parse(req.params.id), 'ACKNOWLEDGED', userId(req));
  res.json({ ok: true });
}));

agentRouter.post('/alerts/:id/dismiss', can('agent.manage'), ah(async (req, res) => {
  await setStatus(id.parse(req.params.id), 'DISMISSED', userId(req));
  res.json({ ok: true });
}));

/** Applique une promotion suggérée (proche péremption / rotation lente). */
agentRouter.post('/alerts/:id/accept-promotion', can('agent.manage'), ah(async (req, res) => {
  const { out } = await withConnection(userId(req), (conn) =>
    callProcedure(conn, 'sp_agent_accept_promotion', [id.parse(req.params.id), userId(req)], ['promotion']),
  );
  res.json({ promotionId: out.promotion });
}));

/** Applique un prix conseillé (règle de marge minimale). */
agentRouter.post('/alerts/:id/apply-price', can('agent.manage', 'products.manage'), ah(async (req, res) => {
  const alertId = id.parse(req.params.id);
  const a = await queryOne("SELECT product_id, payload FROM smart_alerts WHERE id = ? AND status IN ('NEW', 'ACKNOWLEDGED')", [alertId]);
  if (!a?.payload?.suggestedPrice || !a.product_id) throw new AppError(400, 'errors.alertNotApplicable');
  await withTransaction(userId(req), async (conn) => {
    await conn.query('UPDATE products SET sale_price = ? WHERE id = ?', [a.payload.suggestedPrice, a.product_id]);
    await conn.query("UPDATE smart_alerts SET status = 'RESOLVED', handled_by = ?, handled_at = NOW() WHERE id = ?", [userId(req), alertId]);
  });
  res.json({ ok: true });
}));

/** Transforme des recommandations de réassort en bons de commande brouillons, un par fournisseur. */
agentRouter.post('/reorder-drafts', can('purchases.manage'), ah(async (req, res) => {
  const { alertIds } = z.object({ alertIds: z.array(id).min(1) }).parse(req.body);
  const alerts = await query(
    `SELECT a.id, a.product_id, a.payload, p.default_supplier_id AS supplierId, p.purchase_price AS cost, p.avg_cost AS avgCost
       FROM smart_alerts a JOIN products p ON p.id = a.product_id
      WHERE a.id IN (?) AND a.alert_type = 'REORDER' AND a.status IN ('NEW', 'ACKNOWLEDGED')`,
    [alertIds],
  );
  if (!alerts.length) throw new AppError(400, 'errors.alertNotApplicable');
  if (alerts.some((a) => !a.supplierId)) throw new AppError(400, 'errors.productWithoutSupplier');
  const bySupplier = new Map<number, typeof alerts>();
  for (const a of alerts) bySupplier.set(a.supplierId, [...(bySupplier.get(a.supplierId) ?? []), a]);
  const uid = userId(req);
  const purchaseIds = await withTransaction(uid, async (conn) => {
    const ids: number[] = [];
    for (const [supplierId, list] of bySupplier) {
      ids.push(
        await createDraftPurchase(conn, uid, {
          supplierId,
          notes: 'Smart Agent',
          items: list.map((a) => ({ productId: a.product_id, qty: Number(a.payload.suggestedQty), unitCost: Number(a.cost || a.avgCost || 0) })),
        }),
      );
      await conn.query("UPDATE smart_alerts SET status = 'ACKNOWLEDGED', handled_by = ?, handled_at = NOW() WHERE id IN (?)", [uid, list.map((a) => a.id)]);
    }
    return ids;
  });
  res.status(201).json({ purchaseIds });
}));

/** "Souvent achetés ensemble" : suggestions de vente croisée pour la caisse. */
agentRouter.get('/associations', can('pos.use', 'agent.view'), ah(async (req, res) => {
  const q = z.object({ productIds: z.string().optional(), limit: z.coerce.number().int().max(50).default(6) }).parse(req.query);
  const ids = (q.productIds ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const params: unknown[] = [];
  let where = 'pa.lift > 1';
  if (ids.length) {
    where += ' AND pa.product_id IN (?) AND pa.associated_id NOT IN (?)';
    params.push(ids, ids);
  }
  res.json(
    await query(
      `SELECT pa.product_id AS productId, p1.name AS productName, pa.associated_id AS associatedId, p2.name AS associatedName,
              (SELECT JSON_OBJECTAGG(t.language_code, t.name) FROM product_translations t WHERE t.product_id = p2.id) AS translations,
              p2.sale_price AS salePrice, p2.stock_qty AS stockQty,
              pa.pair_count AS pairCount, pa.support, pa.confidence, pa.lift, pa.computed_at AS computedAt
         FROM product_associations pa
         JOIN products p1 ON p1.id = pa.product_id JOIN products p2 ON p2.id = pa.associated_id AND p2.is_active = 1
        WHERE ${where}
        ORDER BY pa.lift DESC, pa.confidence DESC LIMIT ?`,
      [...params, q.limit],
    ),
  );
}));
