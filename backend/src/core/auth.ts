import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errors.js';
import { queryOne } from './db.js';
import { effectivePermissions, parseModules } from './modules.js';

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  permissions: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

/**
 * Droits relus en base (cache 15 s) : un changement de rôle, de modules ou une désactivation
 * s'applique presque immédiatement, sans attendre l'expiration du jeton.
 */
const ACCESS_TTL_MS = 15_000;
const accessCache = new Map<number, { at: number; user: AuthUser | null }>();

export async function loadAccess(id: number): Promise<AuthUser | null> {
  const hit = accessCache.get(id);
  if (hit && Date.now() - hit.at < ACCESS_TTL_MS) return hit.user;
  const u = await queryOne<any>(
    `SELECT u.id, u.username, u.is_active, u.modules, r.code AS role, r.permissions
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [id],
  );
  const user: AuthUser | null =
    u && u.is_active
      ? { id: u.id, username: u.username, role: u.role, permissions: effectivePermissions(u.permissions, parseModules(u.modules)) }
      : null;
  accessCache.set(id, { at: Date.now(), user });
  return user;
}

export const forgetAccess = (id: number) => accessCache.delete(id);

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token as string | undefined);
  if (!token) return next(new AppError(401, 'errors.unauthorized'));
  let payload: AuthUser;
  try {
    payload = jwt.verify(token, env.jwtSecret) as AuthUser;
  } catch {
    return next(new AppError(401, 'errors.sessionExpired'));
  }
  loadAccess(payload.id)
    .then((user) => {
      if (!user) return next(new AppError(401, 'errors.unauthorized'));
      req.user = user;
      next();
    })
    .catch(next);
};

/** Vérifie une permission ; '*' = tout, 'products.*' = tout le domaine produits. */
export function hasPermission(user: AuthUser | undefined, permission: string): boolean {
  if (!user) return false;
  const [domain] = permission.split('.');
  return user.permissions.some((p) => p === '*' || p === permission || p === `${domain}.*`);
}

export const can =
  (...permissions: string[]): RequestHandler =>
  (req, _res, next) => {
    if (permissions.some((p) => hasPermission(req.user, p))) return next();
    next(new AppError(403, 'errors.forbidden'));
  };

export const userId = (req: Express.Request): number => req.user!.id;
