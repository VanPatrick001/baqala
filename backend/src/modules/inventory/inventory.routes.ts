import { Router } from 'express';
import { z } from 'zod';
import { callProcedure, query, queryOne, withConnection } from '../../core/db.js';
import { ah } from '../../core/errors.js';
import { can, userId } from '../../core/auth.js';
import { dateStr, id, limitOffset, optionalId, pageQuery, qty } from '../../core/http.js';

export const inventoryRouter = Router();

const MOVEMENT_TYPES = ['PURCHASE', 'SALE', 'SALE_RETURN', 'WASTE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'SUPPLIER_RETURN', 'OPENING'] as const;

/** Historique de tous les mouvements de stock. */
inventoryRouter.get(
  '/movements',
  can('stock.view'),
  ah(async (req, res) => {
    const q = pageQuery
      .extend({
        productId: z.coerce.number().int().optional(),
        type: z.enum(MOVEMENT_TYPES).optional(),
        from: dateStr.optional(),
        to: dateStr.optional(),
      })
      .parse(req.query);
    const where: string[] = ['1 = 1'];
    const params: unknown[] = [];
    if (q.productId) { where.push('m.product_id = ?'); params.push(q.productId); }
    if (q.type) { where.push('m.movement_type = ?'); params.push(q.type); }
    if (q.from) { where.push('m.created_at >= ?'); params.push(q.from); }
    if (q.to) { where.push('m.created_at < ? + INTERVAL 1 DAY'); params.push(q.to); }
    const [limit, offset] = limitOffset(q);
    const rows = await query(
      `SELECT m.id, m.product_id AS productId, p.name AS productName, p.sku,
              (SELECT JSON_OBJECTAGG(t.language_code, t.name) FROM product_translations t WHERE t.product_id = p.id) AS translations,
              m.batch_id AS batchId, b.batch_no AS batchNo, b.expiry_date AS expiryDate,
              m.movement_type AS type, m.quantity, m.unit_cost AS unitCost, m.balance_after AS balanceAfter,
              m.reference_type AS referenceType, m.reference_id AS referenceId, m.reason,
              u.full_name AS userName, m.created_at AS createdAt
         FROM stock_movements m
         JOIN products p ON p.id = m.product_id
         LEFT JOIN product_batches b ON b.id = m.batch_id
         LEFT JOIN users u ON u.id = m.user_id
        WHERE ${where.join(' AND ')}
        ORDER BY m.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const total = await queryOne(`SELECT COUNT(*) AS n FROM stock_movements m WHERE ${where.join(' AND ')}`, params);
    res.json({ rows, total: total?.n ?? 0 });
  }),
);

/** Lots en stock, filtrables par proximité de péremption. */
inventoryRouter.get(
  '/batches',
  can('stock.view'),
  ah(async (req, res) => {
    const q = z.object({ productId: z.coerce.number().int().optional(), withinDays: z.coerce.number().int().optional() }).parse(req.query);
    const where: string[] = ['b.qty_remaining > 0', 'p.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (q.productId) { where.push('b.product_id = ?'); params.push(q.productId); }
    if (q.withinDays !== undefined) { where.push('b.expiry_date IS NOT NULL AND b.expiry_date <= CURDATE() + INTERVAL ? DAY'); params.push(q.withinDays); }
    res.json(
      await query(
        `SELECT b.id, b.product_id AS productId, p.name AS productName, p.sku,
                (SELECT JSON_OBJECTAGG(t.language_code, t.name) FROM product_translations t WHERE t.product_id = p.id) AS translations,
                b.batch_no AS batchNo, b.expiry_date AS expiryDate, DATEDIFF(b.expiry_date, CURDATE()) AS daysLeft,
                b.qty_remaining AS qtyRemaining, b.unit_cost AS unitCost, ROUND(b.qty_remaining * b.unit_cost, 2) AS value,
                b.received_at AS receivedAt
           FROM product_batches b JOIN products p ON p.id = b.product_id
          WHERE ${where.join(' AND ')}
          ORDER BY (b.expiry_date IS NULL), b.expiry_date, p.name LIMIT 1000`,
        params,
      ),
    );
  }),
);

/** Valorisation et état global du stock. */
inventoryRouter.get(
  '/overview',
  can('stock.view'),
  ah(async (_req, res) => {
    const days = (await queryOne("SELECT CAST(setting_value AS UNSIGNED) AS d FROM settings WHERE setting_key = 'expiry_alert_days'"))?.d ?? 30;
    res.json(
      await queryOne(
        `SELECT COUNT(*) AS products,
                SUM(stock_status = 'OUT_OF_STOCK') AS outOfStock,
                SUM(stock_status = 'LOW') AS lowStock,
                ROUND(SUM(GREATEST(stock_value, 0)), 2) AS stockValue,
                ROUND(SUM(GREATEST(stock_qty, 0) * sale_price), 2) AS retailValue,
                (SELECT COUNT(*) FROM product_batches WHERE qty_remaining > 0 AND expiry_date < CURDATE()) AS expiredBatches,
                (SELECT COUNT(*) FROM product_batches WHERE qty_remaining > 0 AND expiry_date BETWEEN CURDATE() AND CURDATE() + INTERVAL ? DAY) AS expiringBatches
           FROM v_product_stock_status`,
        [days],
      ),
    );
  }),
);

inventoryRouter.post(
  '/waste',
  can('stock.manage'),
  ah(async (req, res) => {
    const b = z.object({ productId: id, qty, batchId: optionalId, reason: z.string().min(1).max(255) }).parse(req.body);
    await withConnection(userId(req), (conn) =>
      callProcedure(conn, 'sp_record_waste', [b.productId, b.qty, b.batchId ?? null, b.reason, userId(req)]),
    );
    res.json({ ok: true });
  }),
);

/** Ajustement d'inventaire : on saisit la quantité réellement comptée. */
inventoryRouter.post(
  '/adjust',
  can('stock.manage'),
  ah(async (req, res) => {
    const b = z.object({ productId: id, countedQty: z.coerce.number().min(0), reason: z.string().min(1).max(255) }).parse(req.body);
    await withConnection(userId(req), (conn) =>
      callProcedure(conn, 'sp_adjust_stock', [b.productId, b.countedQty, b.reason, userId(req)]),
    );
    res.json({ ok: true });
  }),
);
