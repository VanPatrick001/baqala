import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { execute, queryOne } from '../../core/db.js';
import { ah, AppError } from '../../core/errors.js';
import { requireAuth, signToken, userId, type AuthUser } from '../../core/auth.js';
import { lang } from '../../core/http.js';

export const authRouter = Router();

async function loadUser(where: string, param: unknown) {
  return queryOne(
    `SELECT u.id, u.username, u.full_name, u.email, u.password_hash, u.preferred_language,
            u.must_change_password, u.is_active, r.code AS role, r.permissions
       FROM users u JOIN roles r ON r.id = u.role_id WHERE ${where}`,
    [param],
  );
}

function publicUser(u: any) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    email: u.email,
    role: u.role,
    permissions: u.permissions,
    preferredLanguage: u.preferred_language,
    mustChangePassword: !!u.must_change_password,
  };
}

authRouter.post(
  '/login',
  ah(async (req, res) => {
    const { username, password } = z.object({ username: z.string().min(1), password: z.string().min(1) }).parse(req.body);
    const u = await loadUser('u.username = ?', username);
    if (!u || !u.is_active || !(await bcrypt.compare(password, u.password_hash))) {
      throw new AppError(401, 'errors.invalidCredentials');
    }
    await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [u.id]);
    await execute(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, user_agent)
       VALUES (?, 'LOGIN', 'user', ?, ?, ?)`,
      [u.id, u.id, req.ip, String(req.headers['user-agent'] ?? '').slice(0, 255)],
    );
    const authUser: AuthUser = { id: u.id, username: u.username, role: u.role, permissions: u.permissions };
    res.json({ token: signToken(authUser), user: publicUser(u) });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const u = await loadUser('u.id = ?', userId(req));
    if (!u || !u.is_active) throw new AppError(401, 'errors.unauthorized');
    res.json(publicUser(u));
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  ah(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string(), newPassword: z.string().min(8).max(100) })
      .parse(req.body);
    const u = await loadUser('u.id = ?', userId(req));
    if (!u || !(await bcrypt.compare(currentPassword, u.password_hash))) {
      throw new AppError(400, 'errors.invalidCurrentPassword');
    }
    await execute('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [
      await bcrypt.hash(newPassword, 10),
      u.id,
    ]);
    res.json({ ok: true });
  }),
);

/** Mémorise la langue choisie : elle est restaurée à la prochaine connexion. */
authRouter.patch(
  '/me/language',
  requireAuth,
  ah(async (req, res) => {
    const { language } = z.object({ language: lang }).parse(req.body);
    await execute('UPDATE users SET preferred_language = ? WHERE id = ?', [language, userId(req)]);
    res.json({ ok: true });
  }),
);
