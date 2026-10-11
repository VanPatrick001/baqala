import { Router } from 'express';
import { z } from 'zod';
import { callProcedure, query, queryOne, withConnection, withTransaction, type Conn } from '../../core/db.js';
import { ah, AppError, notFound } from '../../core/errors.js';
import { can, userId } from '../../core/auth.js';
import { dateStr, id, limitOffset, money, optionalId, pageQuery, qty } from '../../core/http.js';

export const purchasesRouter = Router();

purchasesRouter.get(
  '/',
  can('purchases.view'),
  ah(async (req, res) => {
    const q = pageQuery
      .extend({ status: z.enum(['DRAFT', 'RECEIVED', 'CANCELLED']).optional(), supplierId: z.coerce.number().int().optional() })
      .parse(req.query);
    const where: string[] = ['1 = 1'];
    const params: unknown[] = [];
    if (q.status) { where.push('pu.status = ?'); params.push(q.status); }
    if (q.supplierId) { where.push('pu.supplier_id = ?'); params.push(q.supplierId); }
    const [limit, offset] = limitOffset(q);
    const rows = await query(
      `SELECT pu.id, pu.purchase_no AS purchaseNo, pu.supplier_id AS supplierId, s.name AS supplierName,
              pu.supplier_invoice_no AS supplierInvoiceNo, pu.status, pu.payment_status AS paymentStatus,
              pu.subtotal, pu.tax_total AS taxTotal, pu.total, pu.paid_total AS paidTotal,
              pu.ordered_at AS orderedAt, pu.received_at AS receivedAt,
              (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = pu.id) AS itemCount,
              (SELECT ROUND(SUM(pi.quantity * pi.unit_cost), 2) FROM purchase_items pi WHERE pi.purchase_id = pu.id) AS estimatedNet
         FROM purchases pu JOIN suppliers s ON s.id = pu.supplier_id
        WHERE ${where.join(' AND ')} ORDER BY pu.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const total = await queryOne(`SELECT COUNT(*) AS n FROM purchases pu WHERE ${where.join(' AND ')}`, params);
    res.json({ rows, total: total?.n ?? 0 });
  }),
);

async function loadPurchase(purchaseId: number) {
  const header = await queryOne(
    `SELECT pu.*, s.name AS supplier_name FROM purchases pu JOIN suppliers s ON s.id = pu.supplier_id WHERE pu.id = ?`,
    [purchaseId],
  );
  if (!header) throw notFound('purchase');
  const items = await query(
    `SELECT pi.id, pi.product_id AS productId, p.name AS productName, p.sku,
            (SELECT JSON_OBJECTAGG(t.language_code, t.name) FROM product_translations t WHERE t.product_id = p.id) AS translations,
            pi.batch_no AS batchNo, pi.expiry_date AS expiryDate, pi.quantity, pi.unit_cost AS unitCost,
            pi.net_amount AS netAmount, pi.tax_amount AS taxAmount, pi.line_total AS lineTotal
       FROM purchase_items pi JOIN products p ON p.id = pi.product_id WHERE pi.purchase_id = ? ORDER BY pi.id`,
    [purchaseId],
  );
  return {
    id: header.id, purchaseNo: header.purchase_no, supplierId: header.supplier_id, supplierName: header.supplier_name,
    supplierInvoiceNo: header.supplier_invoice_no, status: header.status, paymentStatus: header.payment_status,
    subtotal: header.subtotal, taxTotal: header.tax_total, total: header.total, paidTotal: header.paid_total,
    notes: header.notes, orderedAt: header.ordered_at, receivedAt: header.received_at, items,
  };
}

purchasesRouter.get('/:id', can('purchases.view'), ah(async (req, res) => res.json(await loadPurchase(id.parse(req.params.id)))));

const itemSchema = z.object({
  productId: id,
  qty,
  unitCost: money,
  batchNo: z.string().max(50).nullable().optional(),
  expiryDate: dateStr.nullable().optional(),
});

const purchaseBody = z.object({
  supplierId: id,
  supplierInvoiceNo: z.string().max(60).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  items: z.array(itemSchema).min(1),
  receive: z.boolean().default(false),
});

export async function createDraftPurchase(
  conn: Conn,
  uid: number,
  data: { supplierId: number; supplierInvoiceNo?: string | null; notes?: string | null; items: z.infer<typeof itemSchema>[] },
): Promise<number> {
  const { out } = await callProcedure(conn, 'sp_next_document_number', ['PURCHASE'], ['no']);
  const [r]: any = await conn.query(
    'INSERT INTO purchases (purchase_no, supplier_id, supplier_invoice_no, notes, user_id) VALUES (?, ?, ?, ?, ?)',
    [out.no, data.supplierId, data.supplierInvoiceNo ?? null, data.notes ?? null, uid],
  );
  for (const it of data.items) {
    await conn.query(
      'INSERT INTO purchase_items (purchase_id, product_id, batch_no, expiry_date, quantity, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
      [r.insertId, it.productId, it.batchNo || null, it.expiryDate || null, it.qty, it.unitCost],
    );
  }
  return r.insertId;
}

purchasesRouter.post(
  '/',
  can('purchases.manage'),
  ah(async (req, res) => {
    const b = purchaseBody.parse(req.body);
    const uid = userId(req);
    const purchaseId = await withTransaction(uid, (conn) => createDraftPurchase(conn, uid, b));
    if (b.receive) {
      await withConnection(uid, (conn) => callProcedure(conn, 'sp_receive_purchase', [purchaseId, uid]));
    }
    res.status(201).json(await loadPurchase(purchaseId));
  }),
);

/** Remplace les lignes d'un brouillon. */
purchasesRouter.put(
  '/:id',
  can('purchases.manage'),
  ah(async (req, res) => {
    const purchaseId = id.parse(req.params.id);
    const b = purchaseBody.parse(req.body);
    await withTransaction(userId(req), async (conn) => {
      const [rows]: any = await conn.query('SELECT status FROM purchases WHERE id = ? FOR UPDATE', [purchaseId]);
      if (!rows[0]) throw notFound('purchase');
      if (rows[0].status !== 'DRAFT') throw new AppError(400, 'errors.purchaseNotDraft');
      await conn.query('UPDATE purchases SET supplier_id = ?, supplier_invoice_no = ?, notes = ? WHERE id = ?', [
        b.supplierId, b.supplierInvoiceNo ?? null, b.notes ?? null, purchaseId,
      ]);
      await conn.query('DELETE FROM purchase_items WHERE purchase_id = ?', [purchaseId]);
      for (const it of b.items) {
        await conn.query(
          'INSERT INTO purchase_items (purchase_id, product_id, batch_no, expiry_date, quantity, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
          [purchaseId, it.productId, it.batchNo || null, it.expiryDate || null, it.qty, it.unitCost],
        );
      }
    });
    res.json(await loadPurchase(purchaseId));
  }),
);

purchasesRouter.post(
  '/:id/receive',
  can('purchases.manage'),
  ah(async (req, res) => {
    const purchaseId = id.parse(req.params.id);
    await withConnection(userId(req), (conn) => callProcedure(conn, 'sp_receive_purchase', [purchaseId, userId(req)]));
    res.json(await loadPurchase(purchaseId));
  }),
);

purchasesRouter.post(
  '/:id/cancel',
  can('purchases.manage'),
  ah(async (req, res) => {
    const purchaseId = id.parse(req.params.id);
    const r = await withConnection(userId(req), async (conn) => {
      const [x]: any = await conn.query("UPDATE purchases SET status = 'CANCELLED' WHERE id = ? AND status = 'DRAFT'", [purchaseId]);
      return x.affectedRows;
    });
    if (!r) throw new AppError(400, 'errors.purchaseNotDraft');
    res.json(await loadPurchase(purchaseId));
  }),
);

purchasesRouter.post(
  '/:id/pay',
  can('purchases.manage'),
  ah(async (req, res) => {
    const purchaseId = id.parse(req.params.id);
    const b = z
      .object({ amount: money.refine((v) => v > 0), method: z.enum(['CASH', 'CARD', 'MOBILE', 'BANK']), sessionId: optionalId })
      .parse(req.body);
    await withConnection(userId(req), (conn) =>
      callProcedure(conn, 'sp_pay_supplier', [purchaseId, b.amount, b.method, b.sessionId ?? null, userId(req)]),
    );
    res.json(await loadPurchase(purchaseId));
  }),
);
