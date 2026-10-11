import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

/**
 * Erreur métier. `code` est une clé i18n (ex. 'errors.insufficientStock')
 * que le front traduit dans la langue active.
 */
export class AppError extends Error {
  constructor(public status: number, public code: string, public details?: unknown) {
    super(code);
  }
}

export const notFound = (what = 'resource') => new AppError(404, 'errors.notFound', { what });

/** Enveloppe un handler async pour transmettre les erreurs à Express. */
export const ah =
  (fn: (...args: Parameters<RequestHandler>) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

const MYSQL_ERRORS: Record<string, [number, string]> = {
  ER_DUP_ENTRY: [409, 'errors.duplicate'],
  ER_ROW_IS_REFERENCED_2: [409, 'errors.inUse'],
  ER_NO_REFERENCED_ROW_2: [400, 'errors.invalidReference'],
  ER_CHECK_CONSTRAINT_VIOLATED: [400, 'errors.invalidValue'],
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'errors.validation',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  // SIGNAL SQLSTATE '45000' levé par les procédures : le message EST la clé i18n.
  if (err?.sqlState === '45000') {
    return res.status(400).json({ error: err.sqlMessage });
  }
  if (err?.code && MYSQL_ERRORS[err.code]) {
    const [status, code] = MYSQL_ERRORS[err.code];
    return res.status(status).json({ error: code, details: err.sqlMessage });
  }
  console.error(err);
  return res.status(500).json({ error: 'errors.server' });
};
