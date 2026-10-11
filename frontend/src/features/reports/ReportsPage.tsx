import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { api } from '../../api/client';
import { get, useSettings } from '../../api/hooks';
import { toast } from '../../stores/toast';
import { daysAgo, today, useFormat } from '../../lib/format';
import { DateRange, Loading, PageHeader } from '../../components/ui';
import { ChartCard, TrendChart } from '../../components/charts';

type Gran = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
const SUMMARY_ROWS: [string, 'money' | 'pct' | 'int'][] = [
  ['tickets', 'int'], ['revenue_gross', 'money'], ['discounts', 'money'], ['revenue_net', 'money'], ['cogs', 'money'],
  ['gross_margin', 'money'], ['gross_margin_pct', 'pct'], ['operating_expenses', 'money'], ['shrinkage_cost', 'money'],
  ['net_margin', 'money'], ['net_margin_pct', 'pct'], ['tax_collected', 'money'], ['tax_deductible', 'money'], ['tax_due', 'money'],
  ['cash_in', 'money'], ['cash_out', 'money'], ['net_cash_flow', 'money'], ['avg_basket', 'money'],
];

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const { data: settings } = useSettings();
  const [range, setRange] = useState({ from: daysAgo(29), to: today() });
  const [gran, setGran] = useState<Gran>('DAY');
  const params = { ...range, granularity: gran };
  const summary = useQuery({ queryKey: ['r-summary', range], queryFn: () => get<Record<string, number>>('/reports/summary', range) });
  const period = useQuery({ queryKey: ['r-period', params], queryFn: () => get<any[]>('/reports/period', params) });
  const taxes = useQuery({ queryKey: ['r-taxes', range], queryFn: () => get<any[]>('/reports/taxes', range) });
  const top = useQuery({ queryKey: ['r-top', range], queryFn: () => get<any[]>('/reports/top-products', { ...range, limit: 15 }) });

  const fmt = (v: number, kind: string) => (kind === 'pct' ? f.pct(v) : kind === 'int' ? f.number(v, 0) : f.money(v));

  const exportExcel = async () => {
    try {
      const res = await api.get('/reports/export.xlsx', { params: { ...params, lang: i18n.language }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `baqala-${range.from}_${range.to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('errors.server');
    }
  };

  // PDF : la mise en page d'impression du navigateur rend correctement l'arabe et l'ourdou (RTL).
  const exportPdf = () => window.print();

  const loading = summary.isLoading || period.isLoading || taxes.isLoading || top.isLoading;

  return (
    <div>
      <PageHeader
        title={t('reports.title')}
        actions={
          <>
            <select className="input w-auto" value={gran} onChange={(e) => setGran(e.target.value as Gran)}>
              {(['DAY', 'WEEK', 'MONTH', 'YEAR'] as Gran[]).map((g) => <option key={g} value={g}>{t(`reports.granularity.${g}`)}</option>)}
            </select>
            <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
            <button className="btn-secondary" onClick={exportExcel}><FileSpreadsheet size={16} /> Excel</button>
            <button className="btn-secondary" onClick={exportPdf}><FileDown size={16} /> PDF</button>
          </>
        }
      />
      {loading ? <Loading /> : (
        <div className="print-area space-y-4">
          <div className="hidden text-center print:block">
            <h1 className="text-xl font-bold">{settings?.store_name as string} — {t('reports.title')}</h1>
            <p className="text-sm num">{range.from} → {range.to}</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="card overflow-hidden">
              <h3 className="border-b border-slate-200 p-3 text-sm font-bold">{t('reports.financialSummary')}</h3>
              <table className="table">
                <tbody>
                  {SUMMARY_ROWS.map(([k, kind]) => (
                    <tr key={k} className={['gross_margin', 'net_margin', 'tax_due', 'net_cash_flow'].includes(k) ? 'font-bold' : ''}>
                      <td>{t(`reports.rows.${k}`)}</td>
                      <td className={`text-end num ${(summary.data?.[k] ?? 0) < 0 ? 'text-red-700' : ''}`}>{fmt(summary.data?.[k] ?? 0, kind)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-4 xl:col-span-2">
              <ChartCard title={t('reports.periodChart')} empty={!period.data?.length}>
                <TrendChart data={period.data ?? []} xKey="period" format={(n) => f.number(n, 0)}
                  series={[{ key: 'revenue_net', label: t('reports.rows.revenue_net') }, { key: 'net_margin', label: t('reports.rows.net_margin') }]} />
              </ChartCard>
              <div className="card overflow-x-auto">
                <h3 className="border-b border-slate-200 p-3 text-sm font-bold">{t('reports.periodTable')}</h3>
                <table className="table">
                  <thead><tr><th>{t('reports.period')}</th><th className="text-end">{t('reports.rows.tickets')}</th><th className="text-end">{t('reports.rows.revenue_net')}</th><th className="text-end">{t('reports.rows.cogs')}</th><th className="text-end">{t('reports.rows.gross_margin')}</th><th className="text-end">{t('reports.rows.operating_expenses')}</th><th className="text-end">{t('reports.rows.net_margin')}</th><th className="text-end">{t('reports.rows.tax_collected')}</th></tr></thead>
                  <tbody>
                    {period.data?.map((r) => (
                      <tr key={r.period}>
                        <td className="num">{r.period}</td><td className="text-end num">{r.tickets}</td><td className="text-end num">{f.money(r.revenue_net)}</td>
                        <td className="text-end num">{f.money(r.cogs)}</td><td className="text-end num">{f.money(r.gross_margin)}</td>
                        <td className="text-end num">{f.money(r.operating_expenses)}</td>
                        <td className={`text-end num font-semibold ${r.net_margin < 0 ? 'text-red-700' : ''}`}>{f.money(r.net_margin)}</td>
                        <td className="text-end num">{f.money(r.tax_collected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="card overflow-x-auto">
              <h3 className="border-b border-slate-200 p-3 text-sm font-bold">{t('reports.taxReport')}</h3>
              <table className="table">
                <thead><tr><th>{t('settings.taxes.name')}</th><th className="text-end">{t('settings.taxes.rate')}</th><th className="text-end">{t('reports.taxCollected')}</th><th className="text-end">{t('reports.taxPaid')}</th><th className="text-end">{t('reports.taxDue')}</th></tr></thead>
                <tbody>
                  {taxes.data?.map((r) => (
                    <tr key={r.code}>
                      <td>{r.name} <span className="text-xs text-slate-500">({r.code})</span></td>
                      <td className="text-end num">{r.tax_type === 'PERCENT' ? `${r.rate}%` : f.money(r.rate)}</td>
                      <td className="text-end num">{f.money(r.tax_collected)}</td>
                      <td className="text-end num">{f.money(r.tax_paid)}</td>
                      <td className={`text-end num font-semibold ${r.tax_due < 0 ? 'text-emerald-700' : ''}`}>{f.money(r.tax_due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card overflow-x-auto">
              <h3 className="border-b border-slate-200 p-3 text-sm font-bold">{t('dashboard.topProducts')}</h3>
              <table className="table">
                <thead><tr><th>{t('products.name')}</th><th className="text-end">{t('reports.qtySold')}</th><th className="text-end">{t('reports.rows.revenue_net')}</th><th className="text-end">{t('reports.rows.gross_margin')}</th></tr></thead>
                <tbody>
                  {top.data?.map((r) => (
                    <tr key={r.product_id}>
                      <td>{f.name(r.product_name, r.translations)}</td><td className="text-end num">{f.qty(r.qty_sold)}</td>
                      <td className="text-end num">{f.money(r.revenue_net)}</td><td className="text-end num">{f.money(r.gross_margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
