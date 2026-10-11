import { query, queryOne, type Conn } from '../../core/db.js';

/** Colonnes communes de lecture produit (prix promo actif et taxes inclus). */
const PRODUCT_SELECT = `
  SELECT p.id, p.sku, p.barcode, p.name, p.category_id AS categoryId, c.name AS categoryName,
         p.unit_id AS unitId, u.code AS unitCode, u.allows_decimal AS allowsDecimal,
         p.default_supplier_id AS supplierId, s.name AS supplierName,
         p.purchase_price AS purchasePrice, p.avg_cost AS avgCost, p.sale_price AS salePrice,
         p.stock_qty AS stockQty, p.min_stock AS minStock, p.reorder_qty AS reorderQty,
         p.track_expiry AS trackExpiry, p.is_weighed AS isWeighed, p.is_active AS isActive,
         p.image_url AS imageUrl, p.created_at AS createdAt, p.updated_at AS updatedAt,
         CASE WHEN p.stock_qty <= 0 THEN 'OUT' WHEN p.stock_qty <= p.min_stock THEN 'LOW' ELSE 'OK' END AS stockStatus,
         (SELECT MIN(b.expiry_date) FROM product_batches b WHERE b.product_id = p.id AND b.qty_remaining > 0) AS nextExpiry,
         (SELECT JSON_OBJECTAGG(t.language_code, t.name) FROM product_translations t WHERE t.product_id = p.id) AS translations,
         (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', tx.id, 'code', tx.code, 'type', tx.tax_type, 'rate', tx.rate, 'appliesTo', tx.applies_to))
            FROM product_taxes pt JOIN taxes tx ON tx.id = pt.tax_id AND tx.is_active = 1 WHERE pt.product_id = p.id) AS taxes,
         (SELECT JSON_OBJECT('id', pr.id, 'type', pr.discount_type, 'value', pr.discount_value, 'endsAt', pr.ends_at)
            FROM promotions pr WHERE pr.product_id = p.id AND pr.is_active = 1 AND NOW() BETWEEN pr.starts_at AND pr.ends_at
           ORDER BY pr.discount_value DESC LIMIT 1) AS promotion
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    JOIN units u ON u.id = p.unit_id
    LEFT JOIN suppliers s ON s.id = p.default_supplier_id`;

export interface ProductFilter {
  search?: string;
  categoryId?: number;
  status?: 'LOW' | 'OUT' | 'OK' | 'ALERT';
  active?: boolean;
  limit: number;
  offset: number;
}

export async function findProducts(f: ProductFilter) {
  const where: string[] = ['p.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (f.search) {
    where.push(`(p.name LIKE ? OR p.sku LIKE ? OR p.barcode = ?
                 OR EXISTS (SELECT 1 FROM product_translations t WHERE t.product_id = p.id AND t.name LIKE ?))`);
    params.push(`%${f.search}%`, `%${f.search}%`, f.search, `%${f.search}%`);
  }
  if (f.categoryId) {
    where.push('p.category_id = ?');
    params.push(f.categoryId);
  }
  if (f.active !== undefined) {
    where.push('p.is_active = ?');
    params.push(f.active);
  }
  if (f.status === 'OUT') where.push('p.stock_qty <= 0');
  if (f.status === 'LOW') where.push('p.stock_qty > 0 AND p.stock_qty <= p.min_stock');
  if (f.status === 'ALERT') where.push('p.stock_qty <= p.min_stock');
  if (f.status === 'OK') where.push('p.stock_qty > p.min_stock');
  const whereSql = where.join(' AND ');
  const rows = await query(`${PRODUCT_SELECT} WHERE ${whereSql} ORDER BY p.name LIMIT ? OFFSET ?`, [...params, f.limit, f.offset]);
  const total = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM products p WHERE ${whereSql}`, params);
  return { rows, total: total?.n ?? 0 };
}

export async function findProductById(id: number) {
  return queryOne(`${PRODUCT_SELECT} WHERE p.id = ? AND p.deleted_at IS NULL`, [id]);
}

/** Recherche exacte par code-barres ou SKU (lecteur code-barres en caisse). */
export async function findProductByCode(code: string) {
  return queryOne(`${PRODUCT_SELECT} WHERE (p.barcode = ? OR p.sku = ?) AND p.deleted_at IS NULL AND p.is_active = 1`, [code, code]);
}

export async function findBatches(productId: number) {
  return query(
    `SELECT id, batch_no AS batchNo, expiry_date AS expiryDate, unit_cost AS unitCost,
            qty_received AS qtyReceived, qty_remaining AS qtyRemaining, received_at AS receivedAt,
            DATEDIFF(expiry_date, CURDATE()) AS daysLeft
       FROM product_batches WHERE product_id = ? AND qty_remaining > 0
      ORDER BY (expiry_date IS NULL), expiry_date, received_at`,
    [productId],
  );
}

export interface ProductInput {
  sku: string;
  barcode?: string | null;
  name: string;
  categoryId?: number | null;
  unitId: number;
  supplierId?: number | null;
  purchasePrice: number;
  salePrice: number;
  minStock: number;
  reorderQty: number;
  trackExpiry: boolean;
  isWeighed: boolean;
  isActive: boolean;
  taxIds: number[];
  translations: Record<string, string | undefined>;
}

export async function insertProduct(conn: Conn, p: ProductInput): Promise<number> {
  const [r]: any = await conn.query(
    `INSERT INTO products (sku, barcode, name, category_id, unit_id, default_supplier_id, purchase_price, avg_cost,
                           sale_price, min_stock, reorder_qty, track_expiry, is_weighed, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.sku, p.barcode || null, p.name, p.categoryId ?? null, p.unitId, p.supplierId ?? null, p.purchasePrice,
     p.purchasePrice, p.salePrice, p.minStock, p.reorderQty, p.trackExpiry, p.isWeighed, p.isActive],
  );
  await saveRelations(conn, r.insertId, p);
  return r.insertId;
}

export async function updateProduct(conn: Conn, id: number, p: ProductInput) {
  await conn.query(
    `UPDATE products SET sku = ?, barcode = ?, name = ?, category_id = ?, unit_id = ?, default_supplier_id = ?,
            purchase_price = ?, sale_price = ?, min_stock = ?, reorder_qty = ?, track_expiry = ?, is_weighed = ?, is_active = ?
      WHERE id = ? AND deleted_at IS NULL`,
    [p.sku, p.barcode || null, p.name, p.categoryId ?? null, p.unitId, p.supplierId ?? null, p.purchasePrice,
     p.salePrice, p.minStock, p.reorderQty, p.trackExpiry, p.isWeighed, p.isActive, id],
  );
  await saveRelations(conn, id, p);
}

async function saveRelations(conn: Conn, id: number, p: ProductInput) {
  await conn.query('DELETE FROM product_taxes WHERE product_id = ?', [id]);
  for (const taxId of new Set(p.taxIds)) {
    await conn.query('INSERT INTO product_taxes (product_id, tax_id) VALUES (?, ?)', [id, taxId]);
  }
  await conn.query('DELETE FROM product_translations WHERE product_id = ?', [id]);
  for (const [lng, value] of Object.entries({ en: p.name, ...p.translations })) {
    if (value && value.trim()) {
      await conn.query('INSERT INTO product_translations (product_id, language_code, name) VALUES (?, ?, ?)', [id, lng, value.trim()]);
    }
  }
}
