import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../../core/db.js';
import { ah } from '../../core/errors.js';
import { can } from '../../core/auth.js';
import { dateStr, limitOffset, pageQuery } from '../../core/http.js';

export const auditRouter = Router();

auditRouter.get(
  '/',
  can('audit.view'),
  ah(async (req, res) => {
    const q = pageQuery
      .extend({ entityType: z.string().optional(), userId: z.coerce.number().int().optional(), from: dateStr.optional(), to: dateStr.optional() })
      .parse(req.query);
    const where = ['1 = 1'];
    const params: unknown[] = [];
    if (q.entityType) { where.push('a.entity_type = ?'); params.push(q.entityType); }
    if (q.userId) { where.push('a.user_id = ?'); params.push(q.userId); }
    if (q.from) { where.push('a.created_at >= ?'); params.push(q.from); }
    if (q.to) { where.push('a.created_at < ? + INTERVAL 1 DAY'); params.push(q.to); }
    const [limit, offset] = limitOffset(q);
    const rows = await query(
      `SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId, a.old_values AS oldValues,
              a.new_values AS newValues, a.ip_address AS ip, u.full_name AS userName, a.created_at AS createdAt
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const total = await queryOne(`SELECT COUNT(*) AS n FROM audit_logs a WHERE ${where.join(' AND ')}`, params);
    res.json({ rows, total: total?.n ?? 0 });
  }),
);
