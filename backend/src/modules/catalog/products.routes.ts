import { Router } from 'express';
import { z } from 'zod';
import { callProcedure, withTransaction } from '../../core/db.js';
import { ah, notFound } from '../../core/errors.js';
import { can, userId } from '../../core/auth.js';
import { dateStr, id, limitOffset, money, optionalId, pageQuery, translations } from '../../core/http.js';
import * as repo from './products.repository.js';

export const productsRouter = Router();

productsRouter.get(
  '/',
  can('products.view', 'pos.use'),
  ah(async (req, res) => {
    const q = pageQuery
      .extend({
        search: z.string().trim().optional(),
        categoryId: z.coerce.number().int().optional(),
        status: z.enum(['LOW', 'OUT', 'OK', 'ALERT']).optional(),
        active: z.enum(['true', 'false']).optional(),
      })
      .parse(req.query);
    const [limit, offset] = limitOffset(q);
    res.json(
      await repo.findProducts({
        search: q.search || undefined,
        categoryId: q.categoryId,
        status: q.status,
        active: q.active === undefined ? undefined : q.active === 'true',
        limit,
        offset,
      }),
    );
  }),
);

productsRouter.get(
  '/lookup',
  can('products.view', 'pos.use'),
  ah(async (req, res) => {
    const code = z.string().trim().min(1).parse(req.query.code);
    const product = await repo.findProductByCode(code);
    if (!product) throw notFound('product');
    res.json(product);
  }),
);

productsRouter.get(
  '/:id',
  can('products.view', 'pos.use'),
  ah(async (req, res) => {
    const productId = id.parse(req.params.id);
    const product = await repo.findProductById(productId);
    if (!product) throw notFound('product');
    res.json({ ...product, batches: await repo.findBatches(productId) });
  }),
);

const productBody = z.object({
  sku: z.string().trim().min(1).max(50),
  barcode: z.string().trim().max(64).nullable().optional(),
  name: z.string().trim().min(1).max(150),
  categoryId: optionalId,
  unitId: id,
  supplierId: optionalId,
  purchasePrice: money.default(0),
  salePrice: money,
  minStock: z.coerce.number().min(0).default(0),
  reorderQty: z.coerce.number().min(0).default(0),
  trackExpiry: z.boolean().default(false),
  isWeighed: z.boolean().default(false),
  isActive: z.boolean().default(true),
  taxIds: z.array(id).default([]),
  translations,
  // Stock initial (création uniquement)
  initialStock: z.coerce.number().min(0).optional(),
  initialExpiry: dateStr.nullable().optional(),
  initialBatchNo: z.string().max(50).nullable().optional(),
});

productsRouter.post(
  '/',
  can('products.manage'),
  ah(async (req, res) => {
    const b = productBody.parse(req.body);
    const newId = await withTransaction(userId(req), async (conn) => {
      const productId = await repo.insertProduct(conn, b);
      if (b.initialStock && b.initialStock > 0) {
        await callProcedure(conn, 'sp_stock_in', [
          productId, b.initialStock, b.purchasePrice, b.initialBatchNo ?? null, b.initialExpiry ?? null,
          'OPENING', 'product', productId, 'Initial stock', userId(req),
        ], ['batch']);
      }
      return productId;
    });
    res.status(201).json(await repo.findProductById(newId));
  }),
);

productsRouter.put(
  '/:id',
  can('products.manage'),
  ah(async (req, res) => {
    const productId = id.parse(req.params.id);
    const b = productBody.parse(req.body);
    await withTransaction(userId(req), (conn) => repo.updateProduct(conn, productId, b));
    const product = await repo.findProductById(productId);
    if (!product) throw notFound('product');
    res.json(product);
  }),
);

/** Suppression logique : l'historique des ventes reste intact. */
productsRouter.delete(
  '/:id',
  can('products.manage'),
  ah(async (req, res) => {
    const productId = id.parse(req.params.id);
    // Libère le code-barres et le SKU pour une réutilisation éventuelle
    const r = await withTransaction(userId(req), async (conn) => {
      const [x]: any = await conn.query(
        `UPDATE products SET deleted_at = NOW(), is_active = 0,
                sku = CONCAT(sku, '#del', id), barcode = IF(barcode IS NULL, NULL, CONCAT(barcode, '#del', id))
          WHERE id = ? AND deleted_at IS NULL`,
        [productId],
      );
      return x.affectedRows;
    });
    if (!r) throw notFound('product');
    res.json({ ok: true });
  }),
);
