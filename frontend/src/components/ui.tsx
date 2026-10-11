import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { useToast } from '../stores/toast';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Modal({
  open, onClose, title, children, footer, size = 'md',
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <div className="no-print fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8" onMouseDown={onClose}>
      <div className={clsx('card w-full', width)} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button className="btn-ghost p-1" onClick={onClose} aria-label="close"><X size={18} /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

const BADGE: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};
export function Badge({ color = 'slate', children }: { color?: keyof typeof BADGE; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', BADGE[color])}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin text-brand-700', className)} size={20} />;
}

export function Loading() {
  return <div className="flex justify-center p-10"><Spinner /></div>;
}

export function Empty({ text }: { text?: string }) {
  const { t } = useTranslation();
  return <div className="p-8 text-center text-sm text-slate-500">{text ?? t('common.noData')}</div>;
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={clsx('-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold', value === tab.value ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800')}
        >
          {tab.label}
          {tab.count ? <span className="ms-2 rounded-full bg-slate-100 px-1.5 text-xs num">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'slate', icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'brand'; icon?: ReactNode }) {
  const toneCls = { slate: 'text-slate-900', green: 'text-emerald-700', red: 'text-red-700', amber: 'text-amber-700', brand: 'text-brand-800' }[tone];
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
        <span>{label}</span>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <div className={clsx('mt-2 text-2xl font-bold num', toneCls)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm text-slate-600">
      <span>{t('common.pageOf', { page, pages })}</span>
      <div className="flex gap-2">
        <button className="btn-secondary py-1" disabled={page <= 1} onClick={() => onChange(page - 1)}>{t('common.previous')}</button>
        <button className="btn-secondary py-1" disabled={page >= pages} onClick={() => onChange(page + 1)}>{t('common.next')}</button>
      </div>
    </div>
  );
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <input type="date" className="input w-auto py-1.5 num" value={from} max={to} onChange={(e) => onChange(e.target.value, to)} aria-label={t('common.from')} />
      <span className="text-slate-400">→</span>
      <input type="date" className="input w-auto py-1.5 num" value={to} min={from} onChange={(e) => onChange(from, e.target.value)} aria-label={t('common.to')} />
    </div>
  );
}

export function ToastHost() {
  const { t } = useTranslation();
  const { toasts, dismiss } = useToast();
  return (
    <div className="no-print fixed bottom-4 end-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((x) => (
        <div key={x.id} className={clsx('card flex items-start gap-2 p-3 text-sm', x.kind === 'error' && 'border-red-200', x.kind === 'success' && 'border-emerald-200')}>
          {x.kind === 'success' && <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />}
          {x.kind === 'error' && <XCircle size={18} className="shrink-0 text-red-600" />}
          {x.kind === 'info' && <Info size={18} className="shrink-0 text-sky-600" />}
          <span className="flex-1">{t(x.key, { ...x.params, defaultValue: t('errors.server') })}</span>
          <button onClick={() => dismiss(x.id)} className="text-slate-400"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

export function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'CRITICAL') return <XCircle size={18} className="text-red-600" />;
  if (severity === 'WARNING') return <AlertTriangle size={18} className="text-amber-600" />;
  return <Info size={18} className="text-sky-600" />;
}

/** Saisie numérique tolérante (virgule ou point). */
export function NumberInput({ value, onChange, className, ...rest }: { value: number | string; onChange: (v: number) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step="any"
      className={clsx('input num', className)}
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value.replace(',', '.')))}
      {...rest}
    />
  );
}
