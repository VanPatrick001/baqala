import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { execute, query, queryOne } from '../../core/db.js';
import { ah, AppError } from '../../core/errors.js';
import { can, forgetAccess, hasPermission } from '../../core/auth.js';
import { MODULES } from '../../core/modules.js';
import { id, lang } from '../../core/http.js';

/**
 * Utilisateurs.
 * - Administrateur (users.manage) : ajoute, modifie, supprime tous les utilisateurs, leurs rôles et leurs droits.
 * - Manager (users.manage_sellers) : ajoute et gère uniquement les vendeurs.
 */
export const usersRouter = Router();
usersRouter.use(can('users.manage', 'users.manage_sellers'));

const SELLER_ROLE = 'CASHIER';
const isAdmin = (req: Express.Request) => hasPermission(req.user, 'users.manage');

async function roleCode(roleId: number): Promise<string> {
  const r = await queryOne<{ code: string }>('SELECT code FROM roles WHERE id = ?', [roleId]);
  if (!r) throw new AppError(400, 'errors.validation');
  return r.code;
}

async function loadTarget(userIdParam: number) {
  const u = await queryOne<any>(
    `SELECT u.id, u.is_active, r.code AS role FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = ? AND u.deleted_at IS NULL`,
    [userIdParam],
  );
  if (!u) throw new AppError(404, 'errors.notFound');
  return u as { id: number; is_active: number; role: string };
}

/** Il doit toujours rester au moins un administrateur actif. */
async function assertAnotherAdmin(exceptId: number) {
  const r = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id
      WHERE r.code = 'ADMIN' AND u.is_active = 1 AND u.deleted_at IS NULL AND u.id <> ?`,
    [exceptId],
  );
  if (!r || r.n === 0) throw new AppError(400, 'errors.lastAdmin');
}

usersRouter.get(
  '/',
  ah(async (req, res) => {
    const sellersOnly = !isAdmin(req);
    res.json(
      await query(
        `SELECT u.id, u.username, u.full_name AS fullName, u.email, u.phone, u.role_id AS roleId, r.code AS role,
                u.preferred_language AS preferredLanguage, u.is_active AS isActive, u.modules, u.last_login_at AS lastLoginAt
           FROM users u JOIN roles r ON r.id = u.role_id
          WHERE u.deleted_at IS NULL ${sellersOnly ? `AND r.code = '${SELLER_ROLE}'` : ''}
          ORDER BY r.id, u.full_name`,
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
  // null = tous les modules du rôle
  modules: z.array(z.enum(MODULES)).nullable().default(null),
  password: z.string().min(8).max(100).optional(),
});

usersRouter.post(
  '/',
  ah(async (req, res) => {
    const b = userBody.parse(req.body);
    if (!b.password) throw new AppError(400, 'errors.passwordRequired');
    if (!isAdmin(req) && (await roleCode(b.roleId)) !== SELLER_ROLE) throw new AppError(403, 'errors.managerSellersOnly');
    const r = await execute(
      `INSERT INTO users (role_id, username, full_name, email, phone, password_hash, preferred_language, is_active, modules, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [b.roleId, b.username, b.fullName, b.email ?? null, b.phone ?? null, await bcrypt.hash(b.password, 10), b.preferredLanguage, b.isActive,
       b.modules ? JSON.stringify(b.modules) : null],
    );
    res.status(201).json({ id: r.insertId });
  }),
);

usersRouter.put(
  '/:id',
  ah(async (req, res) => {
    const userIdParam = id.parse(req.params.id);
    const b = userBody.parse(req.body);
    const target = await loadTarget(userIdParam);
    const newRole = await roleCode(b.roleId);
    if (!isAdmin(req) && (target.role !== SELLER_ROLE || newRole !== SELLER_ROLE)) throw new AppError(403, 'errors.managerSellersOnly');
    if (userIdParam === req.user!.id && !b.isActive) throw new AppError(400, 'errors.cannotDisableSelf');
    // On ne peut pas se retirer à soi-même la gestion des utilisateurs (sinon plus personne ne peut corriger)
    if (userIdParam === req.user!.id && b.modules && !b.modules.includes('settings')) throw new AppError(400, 'errors.cannotLockSelf');
    if (target.role === 'ADMIN' && (newRole !== 'ADMIN' || !b.isActive)) await assertAnotherAdmin(userIdParam);
    await execute(
      `UPDATE users SET role_id = ?, username = ?, full_name = ?, email = ?, phone = ?, preferred_language = ?, is_active = ?, modules = ?
        WHERE id = ?`,
      [b.roleId, b.username, b.fullName, b.email ?? null, b.phone ?? null, b.preferredLanguage, b.isActive,
       b.modules ? JSON.stringify(b.modules) : null, userIdParam],
    );
    if (b.password) {
      await execute('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [
        await bcrypt.hash(b.password, 10),
        userIdParam,
      ]);
    }
    forgetAccess(userIdParam);
    res.json({ ok: true });
  }),
);

/**
 * Suppression (administrateur uniquement). Les ventes et l'historique gardent le nom de l'utilisateur :
 * le compte est désactivé, masqué et son identifiant libéré.
 */
usersRouter.delete(
  '/:id',
  can('users.manage'),
  ah(async (req, res) => {
    const userIdParam = id.parse(req.params.id);
    if (userIdParam === req.user!.id) throw new AppError(400, 'errors.cannotDeleteSelf');
    const target = await loadTarget(userIdParam);
    if (target.role === 'ADMIN') await assertAnotherAdmin(userIdParam);
    await execute(
      `UPDATE users SET is_active = 0, deleted_at = NOW(), username = CONCAT(LEFT(username, 40), '#del', id), modules = NULL
        WHERE id = ?`,
      [userIdParam],
    );
    forgetAccess(userIdParam);
    res.json({ ok: true });
  }),
);

/** Droits de chaque rôle (l'administrateur garde toujours tous les droits). */
export const rolesRouter = Router();

rolesRouter.get(
  '/',
  can('users.manage', 'users.manage_sellers'),
  ah(async (_req, res) => {
    res.json(await query('SELECT id, code, name, permissions FROM roles ORDER BY id'));
  }),
);

/** Toutes les permissions qu'on peut accorder, regroupées par module (pour l'écran des rôles). */
export const PERMISSIONS = [
  'dashboard.view', 'pos.use',
  'sales.view_own', 'sales.view', 'sales.void_own', 'sales.void', 'sales.override_price',
  'products.view', 'products.manage', 'stock.view', 'stock.manage',
  'purchases.view', 'purchases.manage', 'suppliers.view', 'suppliers.manage',
  'customers.view', 'customers.create', 'customers.manage',
  'cash.session', 'cash.view', 'cash.manage', 'reports.view', 'agent.view', 'agent.manage',
  'taxes.view', 'taxes.manage', 'settings.manage', 'users.manage_sellers', 'audit.view',
] as const;

rolesRouter.get('/permissions', can('roles.manage'), (_req, res) => res.json(PERMISSIONS));

rolesRouter.put(
  '/:id',
  can('roles.manage'),
  ah(async (req, res) => {
    const roleId = id.parse(req.params.id);
    const { permissions } = z.object({ permissions: z.array(z.enum(PERMISSIONS)) }).parse(req.body);
    if ((await roleCode(roleId)) === 'ADMIN') throw new AppError(400, 'errors.adminRoleLocked');
    await execute('UPDATE roles SET permissions = ? WHERE id = ?', [JSON.stringify(permissions), roleId]);
    // Les droits sont relus en base (cache de 15 s) : effet quasi immédiat pour tous les comptes du rôle
    const users = await query<{ id: number }>('SELECT id FROM users WHERE role_id = ?', [roleId]);
    users.forEach((u) => forgetAccess(u.id));
    res.json({ ok: true });
  }),
);
