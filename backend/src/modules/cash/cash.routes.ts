import { Router } from 'express';
import { z } from 'zod';
import { callProcedure, query, queryOne, withConnection } from '../../core/db.js';
import { ah, notFound } from '../../core/errors.js';
import { can, userId } from '../../core/auth.js';
import { dateStr, id, limitOffset, money, optionalId, pageQuery } from '../../core/http.js';
import { runAgentSafely } from '../agent/agent.engine.js';

export const cashRouter = Router();

/** Résumé d'une session : attendu, ventes par mode de paiement, mouvements. */
export async function sessionReport(sessionId: number) {
  const session = await queryOne(
    `SELECT cs.id, cs.register_id AS registerId, r.name AS registerName, cs.status, cs.opening_float AS openingFloat,
            cs.expected_cash AS expectedCash, cs.counted_cash AS countedCash, cs.difference, cs.notes,
            cs.opened_at AS openedAt, cs.closed_at AS closedAt, uo.full_name AS openedBy, uc.full_name AS closedBy,
            fn_session_expected_cash(cs.id) AS currentExpectedCash
       FROM cash_sessions cs JOIN cash_registers r ON r.id = cs.register_id
       JOIN users uo ON uo.id = cs.opened_by LEFT JOIN users uc ON uc.id = cs.closed_by
      WHERE cs.id = ?`,
    [sessionId],
  );
  if (!session) throw notFound('session');
  const sales = await queryOne(
    `SELECT COUNT(*) AS tickets, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(tax_total), 0) AS taxTotal,
            COALESCE(SUM(change_due), 0) AS changeGiven,
            (SELECT COUNT(*) FROM sales WHERE session_id = ? AND status = 'VOIDED') AS voided
       FROM sales WHERE session_id = ? AND status = 'COMPLETED'`,
    [sessionId, sessionId],
  );
  const payments = await query(
    `SELECT sp.method, SUM(sp.amount) AS amount FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
      WHERE s.session_id = ? AND s.status = 'COMPLETED' GROUP BY sp.method`,
    [sessionId],
  );
  // Espèces : on retire le rendu monnaie pour obtenir l'encaissé réel
  for (const p of payments) if (p.method === 'CASH') p.amount = Math.round((p.amount - sales!.changeGiven) * 100) / 100;
  const movements = await query(
    `SELECT cc.code AS category, cm.direction, cm.payment_method AS method, SUM(cm.amount) AS amount, COUNT(*) AS count
       FROM cash_movements cm JOIN cash_categories cc ON cc.id = cm.category_id
      WHERE cm.session_id = ? GROUP BY cc.code, cm.direction, cm.payment_method ORDER BY cc.code`,
    [sessionId],
  );
  return { ...session, sales, payments, movements };
}

cashRouter.get(
  '/sessions/current',
  can('cash.session', 'pos.use', 'cash.view'),
  ah(async (req, res) => {
    const registerId = z.coerce.number().int().default(1).parse(req.query.registerId);
    const s = await queryOne("SELECT id FROM cash_sessions WHERE register_id = ? AND status = 'OPEN'", [registerId]);
    res.json(s ? await sessionReport(s.id) : null);
  }),
);

cashRouter.get(
  '/sessions',
  can('cash.view'),
  ah(async (req, res) => {
    const q = pageQuery.parse(req.query);
    const [limit, offset] = limitOffset(q);
    res.json(
      await query(
        `SELECT cs.id, r.name AS registerName, cs.status, cs.opening_float AS openingFloat, cs.expected_cash AS expectedCash,
                cs.counted_cash AS countedCash, cs.difference, cs.opened_at AS openedAt, cs.closed_at AS closedAt,
                uo.full_name AS openedBy, uc.full_name AS closedBy,
                (SELECT COALESCE(SUM(total), 0) FROM sales s WHERE s.session_id = cs.id AND s.status = 'COMPLETED') AS salesTotal,
                (SELECT COUNT(*) FROM sales s WHERE s.session_id = cs.id AND s.status = 'COMPLETED') AS tickets
           FROM cash_sessions cs JOIN cash_registers r ON r.id = cs.register_id
           JOIN users uo ON uo.id = cs.opened_by LEFT JOIN users uc ON uc.id = cs.closed_by
          ORDER BY cs.id DESC LIMIT ? OFFSET ?`,
        [limit, offset],
      ),
    );
  }),
);

cashRouter.get('/sessions/:id', can('cash.view', 'cash.session'), ah(async (req, res) => res.json(await sessionReport(id.parse(req.params.id)))));

cashRouter.post(
  '/sessions/open',
  can('cash.session', 'pos.use'),
  ah(async (req, res) => {
    const b = z.object({ registerId: id.default(1), openingFloat: money.default(0) }).parse(req.body);
    const { out } = await withConnection(userId(req), (conn) =>
      callProcedure(conn, 'sp_open_cash_session', [b.registerId, userId(req), b.openingFloat], ['session']),
    );
    res.status(201).json(await sessionReport(out.session));
  }),
);

cashRouter.post(
  '/sessions/:id/close',
  can('cash.session', 'pos.use'),
  ah(async (req, res) => {
    const sessionId = id.parse(req.params.id);
    const b = z.object({ countedCash: money, notes: z.string().max(500).nullable().optional() }).parse(req.body);
    await withConnection(userId(req), (conn) =>
      callProcedure(conn, 'sp_close_cash_session', [sessionId, b.countedCash, userId(req), b.notes ?? null]),
    );
    // Le Smart Agent analyse la journée dès la clôture
    void runAgentSafely('session-close');
    res.json(await sessionReport(sessionId));
  }),
);

cashRouter.get(
  '/movements',
  can('cash.view'),
  ah(async (req, res) => {
    const q = pageQuery
      .extend({ from: dateStr.optional(), to: dateStr.optional(), sessionId: z.coerce.number().int().optional(), direction: z.enum(['IN', 'OUT']).optional() })
      .parse(req.query);
    const where = ['1 = 1'];
    const params: unknown[] = [];
    if (q.sessionId) { where.push('cm.session_id = ?'); params.push(q.sessionId); }
    if (q.direction) { where.push('cm.direction = ?'); params.push(q.direction); }
    if (q.from) { where.push('cm.occurred_at >= ?'); params.push(q.from); }
    if (q.to) { where.push('cm.occurred_at < ? + INTERVAL 1 DAY'); params.push(q.to); }
    const [limit, offset] = limitOffset(q);
    const rows = await query(
      `SELECT cm.id, cm.session_id AS sessionId, cc.code AS category, cm.direction, cm.payment_method AS method,
              cm.amount, cm.tax_amount AS taxAmount, cm.reference_type AS referenceType, cm.reference_id AS referenceId,
              cm.description, u.full_name AS userName, cm.occurred_at AS occurredAt
         FROM cash_movements cm JOIN cash_categories cc ON cc.id = cm.category_id LEFT JOIN users u ON u.id = cm.user_id
        WHERE ${where.join(' AND ')} ORDER BY cm.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const totals = await queryOne(
      `SELECT COUNT(*) AS n, COALESCE(SUM(IF(direction = 'IN', amount, 0)), 0) AS totalIn,
              COALESCE(SUM(IF(direction = 'OUT', amount, 0)), 0) AS totalOut
         FROM cash_movements cm WHERE ${where.join(' AND ')}`,
      params,
    );
    res.json({ rows, total: totals?.n ?? 0, totalIn: totals?.totalIn ?? 0, totalOut: totals?.totalOut ?? 0 });
  }),
);

/** Dépense ou entrée manuelle (loyer, salaires, électricité, apport...). */
cashRouter.post(
  '/movements',
  // Comptabilité : manager et administrateur uniquement (un vendeur ne peut rien y saisir)
  can('cash.manage'),
  ah(async (req, res) => {
    const b = z
      .object({
        sessionId: optionalId,
        categoryCode: z.string().min(1).max(30),
        direction: z.enum(['IN', 'OUT']),
        method: z.enum(['CASH', 'CARD', 'MOBILE', 'BANK']),
        amount: money.refine((v) => v > 0),
        taxId: optionalId,
        description: z.string().max(255).nullable().optional(),
      })
      .parse(req.body);
    const { out } = await withConnection(userId(req), (conn) =>
      callProcedure(
        conn,
        'sp_record_cash_movement',
        [b.sessionId ?? null, b.categoryCode, b.direction, b.method, b.amount, b.taxId ?? null, b.description ?? null, userId(req)],
        ['movement'],
      ),
    );
    res.status(201).json({ id: out.movement });
  }),
);
