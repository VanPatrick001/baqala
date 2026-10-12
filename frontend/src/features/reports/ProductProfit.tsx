import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { api } from '../../api/client';
import { get } from '../../api/hooks';
import { toast } from '../../stores/toast';
import { useFormat } from '../../lib/format';
import { printDocument, saveBlob } from '../../lib/native';
import { Empty, Loading, StatCard } from '../../components/ui';

interface Row {
  product_id: number;
  month: string;
  product_name: string;
  translations: Record<string, string> | null;
  sku: string;
  purchase_price: number;
  sale_price: number;
  qty_sold: number;
  revenue_net: number;
  cost: number;
  profit: number;
  avg_sale_price: number;
  avg_purchase_cost: number;
  margin_pct: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
const sum = (rows: Row[], k: keyof Row) => rows.reduce((a, r) => a + Number(r[k]), 0);

/**
 * Bénéfice par produit : un mois (détail complet) ou une année (produits × mois).
 * Bénéfice = ventes HT − coût d'achat réel des articles vendus (enregistré à chaque vente).
 */
export function ProductProfit() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const now = new Date();
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [month, setMonth] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState('');

  const range = useMemo(() => {
    if (mode === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` };
    const [y, m] = month.split('-').map(Number);
    return { from: `${month}-01`, to: `${month}-${pad(lastDay(y, m))}` };
  }, [mode, month, year]);

  const { data, isLoading } = useQuery({ queryKey: ['r-profit', range], queryFn: () => get<Row[]>('/reports/product-profit', range) });
  const q = search.trim().toLowerCase();
  const rows = (data ?? []).filter((r) => !q || r.sku.toLowerCase().includes(q) || f.name(r.product_name, r.translations).toLowerCase().includes(q));
  const revenue = sum(rows, 'revenue_net');
  const profit = sum(rows, 'profit');

  const monthName = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString(f.locale, { month: 'short' });
  };

  const exportExcel = async () => {
    try {
      const res = await api.get('/reports/export.xlsx', { params: { ...range, granularity: 'MONTH', lang: i18n.language }, responseType: 'blob' });
      await saveBlob(res.data, `baqala-profit-${range.from}_${range.to}.xlsx`);
    } catch {
      toast.error('errors.server');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5">
          {(['month', 'year'] as const).map((m) => (
            <button key={m} className={`rounded-md px-3 py-1.5 text-sm ${mode === m ? 'bg-brand-700 text-white' : 'text-slate-700'}`} onClick={() => setMode(m)}>
              {t(`reports.profit.${m}`)}
            </button>
          ))}
        </div>
        {mode === 'month' ? (
          <input type="month" className="input w-auto num" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        ) : (
          <select className="input w-auto num" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 6 }, (_, i) => now.getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        <input className="input max-w-xs" placeholder={t('products.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="ms-auto flex gap-2">
          <button className="btn-secondary" onClick={exportExcel}><FileSpreadsheet size={16} /> Excel</button>
          <button className="btn-secondary" onClick={() => void printDocument('page')}><FileDown size={16} /> PDF</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('reports.rows.revenue_net')} value={f.money(revenue)} />
        <StatCard label={t('reports.profit.cost')} value={f.money(sum(rows, 'cost'))} />
        <StatCard label={t('reports.profit.profit')} value={f.money(profit)} tone={profit < 0 ? 'red' : 'green'} />
        <StatCard label={t('reports.profit.marginPct')} value={f.pct(revenue ? (profit / revenue) * 100 : 0)} />
      </div>

      {isLoading ? <Loading /> : !rows.length ? <div className="card"><Empty text={t('reports.profit.empty')} /></div> : (
        <div className="print-area card overflow-x-auto">
          <h3 className="border-b border-slate-200 p-3 text-sm font-bold">
            {t('reports.profit.title')} · <span className="num">{mode === 'month' ? month : year}</span> · <span className="font-normal text-slate-500">{f.currency}</span>
          </h3>
          {mode === 'month' ? <MonthTable rows={rows} /> : <YearMatrix rows={rows} year={year} monthName={monthName} />}
          <p className="p-3 text-xs text-slate-500">{t('reports.profit.hint')}</p>
        </div>
      )}
    </div>
  );
}

function MonthTable({ rows }: { rows: Row[] }) {
  const { t } = useTranslation();
  const f = useFormat();
  const revenue = sum(rows, 'revenue_net');
  const profit = sum(rows, 'profit');
  const n = (v: number) => f.number(v, 2);
  return (
    <table className="table">
      <thead>
        <tr>
          <th>{t('products.name')}</th>
          <th className="text-end">{t('reports.profit.purchasePrice')}</th>
          <th className="text-end">{t('reports.profit.salePrice')}</th>
          <th className="text-end" title={t('reports.profit.unitProfitHint')}>{t('reports.profit.unitProfit')}</th>
          <th className="text-end">{t('reports.qtySold')}</th>
          <th className="text-end">{t('reports.rows.revenue_net')}</th>
          <th className="text-end">{t('reports.profit.cost')}</th>
          <th className="text-end">{t('reports.profit.profit')}</th>
          <th className="text-end">{t('reports.profit.marginPct')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.product_id}>
            <td className="min-w-40">{f.name(r.product_name, r.translations)} <span className="num whitespace-nowrap text-xs text-slate-500">{r.sku}</span></td>
            <td className="text-end num">{n(r.purchase_price)}</td>
            <td className="text-end num">{n(r.sale_price)}</td>
            <td className="text-end num">{n(r.avg_sale_price - r.avg_purchase_cost)}</td>
            <td className="text-end num">{f.qty(r.qty_sold)}</td>
            <td className="text-end num">{n(r.revenue_net)}</td>
            <td className="text-end num">{n(r.cost)}</td>
            <td className={`text-end num font-semibold ${r.profit < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{n(r.profit)}</td>
            <td className="text-end num">{f.pct(r.margin_pct)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-bold">
          <td colSpan={5}>{t('common.total')}</td>
          <td className="text-end num">{n(revenue)}</td>
          <td className="text-end num">{n(sum(rows, 'cost'))}</td>
          <td className={`text-end num ${profit < 0 ? 'text-red-700' : ''}`}>{n(profit)}</td>
          <td className="text-end num">{f.pct(revenue ? (profit / revenue) * 100 : 0)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function YearMatrix({ rows, year, monthName }: { rows: Row[]; year: number; monthName: (ym: string) => string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
  const products = new Map<number, { name: string; sku: string; byMonth: Record<string, number>; total: number }>();
  for (const r of rows) {
    const p = products.get(r.product_id) ?? { name: f.name(r.product_name, r.translations), sku: r.sku, byMonth: {}, total: 0 };
    p.byMonth[r.month] = (p.byMonth[r.month] ?? 0) + r.profit;
    p.total += r.profit;
    products.set(r.product_id, p);
  }
  const list = [...products.values()].sort((a, b) => b.total - a.total);
  const monthTotal = (m: string) => rows.filter((r) => r.month === m).reduce((a, r) => a + r.profit, 0);
  const cell = (v: number | undefined) => (v === undefined ? <span className="text-slate-300">·</span> : <span className={v < 0 ? 'text-red-700' : ''}>{f.number(v, 0)}</span>);
  return (
    <table className="table">
      <thead>
        <tr>
          <th>{t('products.name')}</th>
          {months.map((m) => <th key={m} className="text-end">{monthName(m)}</th>)}
          <th className="text-end">{t('common.total')}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((p) => (
          <tr key={p.sku}>
            <td className="whitespace-nowrap">{p.name}</td>
            {months.map((m) => <td key={m} className="text-end num text-xs">{cell(p.byMonth[m])}</td>)}
            <td className="text-end num font-semibold">{f.number(p.total, 0)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-bold">
          <td>{t('reports.profit.profit')}</td>
          {months.map((m) => <td key={m} className="text-end num text-xs">{f.number(monthTotal(m), 0)}</td>)}
          <td className="text-end num">{f.number(sum(rows, 'profit'), 0)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
