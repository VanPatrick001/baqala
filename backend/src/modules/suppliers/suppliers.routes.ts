import { Router } from 'express';
import { z } from 'zod';
import { execute, query } from '../../core/db.js';
import { ah } from '../../core/errors.js';
import { can } from '../../core/auth.js';
import { id } from '../../core/http.js';

export const suppliersRouter = Router();

suppliersRouter.get(
  '/',
  can('suppliers.view', 'purchases.view', 'products.view'),
  ah(async (req, res) => {
    const search = typeof req.query.search === 'string' ? `%${req.query.search}%` : '%';
    res.json(
      await query(
        `SELECT id, name, contact_name AS contactName, phone, email, address, tax_number AS taxNumber,
                lead_time_days AS leadTimeDays, balance, is_active AS isActive
           FROM suppliers WHERE name LIKE ? ORDER BY name`,
        [search],
      ),
    );
  }),
);

const body = z.object({
  name: z.string().min(1).max(150),
  contactName: z.string().max(120).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().max(150).nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  taxNumber: z.string().max(50).nullable().optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).default(3),
  isActive: z.boolean().default(true),
});

const values = (b: z.infer<typeof body>) => [
  b.name, b.contactName ?? null, b.phone ?? null, b.email ?? null, b.address ?? null, b.taxNumber ?? null, b.leadTimeDays, b.isActive,
];

suppliersRouter.post(
  '/',
  can('suppliers.manage'),
  ah(async (req, res) => {
    const r = await execute(
      `INSERT INTO suppliers (name, contact_name, phone, email, address, tax_number, lead_time_days, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      values(body.parse(req.body)),
    );
    res.status(201).json({ id: r.insertId });
  }),
);

suppliersRouter.put(
  '/:id',
  can('suppliers.manage'),
  ah(async (req, res) => {
    await execute(
      `UPDATE suppliers SET name = ?, contact_name = ?, phone = ?, email = ?, address = ?, tax_number = ?,
              lead_time_days = ?, is_active = ? WHERE id = ?`,
      [...values(body.parse(req.body)), id.parse(req.params.id)],
    );
    res.json({ ok: true });
  }),
);
