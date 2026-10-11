import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../core/db.js';
import { ah } from '../../core/errors.js';
import { can, userId } from '../../core/auth.js';

export const settingsRouter = Router();

export async function getSettings(): Promise<Record<string, string | number | boolean>> {
  const rows = await query('SELECT setting_key, setting_value, value_type FROM settings');
  const out: Record<string, string | number | boolean> = {};
  for (const r of rows) {
    out[r.setting_key] =
      r.value_type === 'int' || r.value_type === 'decimal'
        ? Number(r.setting_value)
        : r.value_type === 'bool'
          ? r.setting_value === '1'
          : r.setting_value;
  }
  return out;
}

settingsRouter.get('/', ah(async (_req, res) => res.json(await getSettings())));

settingsRouter.put(
  '/',
  can('settings.manage'),
  ah(async (req, res) => {
    const body = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).parse(req.body);
    await withTransaction(userId(req), async (conn) => {
      for (const [key, value] of Object.entries(body)) {
        const v = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
        await conn.query('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [v, key]);
      }
    });
    res.json(await getSettings());
  }),
);

/** Données de référence pour les formulaires. */
export const metaRouter = Router();
metaRouter.get(
  '/',
  ah(async (_req, res) => {
    const [languages, roles, units, cashCategories, registers] = await Promise.all([
      query('SELECT code, name, native_name AS nativeName, direction FROM languages WHERE is_active = 1 ORDER BY sort_order'),
      query('SELECT id, code, name FROM roles ORDER BY id'),
      query('SELECT id, code, name, allows_decimal AS allowsDecimal FROM units ORDER BY id'),
      query('SELECT id, code, name, direction, is_operating_expense AS isOperatingExpense, is_system AS isSystem FROM cash_categories ORDER BY id'),
      query('SELECT id, code, name FROM cash_registers WHERE is_active = 1 ORDER BY id'),
    ]);
    res.json({ languages, roles, units, cashCategories, registers });
  }),
);
