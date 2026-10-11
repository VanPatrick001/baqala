import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { api, errorKey } from '../../api/client';
import { get, useCustomers } from '../../api/hooks';
import type { CashSession, Customer } from '../../api/types';
import { useCan } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { useFormat } from '../../lib/format';
import { Badge, Empty, Field, Loading, Modal, NumberInput, PageHeader } from '../../components/ui';

export function CustomersPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const canManage = useCan('customers.manage');
  const canCreate = useCan('customers.create', 'customers.manage');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useCustomers(search);
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const totalDebt = data?.reduce((s, c) => s + c.balance, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title={t('customers.title')}
        subtitle={t('customers.totalDebt', { amount: f.money(totalDebt) })}
        actions={canCreate && <button className="btn-primary" onClick={() => setEditing({ creditLimit: 0 })}><Plus size={16} /> {t('customers.new')}</button>}
      />
      <div className="card">
        <div className="border-b border-slate-200 p-3"><input className="input max-w-xs" placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {isLoading ? <Loading /> : !data?.length ? <Empty /> : (
          <table className="table">
            <thead><tr><th>{t('customers.code')}</th><th>{t('customers.fullName')}</th><th>{t('customers.phone')}</th><th className="text-end">{t('customers.creditLimit')}</th><th className="text-end">{t('customers.balance')}</th><th /></tr></thead>
            <tbody>
              {data.filter((c) => !c.isWalkIn).map((c) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => setDetailId(c.id)}>
                  <td className="num text-xs">{c.code}</td>
                  <td className="font-semibold">{c.fullName}</td>
                  <td className="num">{c.phone}</td>
                  <td className="text-end num">{f.money(c.creditLimit)}</td>
                  <td className="text-end">{c.balance > 0 ? <Badge color={c.creditLimit && c.balance >= 0.8 * c.creditLimit ? 'red' : 'amber'}><span className="num">{f.money(c.balance)}</span></Badge> : <span className="num text-slate-400">{f.money(0)}</span>}</td>
                  <td className="text-end">{canManage && <button className="btn-ghost p-1.5" onClick={(e) => { e.stopPropagation(); setEditing(c); }}><Pencil size={15} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && <CustomerForm customer={editing} canSetCredit={canManage} onClose={() => setEditing(null)} />}
      {detailId && <CustomerDetail id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function CustomerForm({ customer, canSetCredit, onClose }: { customer: Partial<Customer>; canSetCredit: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [c, setC] = useState(customer);
  const save = useMutation({
    mutationFn: () => (c.id ? api.put(`/customers/${c.id}`, c) : api.post('/customers', c)),
    onSuccess: () => { toast.success('common.saved'); qc.invalidateQueries({ queryKey: ['customers'] }); onClose(); },
    onError: (e) => toast.error(errorKey(e)),
  });
  return (
    <Modal open onClose={onClose} title={c.id ? t('customers.edit') : t('customers.new')}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button className="btn-primary" disabled={!c.fullName || save.isPending} onClick={() => save.mutate()}>{t('common.save')}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('customers.fullName')} className="sm:col-span-2"><input className="input" value={c.fullName ?? ''} onChange={(e) => setC({ ...c, fullName: e.target.value })} /></Field>
        <Field label={t('customers.phone')}><input className="input num" value={c.phone ?? ''} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
        <Field label={t('customers.email')}><input className="input" value={c.email ?? ''} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
        <Field label={t('customers.address')} className="sm:col-span-2"><input className="input" value={c.address ?? ''} onChange={(e) => setC({ ...c, address: e.target.value })} /></Field>
        {canSetCredit && <Field label={t('customers.creditLimit')} hint={t('customers.creditLimitHint')}><NumberInput value={c.creditLimit ?? 0} onChange={(v) => setC({ ...c, creditLimit: v })} min={0} /></Field>}
      </div>
    </Modal>
  );
}

function CustomerDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['customer', id], queryFn: () => get<any>(`/customers/${id}`) });
  const { data: session } = useQuery({ queryKey: ['session', 1], queryFn: () => get<CashSession | null>('/cash/sessions/current', { registerId: 1 }) });
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState('CASH');
  const repay = useMutation({
    mutationFn: () => api.post(`/customers/${id}/repay`, { amount, method, sessionId: session?.id ?? null }),
    onSuccess: () => { toast.success('customers.repaymentRecorded'); setAmount(0); ['customer', 'customers', 'session'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e) => toast.error(errorKey(e)),
  });
  return (
    <Modal open onClose={onClose} title={data?.fullName ?? ''} size="lg">
      {!data ? <Loading /> : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{t('customers.balance')}</div><div className="text-lg font-bold num">{f.money(data.balance)}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{t('customers.totalSpent')}</div><div className="text-lg font-bold num">{f.money(data.stats.totalSpent)}</div></div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{t('customers.purchases')}</div><div className="text-lg font-bold num">{data.stats.purchases}</div></div>
          </div>
          {data.balance > 0 && (
            <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3">
              <Field label={t('customers.repayment')}><NumberInput className="w-36" value={amount} onChange={setAmount} min={0} max={data.balance} /></Field>
              <select className="input w-auto" value={method} onChange={(e) => setMethod(e.target.value)}>
                {['CASH', 'CARD', 'MOBILE', 'BANK'].map((m) => <option key={m} value={m}>{t(`paymentMethods.${m}`)}</option>)}
              </select>
              <button className="btn-primary" disabled={amount <= 0 || repay.isPending} onClick={() => repay.mutate()}>{t('customers.recordRepayment')}</button>
              {method === 'CASH' && !session && <span className="text-xs text-red-600">{t('errors.sessionNotOpen')}</span>}
            </div>
          )}
          <h3 className="mb-2 text-sm font-bold">{t('customers.ledger')}</h3>
          {!data.ledger.length ? <Empty /> : (
            <table className="table">
              <thead><tr><th>{t('common.date')}</th><th>{t('inventory.type')}</th><th>{t('sales.receipt')}</th><th className="text-end">{t('common.amount')}</th><th className="text-end">{t('customers.balance')}</th></tr></thead>
              <tbody>
                {data.ledger.map((l: any) => (
                  <tr key={l.id}>
                    <td className="num text-xs">{f.dateTime(l.createdAt)}</td>
                    <td>{t(`ledgerTypes.${l.type}`)}{l.method && <span className="text-xs text-slate-500"> · {t(`paymentMethods.${l.method}`)}</span>}</td>
                    <td className="num text-xs">{l.receiptNo}</td>
                    <td className={`text-end num ${l.amount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{l.amount > 0 ? '+' : ''}{f.money(l.amount)}</td>
                    <td className="text-end num">{f.money(l.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Modal>
  );
}
