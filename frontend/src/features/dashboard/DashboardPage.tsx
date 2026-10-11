import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, BrainCircuit, Coins, Landmark, Percent, ShoppingBasket, TrendingUp } from 'lucide-react';
import { get } from '../../api/hooks';
import { daysAgo, today, useFormat } from '../../lib/format';
import { DateRange, Loading, PageHeader, StatCard } from '../../components/ui';
import { ChartCard, RankBars, TrendChart } from '../../components/charts';

interface Dashboard {
  from: string;
  to: string;
  summary: Record<string, number>;
  previous: Record<string, number>;
  daily: { period: string; revenue_net: number; gross_margin: number; net_margin: number }[];
  top: { product_id: number; product_name: string; translations: any; revenue_net: number }[];
  payments: { method: string; amount: number }[];
  byCategory: { name: string; translations: any; revenue: number }[];
  stock: { outOfStock: number; lowStock: number; stockValue: number };
  alerts: { type: string; severity: string; count: number }[];
}

/** Complète les jours sans vente par des zéros pour une courbe continue (périodes courtes). */
function fillDays(rows: Dashboard['daily'], from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (!(days >= 0 && days <= 120)) return rows;
  const byDay = new Map(rows.map((r) => [r.period, r]));
  return Array.from({ length: days + 1 }, (_, i) => {
    const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    return byDay.get(d) ?? { period: d, revenue_net: 0, gross_margin: 0, net_margin: 0 };
  });
}

const PRESETS = [
  { key: 'today', days: 0 },
  { key: 'week', days: 6 },
  { key: 'month', days: 29 },
  { key: 'year', days: 364 },
];

export function DashboardPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [range, setRange] = useState({ from: daysAgo(29), to: today() });
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', range],
    queryFn: () => get<Dashboard>('/reports/dashboard', range),
    refetchInterval: 60_000,
  });

  const delta = (key: string) => {
    if (!data?.previous) return null;
    const cur = data.summary[key] ?? 0;
    const prev = data.previous[key] ?? 0;
    if (!prev) return null;
    const pct = ((cur - prev) / Math.abs(prev)) * 100;
    const up = pct >= 0;
    return (
      <span className={up ? 'text-emerald-700' : 'text-red-700'}>
        {up ? <ArrowUpRight size={12} className="inline" /> : <ArrowDownRight size={12} className="inline" />}
        <span className="num">{f.pct(Math.abs(pct))}</span> {t('dashboard.vsPrevious')}
      </span>
    );
  };

  const s = data?.summary ?? {};
  const openAlerts = data?.alerts.reduce((n, a) => n + a.count, 0) ?? 0;
  const criticalAlerts = data?.alerts.filter((a) => a.severity === 'CRITICAL').reduce((n, a) => n + a.count, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title={t('dashboard.title')}
        actions={
          <>
            {PRESETS.map((p) => (
              <button key={p.key} className="btn-secondary py-1.5" onClick={() => setRange({ from: daysAgo(p.days), to: today() })}>{t(`dashboard.presets.${p.key}`)}</button>
            ))}
            <DateRange from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
          </>
        }
      />
      {isLoading || !data ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={t('kpi.revenue')} value={f.money(s.revenue_gross)} hint={delta('revenue_gross')} icon={<TrendingUp size={16} />} tone="brand" />
            <StatCard label={t('kpi.grossMargin')} value={f.money(s.gross_margin)} hint={<><span className="num">{f.pct(s.gross_margin_pct)}</span> · {delta('gross_margin')}</>} icon={<Percent size={16} />} />
            <StatCard label={t('kpi.netMargin')} value={f.money(s.net_margin)} hint={<span className="num">{f.pct(s.net_margin_pct)}</span>} tone={s.net_margin < 0 ? 'red' : 'green'} icon={<Coins size={16} />} />
            <StatCard label={t('kpi.taxDue')} value={f.money(s.tax_due)} hint={<>{t('kpi.collected')} <span className="num">{f.money(s.tax_collected)}</span> · {t('kpi.deductible')} <span className="num">{f.money(s.tax_deductible)}</span></>} icon={<Landmark size={16} />} tone={s.tax_due > 0 ? 'amber' : 'slate'} />
            <StatCard label={t('kpi.tickets')} value={f.number(s.tickets, 0)} hint={<>{t('kpi.avgBasket')} <span className="num">{f.money(s.avg_basket)}</span></>} icon={<ShoppingBasket size={16} />} />
            <StatCard label={t('kpi.expenses')} value={f.money(s.operating_expenses)} hint={<>{t('kpi.shrinkage')} <span className="num">{f.money(s.shrinkage_cost)}</span></>} />
            <StatCard label={t('kpi.netCashFlow')} value={f.money(s.net_cash_flow)} tone={s.net_cash_flow < 0 ? 'red' : 'green'} hint={<>{t('kpi.in')} <span className="num">{f.money(s.cash_in)}</span> · {t('kpi.out')} <span className="num">{f.money(s.cash_out)}</span></>} />
            <Link to="/agent" className="block">
              <StatCard
                label={t('kpi.smartAgent')}
                value={f.number(openAlerts, 0)}
                tone={criticalAlerts ? 'red' : 'slate'}
                icon={<BrainCircuit size={16} />}
                hint={<>{t('kpi.critical', { count: criticalAlerts })} · {t('kpi.stockIssues', { low: data.stock.lowStock ?? 0, out: data.stock.outOfStock ?? 0 })}</>}
              />
            </Link>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <ChartCard title={t('dashboard.salesTrend')} empty={!data.daily.length}>
                <TrendChart
                  data={fillDays(data.daily, data.from, data.to)}
                  xKey="period"
                  format={(n) => f.number(n, 0)}
                  series={[{ key: 'revenue_net', label: t('kpi.revenueNet') }, { key: 'gross_margin', label: t('kpi.grossMargin') }]}
                />
              </ChartCard>
            </div>
            <ChartCard title={t('dashboard.paymentMix')} empty={!data.payments.length}>
              <RankBars data={data.payments.map((p) => ({ ...p, label: t(`paymentMethods.${p.method}`) }))} labelKey="label" valueKey="amount" format={(n) => f.number(n, 0)} />
            </ChartCard>
            <div className="xl:col-span-2">
              <ChartCard title={t('dashboard.topProducts')} empty={!data.top.length}>
                <RankBars data={data.top.map((p) => ({ ...p, label: f.name(p.product_name, p.translations) }))} labelKey="label" valueKey="revenue_net" format={(n) => f.number(n, 0)} />
              </ChartCard>
            </div>
            <ChartCard title={t('dashboard.byCategory')} empty={!data.byCategory.length}>
              <RankBars data={data.byCategory.map((c) => ({ ...c, label: f.name(c.name, c.translations) }))} labelKey="label" valueKey="revenue" format={(n) => f.number(n, 0)} />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
