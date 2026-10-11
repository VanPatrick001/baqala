import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { execute, query } from '../../core/db.js';
import { ah, AppError } from '../../core/errors.js';
import { can } from '../../core/auth.js';
import { id, lang } from '../../core/http.js';

export const usersRouter = Router();
usersRouter.use(can('users.manage'));

usersRouter.get(
  '/',
  ah(async (_req, res) => {
    res.json(
      await query(
        `SELECT u.id, u.username, u.full_name AS fullName, u.email, u.phone, u.role_id AS roleId, r.code AS role,
                u.preferred_language AS preferredLanguage, u.is_active AS isActive, u.last_login_at AS lastLoginAt
           FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.full_name`,
      ),
    );
  }),
);

const userBody = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  fullName: z.string().min(1).max(120),
  email: z.string().email().nullable().optional().or(z.literal('').transform(() => null)),
  phone: z.string().max(30).nullable().optional(),
  roleId: id,
  preferredLanguage: lang.default('en'),
  isActive: z.boolean().default(true),
  password: z.string().min(8).max(100).optional(),
});

usersRouter.post(
  '/',
  ah(async (req, res) => {
    const b = userBody.parse(req.body);
    if (!b.password) throw new AppError(400, 'errors.passwordRequired');
    const r = await execute(
      `INSERT INTO users (role_id, username, full_name, email, phone, password_hash, preferred_language, is_active, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [b.roleId, b.username, b.fullName, b.email ?? null, b.phone ?? null, await bcrypt.hash(b.password, 10), b.preferredLanguage, b.isActive],
    );
    res.status(201).json({ id: r.insertId });
  }),
);

usersRouter.put(
  '/:id',
  ah(async (req, res) => {
    const userIdParam = id.parse(req.params.id);
    const b = userBody.parse(req.body);
    if (userIdParam === req.user!.id && !b.isActive) throw new AppError(400, 'errors.cannotDisableSelf');
    await execute(
      `UPDATE users SET role_id = ?, username = ?, full_name = ?, email = ?, phone = ?, preferred_language = ?, is_active = ?
        WHERE id = ?`,
      [b.roleId, b.username, b.fullName, b.email ?? null, b.phone ?? null, b.preferredLanguage, b.isActive, userIdParam],
    );
    if (b.password) {
      await execute('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [
        await bcrypt.hash(b.password, 10),
        userIdParam,
      ]);
    }
    res.json({ ok: true });
  }),
);
