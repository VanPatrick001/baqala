import { z } from 'zod';

/** Pagination standard : ?page=1&pageSize=50 */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export function limitOffset(q: { page: number; pageSize: number }): [number, number] {
  return [q.pageSize, (q.page - 1) * q.pageSize];
}

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
export const money = z.coerce.number().min(0).max(1e12);
export const qty = z.coerce.number().positive().max(1e9);
export const id = z.coerce.number().int().positive();
export const optionalId = z.coerce.number().int().positive().nullable().optional();
export const lang = z.enum(['en', 'ur', 'ar']);
export const translations = z
  .object({ en: z.string().max(150).optional(), ur: z.string().max(150).optional(), ar: z.string().max(150).optional() })
  .partial()
  .default({});

/** Période par défaut : 30 derniers jours. */
export const periodQuery = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
});

export function resolvePeriod(q: { from?: string; to?: string }): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const to = q.to ?? fmt(today);
  const from = q.from ?? fmt(new Date(today.getTime() - 29 * 86400000));
  return { from, to };
}
