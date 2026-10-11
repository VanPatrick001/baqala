import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Palette catégorielle validée (ordre fixe) : bleu, orange. Texte toujours en encre neutre. */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];
const GRID = '#e2e8f0';
const AXIS = '#64748b';

export function ChartCard({ title, children, empty }: { title: string; children: ReactNode; empty?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-sm font-bold text-slate-700">{title}</h3>
      {empty ? <div className="flex h-56 items-center justify-center text-sm text-slate-400">{t('common.noData')}</div> : children}
    </div>
  );
}

const tooltipStyle = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 };

/** Courbes (une seule échelle Y) avec infobulle et légende. */
export function TrendChart({ data, xKey, series, format }: { data: any[]; xKey: string; series: { key: string; label: string }[]; format: (n: number) => string }) {
  const { i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  return (
    <div dir="ltr" className="h-64">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey={xKey} reversed={rtl} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis orientation={rtl ? 'right' : 'left'} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => format(v)} width={80} />
          <Tooltip formatter={(v: any) => format(Number(v))} contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: '#fff', fill: SERIES[i] }} activeDot={{ r: 6 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barres horizontales à une série (classements). */
export function RankBars({ data, labelKey, valueKey, format, color = SERIES[0] }: { data: any[]; labelKey: string; valueKey: string; format: (n: number) => string; color?: string }) {
  const { i18n } = useTranslation();
  const rtl = i18n.dir() === 'rtl';
  return (
    <div dir="ltr" style={{ height: Math.max(160, data.length * 36) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 16, bottom: 0 }} barCategoryGap={6}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" reversed={rtl} tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={(v) => format(v)} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={labelKey} orientation={rtl ? 'right' : 'left'} width={130} tick={{ fill: '#334155', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: any) => format(Number(v))} contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
          <Bar dataKey={valueKey} fill={color} radius={rtl ? [4, 0, 0, 4] : [0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
