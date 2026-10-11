import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { requireAuth } from './core/auth.js';
import { errorHandler } from './core/errors.js';
import { pool } from './core/db.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { metaRouter, settingsRouter } from './modules/settings/settings.routes.js';
import { categoriesRouter } from './modules/catalog/categories.routes.js';
import { productsRouter } from './modules/catalog/products.routes.js';
import { taxesRouter } from './modules/taxes/taxes.routes.js';
import { suppliersRouter } from './modules/suppliers/suppliers.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { purchasesRouter } from './modules/purchases/purchases.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { cashRouter } from './modules/cash/cash.routes.js';
import { posRouter, salesRouter } from './modules/pos/pos.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { agentRouter } from './modules/agent/agent.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.corsOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  app.use('/api/auth', authRouter);

  const api = express.Router();
  api.use(requireAuth);
  api.use('/meta', metaRouter);
  api.use('/settings', settingsRouter);
  api.use('/users', usersRouter);
  api.use('/categories', categoriesRouter);
  api.use('/products', productsRouter);
  api.use('/taxes', taxesRouter);
  api.use('/suppliers', suppliersRouter);
  api.use('/inventory', inventoryRouter);
  api.use('/purchases', purchasesRouter);
  api.use('/customers', customersRouter);
  api.use('/cash', cashRouter);
  api.use('/pos', posRouter);
  api.use('/sales', salesRouter);
  api.use('/reports', reportsRouter);
  api.use('/agent', agentRouter);
  api.use('/audit', auditRouter);
  app.use('/api', api);

  // En production, l'API sert aussi le front compilé (un seul port à ouvrir).
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'errors.notFound' }));
  app.use(errorHandler);
  return app;
}
