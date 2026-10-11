import { Router } from 'express';
import { z } from 'zod';
import { execute, query, withTransaction, type Conn } from '../../core/db.js';
import { ah } from '../../core/errors.js';
import { can, userId } from '../../core/auth.js';
import { id, optionalId, translations } from '../../core/http.js';

export const categoriesRouter = Router();

categoriesRouter.get(
  '/',
  ah(async (_req, res) => {
    res.json(
      await query(
        `SELECT c.id, c.parent_id AS parentId, c.code, c.name, c.sort_order AS sortOrder, c.is_active AS isActive,
                (SELECT JSON_OBJECTAGG(t.language_code, t.name) FROM category_translations t WHERE t.category_id = c.id) AS translations,
                (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.deleted_at IS NULL) AS productCount
           FROM categories c ORDER BY c.sort_order, c.name`,
      ),
    );
  }),
);

const body = z.object({
  code: z.string().min(1).max(40).transform((s) => s.toUpperCase()),
  name: z.string().min(1).max(120),
  parentId: optionalId,
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
  translations,
});

async function saveTranslations(conn: Conn, categoryId: number, name: string, tr: Record<string, string | undefined>) {
  await conn.query('DELETE FROM category_translations WHERE category_id = ?', [categoryId]);
  const rows = Object.entries({ en: name, ...tr }).filter(([, v]) => v && v.trim());
  for (const [lng, value] of rows) {
    await conn.query('INSERT INTO category_translations (category_id, language_code, name) VALUES (?, ?, ?)', [categoryId, lng, value]);
  }
}

categoriesRouter.post(
  '/',
  can('products.manage'),
  ah(async (req, res) => {
    const b = body.parse(req.body);
    const newId = await withTransaction(userId(req), async (conn) => {
      const [r]: any = await conn.query(
        'INSERT INTO categories (code, name, parent_id, sort_order, is_active) VALUES (?, ?, ?, ?, ?)',
        [b.code, b.name, b.parentId ?? null, b.sortOrder, b.isActive],
      );
      await saveTranslations(conn, r.insertId, b.name, b.translations);
      return r.insertId as number;
    });
    res.status(201).json({ id: newId });
  }),
);

categoriesRouter.put(
  '/:id',
  can('products.manage'),
  ah(async (req, res) => {
    const catId = id.parse(req.params.id);
    const b = body.parse(req.body);
    await withTransaction(userId(req), async (conn) => {
      await conn.query('UPDATE categories SET code = ?, name = ?, parent_id = ?, sort_order = ?, is_active = ? WHERE id = ?', [
        b.code, b.name, b.parentId ?? null, b.sortOrder, b.isActive, catId,
      ]);
      await saveTranslations(conn, catId, b.name, b.translations);
    });
    res.json({ ok: true });
  }),
);

categoriesRouter.delete(
  '/:id',
  can('products.manage'),
  ah(async (req, res) => {
    // Les produits de la catégorie passent à "sans catégorie" (ON DELETE SET NULL)
    await execute('DELETE FROM categories WHERE id = ?', [id.parse(req.params.id)]);
    res.json({ ok: true });
  }),
);
