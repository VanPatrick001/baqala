import { Router } from 'express';
import { z } from 'zod';
import { callProcedure, execute, query, queryOne, withConnection, withTransaction } from '../../core/db.js';
import { ah, notFound } from '../../core/errors.js';
import { can, hasPermission, userId } from '../../core/auth.js';
import { id, money, optionalId } from '../../core/http.js';

export const customersRouter = Router();

customersRouter.get(
  '/',
  can('customers.view', 'pos.use'),
  ah(async (req, res) => {
    const q = z.object({ search: z.string().trim().optional(), withDebt: z.enum(['true', 'false']).optional() }).parse(req.query);
    const where = ['is_active = 1'];
    const params: unknown[] = [];
    if (q.search) {
      where.push('(full_name LIKE ? OR phone LIKE ? OR code LIKE ?)');
      params.push(`%${q.search}%`, `%${q.search}%`, `%${q.search}%`);
    }
    if (q.withDebt === 'true') where.push('balance > 0');
    res.json(
      await query(
        `SELECT id, code, full_name AS fullName, phone, email, address, credit_limit AS creditLimit, balance,
                loyalty_points AS loyaltyPoints, is_walk_in AS isWalkIn, created_at AS createdAt
           FROM customers WHERE ${where.join(' AND ')} ORDER BY is_walk_in DESC, full_name LIMIT 200`,
        params,
      ),
    );
  }),
);

customersRouter.get(
  '/:id',
  can('customers.view'),
  ah(async (req, res) => {
    const customerId = id.parse(req.params.id);
    const c = await queryOne(
      `SELECT id, code, full_name AS fullName, phone, email, address, credit_limit AS creditLimit, balance,
              loyalty_points AS loyaltyPoints, is_walk_in AS isWalkIn, created_at AS createdAt FROM customers WHERE id = ?`,
      [customerId],
    );
    if (!c) throw notFound('customer');
    const ledger = await query(
      `SELECT l.id, l.entry_type AS type, l.amount, l.balance_after AS balanceAfter, l.sale_id AS saleId, s.receipt_no AS receiptNo,
              l.payment_method AS method, l.notes, u.full_name AS userName, l.created_at AS createdAt
         FROM customer_ledger l LEFT JOIN sales s ON s.id = l.sale_id LEFT JOIN users u ON u.id = l.user_id
        WHERE l.customer_id = ? ORDER BY l.id DESC LIMIT 200`,
      [customerId],
    );
    const stats = await queryOne(
      `SELECT COUNT(*) AS purchases, COALESCE(SUM(total), 0) AS totalSpent, MAX(created_at) AS lastPurchaseAt
         FROM sales WHERE customer_id = ? AND status = 'COMPLETED'`,
      [customerId],
    );
    res.json({ ...c, ledger, stats });
  }),
);

const body = z.object({
  fullName: z.string().min(1).max(150),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().max(150).nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  creditLimit: money.default(0),
});

customersRouter.post(
  '/',
  can('customers.create', 'customers.manage'),
  ah(async (req, res) => {
    const b = body.parse(req.body);
    const newId = await withTransaction(userId(req), async (conn) => {
      const { out } = await callProcedure(conn, 'sp_next_document_number', ['CUSTOMER'], ['no']);
      // Les caissiers ne peuvent pas accorder de crédit
      const limit = hasPermission(req.user, 'customers.manage') ? b.creditLimit : 0;
      const [r]: any = await conn.query(
        'INSERT INTO customers (code, full_name, phone, email, address, credit_limit) VALUES (?, ?, ?, ?, ?, ?)',
        [String(out.no).replace(/-\d{4}-/, '-'), b.fullName, b.phone ?? null, b.email ?? null, b.address ?? null, limit],
      );
      return r.insertId;
    });
    res.status(201).json({ id: newId });
  }),
);

customersRouter.put(
  '/:id',
  can('customers.manage'),
  ah(async (req, res) => {
    const b = body.parse(req.body);
    await execute('UPDATE customers SET full_name = ?, phone = ?, email = ?, address = ?, credit_limit = ? WHERE id = ? AND is_walk_in = 0', [
      b.fullName, b.phone ?? null, b.email ?? null, b.address ?? null, b.creditLimit, id.parse(req.params.id),
    ]);
    res.json({ ok: true });
  }),
);

/** Remboursement d'une dette client. */
customersRouter.post(
  '/:id/repay',
  can('customers.view', 'pos.use'),
  ah(async (req, res) => {
    const customerId = id.parse(req.params.id);
    const b = z
      .object({ amount: money.refine((v) => v > 0), method: z.enum(['CASH', 'CARD', 'MOBILE', 'BANK']), sessionId: optionalId })
      .parse(req.body);
    await withConnection(userId(req), (conn) =>
      callProcedure(conn, 'sp_customer_repayment', [customerId, b.amount, b.method, b.sessionId ?? null, userId(req)]),
    );
    res.json({ ok: true });
  }),
);
