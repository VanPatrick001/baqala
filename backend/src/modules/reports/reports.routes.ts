import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../../core/errors.js';
import { can } from '../../core/auth.js';
import { lang, periodQuery, resolvePeriod } from '../../core/http.js';
import * as svc from './reports.service.js';
import { buildWorkbook } from './excel.js';

export const reportsRouter = Router();
reportsRouter.use(can('reports.view', 'dashboard.view'));

const granularity = z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']).default('DAY');

reportsRouter.get('/dashboard', ah(async (req, res) => {
  const { from, to } = resolvePeriod(periodQuery.parse(req.query));
  res.json(await svc.dashboard(from, to));
}));

reportsRouter.get('/summary', ah(async (req, res) => {
  const { from, to } = resolvePeriod(periodQuery.parse(req.query));
  res.json(await svc.financialSummary(from, to));
}));

reportsRouter.get('/period', ah(async (req, res) => {
  const { from, to } = resolvePeriod(periodQuery.parse(req.query));
  res.json(await svc.periodReport(granularity.parse(req.query.granularity), from, to));
}));

reportsRouter.get('/taxes', ah(async (req, res) => {
  const { from, to } = resolvePeriod(periodQuery.parse(req.query));
  res.json(await svc.taxReport(from, to));
}));

reportsRouter.get('/top-products', ah(async (req, res) => {
  const { from, to } = resolvePeriod(periodQuery.parse(req.query));
  res.json(await svc.topProducts(from, to, z.coerce.number().int().min(1).max(100).default(10).parse(req.query.limit)));
}));

/** Bénéfice par produit et par mois (période libre, regroupée par mois). */
reportsRouter.get('/product-profit', can('reports.view'), ah(async (req, res) => {
  const { from, to } = resolvePeriod(periodQuery.parse(req.query));
  res.json(await svc.productProfit(from, to));
}));

/** Export Excel (le PDF est généré côté navigateur pour un rendu arabe/ourdou correct). */
reportsRouter.get('/export.xlsx', can('reports.view'), ah(async (req, res) => {
  const { from, to } = resolvePeriod(periodQuery.parse(req.query));
  const wb = await buildWorkbook(from, to, granularity.parse(req.query.granularity), lang.default('en').parse(req.query.lang));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="baqala-report-${from}_${to}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));
