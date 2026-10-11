import ExcelJS from 'exceljs';
import { query } from '../../core/db.js';
import { label, type Lang } from './labels.js';
import * as svc from './reports.service.js';

const SUMMARY_KEYS = [
  'tickets', 'revenue_gross', 'revenue_net', 'discounts', 'cogs', 'gross_margin', 'gross_margin_pct',
  'operating_expenses', 'shrinkage_cost', 'net_margin', 'net_margin_pct', 'tax_collected', 'tax_deductible',
  'tax_due', 'cash_in', 'cash_out', 'net_cash_flow', 'avg_basket',
];

/** Classeur Excel multi-feuilles, en-têtes traduits, orientation RTL pour ur/ar. */
export async function buildWorkbook(from: string, to: string, granularity: svc.Granularity, lang: Lang) {
  const rtl = lang !== 'en';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BAQALA';
  wb.created = new Date();

  const sheet = (key: string) => wb.addWorksheet(label(key, lang), { views: [{ rightToLeft: rtl, state: 'frozen', ySplit: 1 }] });
  const header = (ws: ExcelJS.Worksheet, keys: string[], widths: number[]) => {
    ws.columns = keys.map((k, i) => ({ header: label(k, lang), key: k, width: widths[i] ?? 16 }));
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  };
  const money = '#,##0.00';

  const [summary, period, taxes, top, stock] = await Promise.all([
    svc.financialSummary(from, to),
    svc.periodReport(granularity, from, to),
    svc.taxReport(from, to),
    svc.topProducts(from, to, 50),
    query(
      `SELECT v.sku, COALESCE(t.name, v.name) AS name, v.stock_qty, v.min_stock, v.stock_value, v.next_expiry_date AS next_expiry, v.stock_status AS status
         FROM v_product_stock_status v LEFT JOIN product_translations t ON t.product_id = v.product_id AND t.language_code = ?
        ORDER BY v.name`,
      [lang],
    ),
  ]);

  const ws1 = sheet('summary');
  header(ws1, ['indicator', 'value'], [34, 20]);
  ws1.addRow({ indicator: label('from', lang), value: from });
  ws1.addRow({ indicator: label('to', lang), value: to });
  for (const k of SUMMARY_KEYS) ws1.addRow({ indicator: label(k, lang), value: summary?.[k] ?? 0 });
  ws1.getColumn('value').numFmt = money;

  const ws2 = sheet('period');
  const periodKeys = ['periodCol', 'tickets', 'revenue_net', 'tax_collected', 'cogs', 'gross_margin', 'operating_expenses', 'shrinkage_cost', 'tax_deductible', 'net_margin'];
  header(ws2, periodKeys, [14]);
  for (const r of period) ws2.addRow({ ...r, periodCol: r.period });
  periodKeys.slice(2).forEach((k) => (ws2.getColumn(k).numFmt = money));

  const ws3 = sheet('taxes');
  const taxKeys = ['code', 'name', 'rate', 'taxable_sales', 'tax_collected', 'taxable_purchases', 'tax_paid', 'tax_due'];
  header(ws3, taxKeys, [14, 28]);
  for (const r of taxes) ws3.addRow(r);
  taxKeys.slice(3).forEach((k) => (ws3.getColumn(k).numFmt = money));

  const ws4 = sheet('topProducts');
  header(ws4, ['product', 'qty_sold', 'revenue_net', 'gross_margin'], [36]);
  for (const r of top) ws4.addRow({ ...r, product: r.translations?.[lang] ?? r.product_name });
  ['revenue_net', 'gross_margin'].forEach((k) => (ws4.getColumn(k).numFmt = money));

  const ws5 = sheet('stock');
  header(ws5, ['sku', 'name', 'stock_qty', 'min_stock', 'stock_value', 'next_expiry', 'status'], [16, 36]);
  for (const r of stock) ws5.addRow(r);
  ws5.getColumn('stock_value').numFmt = money;

  return wb;
}
