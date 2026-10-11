import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

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

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token as string | undefined);
  if (!token) return next(new AppError(401, 'errors.unauthorized'));
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthUser;
    req.user = { id: payload.id, username: payload.username, role: payload.role, permissions: payload.permissions };
    next();
  } catch {
    next(new AppError(401, 'errors.sessionExpired'));
  }
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
