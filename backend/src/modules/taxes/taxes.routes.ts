import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction, type Conn } from '../../core/db.js';
import { ah } from '../../core/errors.js';
import { can, userId } from '../../core/auth.js';
import { id, translations } from '../../core/http.js';

export const taxesRouter = Router();

taxesRouter.get(
  '/',
  ah(async (_req, res) => {
    res.json(
      await query(
        `SELECT t.id, t.code, t.name, t.tax_type AS type, t.rate, t.applies_to AS appliesTo, t.is_active AS isActive,
                (SELECT JSON_OBJECTAGG(tt.language_code, tt.name) FROM tax_translations tt WHERE tt.tax_id = t.id) AS translations,
                (SELECT COUNT(*) FROM product_taxes pt WHERE pt.tax_id = t.id) AS productCount
           FROM taxes t ORDER BY t.code`,
      ),
    );
  }),
);

const body = z.object({
  code: z.string().min(1).max(30).transform((s) => s.toUpperCase()),
  name: z.string().min(1).max(80),
  type: z.enum(['PERCENT', 'FIXED']),
  rate: z.coerce.number().min(0).max(1000),
  appliesTo: z.enum(['SALES', 'PURCHASES', 'BOTH']),
  isActive: z.boolean().default(true),
  translations,
});

async function saveTr(conn: Conn, taxId: number, tr: Record<string, string | undefined>) {
  await conn.query('DELETE FROM tax_translations WHERE tax_id = ?', [taxId]);
  for (const [lng, v] of Object.entries(tr)) {
    if (v && v.trim() && lng !== 'en') {
      await conn.query('INSERT INTO tax_translations (tax_id, language_code, name) VALUES (?, ?, ?)', [taxId, lng, v.trim()]);
    }
  }
}

taxesRouter.post(
  '/',
  can('taxes.manage'),
  ah(async (req, res) => {
    const b = body.parse(req.body);
    const newId = await withTransaction(userId(req), async (conn) => {
      const [r]: any = await conn.query(
        'INSERT INTO taxes (code, name, tax_type, rate, applies_to, is_active) VALUES (?, ?, ?, ?, ?, ?)',
        [b.code, b.name, b.type, b.rate, b.appliesTo, b.isActive],
      );
      await saveTr(conn, r.insertId, b.translations);
      return r.insertId;
    });
    res.status(201).json({ id: newId });
  }),
);

/** Modifier un taux n'affecte pas l'historique : les taxes sont figées sur chaque ligne de vente/achat. */
taxesRouter.put(
  '/:id',
  can('taxes.manage'),
  ah(async (req, res) => {
    const taxId = id.parse(req.params.id);
    const b = body.parse(req.body);
    await withTransaction(userId(req), async (conn) => {
      await conn.query('UPDATE taxes SET code = ?, name = ?, tax_type = ?, rate = ?, applies_to = ?, is_active = ? WHERE id = ?', [
        b.code, b.name, b.type, b.rate, b.appliesTo, b.isActive, taxId,
      ]);
      await saveTr(conn, taxId, b.translations);
    });
    res.json({ ok: true });
  }),
);
