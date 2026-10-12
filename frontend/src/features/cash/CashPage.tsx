import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Lock, Unlock } from 'lucide-react';
import { api, errorKey, type Page } from '../../api/client';
import { get, useMeta, useTaxes } from '../../api/hooks';
import type { CashSession } from '../../api/types';
import { useCan } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { useFormat } from '../../lib/format';
import { Badge, Empty, Field, Loading, Modal, NumberInput, PageHeader, StatCard, Tabs } from '../../components/ui';
import { printDocument } from '../../lib/native';

export function CashPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'session' | 'movements' | 'history'>('session');
  const canBooks = useCan('cash.view');
  return (
    <div>
      <PageHeader title={t('cash.title')} />
      {/* Journal et historique = comptabilité : manager et administrateur uniquement */}
      {canBooks && <Tabs value={tab} onChange={setTab} tabs={[{ value: 'session', label: t('cash.currentSession') }, { value: 'movements', label: t('cash.movements') }, { value: 'history', label: t('cash.history') }]} />}
      {tab === 'session' && <CurrentSession />}
      {tab === 'movements' && <Movements />}
      {tab === 'history' && <History />}
    </div>
  );
}

function CurrentSession() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const { data: s, isLoading } = useQuery({ queryKey: ['session', 1], queryFn: () => get<CashSession | null>('/cash/sessions/current', { registerId: 1 }) });
  const [float, setFloat] = useState(0);
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState(0);
  const [notes, setNotes] = useState('');
  const [zReport, setZReport] = useState<CashSession | null>(null);
  const [movement, setMovement] = useState<'IN' | 'OUT' | null>(null);
  const canManage = useCan('cash.manage');
  const refresh = () => ['session', 'cash-movements', 'cash-history', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const open = useMutation({
    mutationFn: () => api.post('/cash/sessions/open', { registerId: 1, openingFloat: float }),
    onSuccess: () => { toast.success('cash.sessionOpened'); refresh(); },
    onError: (e) => toast.error(errorKey(e)),
  });
  const close = useMutation({
    mutationFn: () => api.post<CashSession>(`/cash/sessions/${s!.id}/close`, { countedCash: counted, notes: notes || null }),
    onSuccess: ({ data }) => { setClosing(false); setZReport(data); refresh(); },
    onError: (e) => toast.error(errorKey(e)),
  });

  if (isLoading) return <Loading />;
  if (!s) {
    return (
      <>
        <div className="card max-w-md p-5">
          <h3 className="mb-3 font-bold">{t('cash.noOpenSession')}</h3>
          <Field label={t('cash.openingFloat')}><NumberInput value={float} onChange={setFloat} min={0} /></Field>
          <button className="btn-primary mt-3" onClick={() => open.mutate()} disabled={open.isPending}><Unlock size={16} /> {t('cash.openSession')}</button>
        </div>
        {zReport && <ZReport report={zReport} onClose={() => setZReport(null)} />}
      </>
    );
  }
  const diff = counted - s.currentExpectedCash;
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('cash.openingFloat')} value={f.money(s.openingFloat)} hint={<>{t('cash.openedBy', { name: s.openedBy })} · <span className="num">{f.dateTime(s.openedAt)}</span></>} />
        <StatCard label={t('cash.expectedCash')} value={f.money(s.currentExpectedCash)} tone="brand" />
        <StatCard label={t('cash.salesTotal')} value={f.money(s.sales.total)} hint={<>{t('kpi.tickets')} <span className="num">{s.sales.tickets}</span> · {t('cash.voided')} <span className="num">{s.sales.voided}</span></>} />
        <StatCard label={t('kpi.taxCollected')} value={f.money(s.sales.taxTotal)} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {canManage && <>
          <button className="btn-secondary" onClick={() => setMovement('IN')}><ArrowDownLeft size={16} /> {t('cash.cashIn')}</button>
          <button className="btn-secondary" onClick={() => setMovement('OUT')}><ArrowUpRight size={16} /> {t('cash.expense')}</button>
        </>}
        <button className="btn-danger" onClick={() => { setCounted(s.currentExpectedCash); setClosing(true); }}><Lock size={16} /> {t('cash.closeSession')}</button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-bold">{t('cash.byPaymentMethod')}</h3>
          {!s.payments.length ? <Empty /> : s.payments.map((p) => (
            <div key={p.method} className="flex justify-between border-b border-slate-100 py-1.5 text-sm"><span>{t(`paymentMethods.${p.method}`)}</span><span className="num font-semibold">{f.money(p.amount)}</span></div>
          ))}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-bold">{t('cash.drawerMovements')}</h3>
          {!s.movements.length ? <Empty /> : s.movements.map((m, i) => (
            <div key={i} className="flex justify-between border-b border-slate-100 py-1.5 text-sm">
              <span>{t(`cashCategories.${m.category}`)} · <span className="text-xs text-slate-500">{t(`paymentMethods.${m.method}`)}</span></span>
              <span className={`num font-semibold ${m.direction === 'IN' ? 'text-emerald-700' : 'text-red-700'}`}>{m.direction === 'IN' ? '+' : '−'}{f.money(m.amount)}</span>
            </div>
          ))}
        </div>
      </div>
      <Modal open={closing} onClose={() => setClosing(false)} title={t('cash.closeSession')} size="sm"
        footer={<><button className="btn-secondary" onClick={() => setClosing(false)}>{t('common.cancel')}</button><button className="btn-danger" onClick={() => close.mutate()} disabled={close.isPending}>{t('cash.confirmClose')}</button></>}>
        <div className="space-y-3">
          <div className="flex justify-between text-sm"><span>{t('cash.expectedCash')}</span><span className="num font-bold">{f.money(s.currentExpectedCash)}</span></div>
          <Field label={t('cash.countedCash')}><NumberInput value={counted} onChange={setCounted} min={0} autoFocus /></Field>
          <div className={`rounded-lg p-2 text-center text-sm font-semibold ${Math.abs(diff) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            {t('cash.difference')}: <span className="num">{f.money(diff)}</span>
          </div>
          <Field label={t('common.notes')}><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </div>
      </Modal>
      {movement && <MovementForm direction={movement} sessionId={s.id} onClose={() => { setMovement(null); refresh(); }} />}
    </div>
  );
}

function ZReport({ report, onClose }: { report: CashSession; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <Modal open onClose={onClose} title={t('cash.zReport')} size="sm" footer={<button className="btn-primary" onClick={() => void printDocument('page')}>{t('common.print')}</button>}>
      <div className="print-area space-y-1 text-sm">
        <div className="text-center font-bold">{t('cash.zReport')} #<span className="num">{report.id}</span></div>
        <div className="text-center text-xs num">{report.openedAt} → {report.closedAt}</div>
        {[
          ['cash.openingFloat', report.openingFloat], ['cash.salesTotal', report.sales.total], ['kpi.taxCollected', report.sales.taxTotal],
          ['cash.expectedCash', report.expectedCash], ['cash.countedCash', report.countedCash], ['cash.difference', report.difference],
        ].map(([k, v]) => <div key={k as string} className="flex justify-between border-b border-slate-100 py-1"><span>{t(k as string)}</span><span className="num font-semibold">{f.money(v as number)}</span></div>)}
        <div className="pt-2 font-semibold">{t('cash.byPaymentMethod')}</div>
        {report.payments.map((p) => <div key={p.method} className="flex justify-between"><span>{t(`paymentMethods.${p.method}`)}</span><span className="num">{f.money(p.amount)}</span></div>)}
      </div>
    </Modal>
  );
}

function MovementForm({ direction, sessionId, onClose }: { direction: 'IN' | 'OUT'; sessionId: number | null; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const { data: meta } = useMeta();
  const { data: taxes } = useTaxes();
  const categories = meta?.cashCategories.filter((c) => !c.isSystem && (c.direction === direction || c.direction === 'BOTH')) ?? [];
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState(0);
  const [taxId, setTaxId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const save = useMutation({
    mutationFn: () => api.post('/cash/movements', { sessionId, categoryCode: category || categories[0]?.code, direction, method, amount, taxId, description: description || null }),
    onSuccess: () => { toast.success('common.saved'); onClose(); },
    onError: (e) => toast.error(errorKey(e)),
  });
  return (
    <Modal open onClose={onClose} title={direction === 'IN' ? t('cash.cashIn') : t('cash.expense')}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button className="btn-primary" disabled={amount <= 0 || save.isPending} onClick={() => save.mutate()}>{t('common.save')}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('cash.category')}>
          <select className="input" value={category || categories[0]?.code} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c.code} value={c.code}>{t(`cashCategories.${c.code}`)}</option>)}
          </select>
        </Field>
        <Field label={t('cash.method')}>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {['CASH', 'BANK', 'CARD', 'MOBILE'].map((m) => <option key={m} value={m}>{t(`paymentMethods.${m}`)}</option>)}
          </select>
        </Field>
        <Field label={t('common.amount')} hint={direction === 'OUT' ? t('cash.amountInclTax') : undefined}><NumberInput value={amount} onChange={setAmount} min={0} /></Field>
        {direction === 'OUT' && (
          <Field label={t('cash.deductibleTax')}>
            <select className="input" value={taxId ?? ''} onChange={(e) => setTaxId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('cash.noTax')}</option>
              {taxes?.filter((x) => x.type === 'PERCENT' && x.rate > 0 && x.appliesTo !== 'SALES').map((x) => <option key={x.id} value={x.id}>{f.name(x.name, x.translations)} ({x.rate}%)</option>)}
            </select>
          </Field>
        )}
        <Field label={t('common.description')} className="sm:col-span-2"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        {method === 'CASH' && !sessionId && <p className="text-xs text-red-600 sm:col-span-2">{t('errors.sessionNotOpen')}</p>}
      </div>
    </Modal>
  );
}

function Movements() {
  const { t } = useTranslation();
  const f = useFormat();
  const canManage = useCan('cash.manage');
  const [direction, setDirection] = useState('');
  const [adding, setAdding] = useState<'IN' | 'OUT' | null>(null);
  const { data: session } = useQuery({ queryKey: ['session', 1], queryFn: () => get<CashSession | null>('/cash/sessions/current', { registerId: 1 }) });
  const { data, isLoading } = useQuery({
    queryKey: ['cash-movements', direction],
    queryFn: () => get<Page<any> & { totalIn: number; totalOut: number }>('/cash/movements', { direction: direction || undefined, pageSize: 200 }),
  });
  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
        <div className="flex items-center gap-2">
          <select className="input w-auto" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="">{t('common.all')}</option><option value="IN">{t('cash.in')}</option><option value="OUT">{t('cash.out')}</option>
          </select>
          {data && <span className="text-sm text-slate-600">{t('cash.in')} <span className="num font-semibold text-emerald-700">{f.money(data.totalIn)}</span> · {t('cash.out')} <span className="num font-semibold text-red-700">{f.money(data.totalOut)}</span></span>}
        </div>
        {canManage && <button className="btn-primary" onClick={() => setAdding('OUT')}>{t('cash.expense')}</button>}
      </div>
      {isLoading ? <Loading /> : !data?.rows.length ? <Empty /> : (
        <table className="table">
          <thead><tr><th>{t('common.date')}</th><th>{t('cash.category')}</th><th>{t('cash.method')}</th><th>{t('common.description')}</th><th className="text-end">{t('cash.deductibleTax')}</th><th className="text-end">{t('common.amount')}</th><th>{t('common.user')}</th></tr></thead>
          <tbody>
            {data.rows.map((m) => (
              <tr key={m.id}>
                <td className="num text-xs">{f.dateTime(m.occurredAt)}</td>
                <td>{t(`cashCategories.${m.category}`)}</td>
                <td><Badge>{t(`paymentMethods.${m.method}`)}</Badge></td>
                <td className="text-xs text-slate-600">{m.description ?? (m.referenceType ? `${t(`references.${m.referenceType}`, { defaultValue: m.referenceType })} #${m.referenceId}` : '')}</td>
                <td className="text-end num text-xs">{m.taxAmount ? f.money(m.taxAmount) : ''}</td>
                <td className={`text-end num font-semibold ${m.direction === 'IN' ? 'text-emerald-700' : 'text-red-700'}`}>{m.direction === 'IN' ? '+' : '−'}{f.money(m.amount)}</td>
                <td className="text-xs">{m.userName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && <MovementForm direction={adding} sessionId={session?.id ?? null} onClose={() => setAdding(null)} />}
    </div>
  );
}

function History() {
  const { t } = useTranslation();
  const f = useFormat();
  const { data, isLoading } = useQuery({ queryKey: ['cash-history'], queryFn: () => get<any[]>('/cash/sessions', { pageSize: 100 }) });
  if (isLoading) return <Loading />;
  return (
    <div className="card">
      {!data?.length ? <Empty /> : (
        <table className="table">
          <thead><tr><th>#</th><th>{t('cash.opened')}</th><th>{t('cash.closed')}</th><th className="text-end">{t('kpi.tickets')}</th><th className="text-end">{t('cash.salesTotal')}</th><th className="text-end">{t('cash.expectedCash')}</th><th className="text-end">{t('cash.countedCash')}</th><th className="text-end">{t('cash.difference')}</th></tr></thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id}>
                <td className="num">{s.id}</td>
                <td className="text-xs"><span className="num">{f.dateTime(s.openedAt)}</span><div className="text-slate-500">{s.openedBy}</div></td>
                <td className="text-xs">{s.status === 'OPEN' ? <Badge color="green">{t('cash.open')}</Badge> : <><span className="num">{f.dateTime(s.closedAt)}</span><div className="text-slate-500">{s.closedBy}</div></>}</td>
                <td className="text-end num">{s.tickets}</td>
                <td className="text-end num">{f.money(s.salesTotal)}</td>
                <td className="text-end num">{s.expectedCash != null ? f.money(s.expectedCash) : '—'}</td>
                <td className="text-end num">{s.countedCash != null ? f.money(s.countedCash) : '—'}</td>
                <td className="text-end">{s.difference != null && <Badge color={Math.abs(s.difference) < 0.01 ? 'green' : s.difference < 0 ? 'red' : 'amber'}><span className="num">{f.money(s.difference)}</span></Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
