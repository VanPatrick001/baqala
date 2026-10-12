import { Router } from 'express';
import { z } from 'zod';
import { callProcedure, query, queryOne, withConnection } from '../../core/db.js';
import { ah, AppError, notFound } from '../../core/errors.js';
import { can, hasPermission, userId } from '../../core/auth.js';
import { dateStr, id, lang, limitOffset, optionalId, pageQuery } from '../../core/http.js';
import { getSettings } from '../settings/settings.routes.js';

export const posRouter = Router();
export const salesRouter = Router();

const checkoutBody = z.object({
  sessionId: id,
  customerId: optionalId,
  language: lang.default('en'),
  items: z
    .array(
      z.object({
        product_id: id,
        qty: z.coerce.number().positive(),
        unit_price: z.coerce.number().min(0).nullable().optional(),
        discount: z.coerce.number().min(0).default(0),
      }),
    )
    .min(1),
  payments: z
    .array(
      z.object({
        method: z.enum(['CASH', 'CARD', 'MOBILE', 'CREDIT']),
        amount: z.coerce.number().positive(),
        reference: z.string().max(80).nullable().optional(),
      }),
    )
    .min(1),
});

/** Données complètes d'un ticket (en-tête, lignes, taxes détaillées, paiements, infos magasin). */
export async function loadReceipt(saleId: number) {
  const sale = await queryOne<any>(
    `SELECT s.id, s.receipt_no AS receiptNo, s.status, s.subtotal, s.discount_total AS discountTotal, s.tax_total AS taxTotal,
            s.total, s.cost_total AS costTotal, s.paid_total AS paidTotal, s.change_due AS changeDue,
            s.language_code AS language, s.created_at AS createdAt, s.session_id AS sessionId,
            s.void_reason AS voidReason, s.voided_at AS voidedAt, TIMESTAMPDIFF(MINUTE, s.created_at, NOW()) AS ageMinutes,
            u.full_name AS cashier, s.user_id AS userId, c.id AS customerId, c.full_name AS customerName, c.balance AS customerBalance
       FROM sales s JOIN users u ON u.id = s.user_id LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.id = ?`,
    [saleId],
  );
  if (!sale) throw notFound('sale');
  const [items, taxes, payments, settings] = await Promise.all([
    query(
      `SELECT si.id, si.product_id AS productId, si.product_name AS productName, p.sku,
              (SELECT JSON_OBJECTAGG(t.language_code, t.name) FROM product_translations t WHERE t.product_id = si.product_id) AS translations,
              si.quantity, si.unit_price AS unitPrice, si.discount_amount AS discount, si.net_amount AS netAmount,
              si.tax_amount AS taxAmount, si.line_total AS lineTotal, si.promotion_id AS promotionId
         FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = ? ORDER BY si.id`,
      [saleId],
    ),
    query(
      `SELECT t.code, t.name, sit.tax_type AS type, sit.rate,
              (SELECT JSON_OBJECTAGG(tt.language_code, tt.name) FROM tax_translations tt WHERE tt.tax_id = t.id) AS translations,
              SUM(sit.taxable_amount) AS taxable, SUM(sit.tax_amount) AS amount
         FROM sale_item_taxes sit JOIN sale_items si ON si.id = sit.sale_item_id JOIN taxes t ON t.id = sit.tax_id
        WHERE si.sale_id = ? AND sit.tax_amount > 0 GROUP BY t.id, t.code, t.name, sit.tax_type, sit.rate`,
      [saleId],
    ),
    query('SELECT method, amount, reference FROM sale_payments WHERE sale_id = ? ORDER BY id', [saleId]),
    getSettings(),
  ]);
  return {
    ...sale,
    items,
    taxes,
    payments,
    store: {
      name: settings.store_name,
      address: settings.store_address,
      phone: settings.store_phone,
      taxNumber: settings.store_tax_number,
      footer: settings.receipt_footer,
      currency: settings.currency_code,
      widthMm: settings.receipt_width_mm,
    },
  };
}

/** Encaissement : toute la logique (taxes, stock FEFO, paiements, crédit) est atomique dans sp_pos_checkout. */
posRouter.post(
  '/checkout',
  can('pos.use'),
  ah(async (req, res) => {
    const b = checkoutBody.parse(req.body);
    // Le prix forcé (hors promotion automatique) est réservé aux responsables
    if (b.items.some((i) => i.unit_price != null) && !hasPermission(req.user, 'sales.override_price')) {
      throw new AppError(403, 'errors.priceOverrideForbidden');
    }
    const { out } = await withConnection(userId(req), (conn) =>
      callProcedure(
        conn,
        'sp_pos_checkout',
        [b.sessionId, userId(req), b.customerId ?? null, b.items, b.payments, b.language],
        ['sale', 'receipt'],
      ),
    );
    res.status(201).json(await loadReceipt(out.sale));
  }),
);

salesRouter.get(
  '/',
  can('sales.view', 'sales.view_own'),
  ah(async (req, res) => {
    const q = pageQuery
      .extend({
        from: dateStr.optional(),
        to: dateStr.optional(),
        status: z.enum(['COMPLETED', 'VOIDED']).optional(),
        search: z.string().trim().optional(),
        sessionId: z.coerce.number().int().optional(),
      })
      .parse(req.query);
    const where = ['1 = 1'];
    const params: unknown[] = [];
    if (!hasPermission(req.user, 'sales.view')) { where.push('s.user_id = ?'); params.push(userId(req)); }
    if (q.from) { where.push('s.created_at >= ?'); params.push(q.from); }
    if (q.to) { where.push('s.created_at < ? + INTERVAL 1 DAY'); params.push(q.to); }
    if (q.status) { where.push('s.status = ?'); params.push(q.status); }
    if (q.sessionId) { where.push('s.session_id = ?'); params.push(q.sessionId); }
    if (q.search) { where.push('(s.receipt_no LIKE ? OR c.full_name LIKE ?)'); params.push(`%${q.search}%`, `%${q.search}%`); }
    const [limit, offset] = limitOffset(q);
    const rows = await query(
      `SELECT s.id, s.receipt_no AS receiptNo, s.status, s.total, s.tax_total AS taxTotal, s.subtotal,
              s.cost_total AS costTotal, s.created_at AS createdAt, u.full_name AS cashier, c.full_name AS customerName,
              (SELECT GROUP_CONCAT(DISTINCT method) FROM sale_payments sp WHERE sp.sale_id = s.id) AS methods,
              (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS itemCount
         FROM sales s JOIN users u ON u.id = s.user_id LEFT JOIN customers c ON c.id = s.customer_id
        WHERE ${where.join(' AND ')} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const totals = await queryOne(
      `SELECT COUNT(*) AS n, COALESCE(SUM(IF(s.status = 'COMPLETED', s.total, 0)), 0) AS amount
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE ${where.join(' AND ')}`,
      params,
    );
    res.json({ rows, total: totals?.n ?? 0, amount: totals?.amount ?? 0 });
  }),
);

salesRouter.get(
  '/:id',
  can('sales.view', 'sales.view_own', 'pos.use'),
  ah(async (req, res) => {
    const receipt = await loadReceipt(id.parse(req.params.id));
    if (!hasPermission(req.user, 'sales.view') && receipt.userId !== userId(req)) throw new AppError(403, 'errors.forbidden');
    res.json(receipt);
  }),
);

salesRouter.post(
  '/:id/void',
  can('sales.void', 'sales.void_own'),
  ah(async (req, res) => {
    const saleId = id.parse(req.params.id);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(255) }).parse(req.body);
    // Vendeur : uniquement ses propres ventes, et seulement pendant 24 h. Manager et administrateur : sans limite.
    if (!hasPermission(req.user, 'sales.void')) {
      const s = await queryOne<{ user_id: number; recent: number }>(
        'SELECT user_id, created_at >= NOW() - INTERVAL 24 HOUR AS recent FROM sales WHERE id = ?',
        [saleId],
      );
      if (!s) throw new AppError(404, 'errors.notFound');
      if (s.user_id !== userId(req)) throw new AppError(403, 'errors.notOwnSale');
      if (!Number(s.recent)) throw new AppError(403, 'errors.saleTooOld');
    }
    await withConnection(userId(req), (conn) => callProcedure(conn, 'sp_void_sale', [saleId, userId(req), reason]));
    res.json(await loadReceipt(saleId));
  }),
);
