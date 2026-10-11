import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorKey, type Page } from '../../api/client';
import { get, useSuppliers } from '../../api/hooks';
import type { Product, Supplier } from '../../api/types';
import { useCan } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { useFormat } from '../../lib/format';
import { Badge, Empty, Field, Loading, Modal, NumberInput, PageHeader, Pagination, Tabs } from '../../components/ui';
import { ProductSelect } from '../../components/ProductSelect';

const STATUS_COLOR = { DRAFT: 'amber', RECEIVED: 'green', CANCELLED: 'slate' } as const;
const PAY_COLOR = { UNPAID: 'red', PARTIAL: 'amber', PAID: 'green' } as const;

export function PurchasesPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'purchases' | 'suppliers'>('purchases');
  return (
    <div>
      <PageHeader title={t('purchases.title')} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'purchases', label: t('purchases.orders') }, { value: 'suppliers', label: t('suppliers.title') }]} />
      {tab === 'purchases' ? <PurchaseList /> : <SupplierList />}
    </div>
  );
}

function PurchaseList() {
  const { t } = useTranslation();
  const f = useFormat();
  const canManage = useCan('purchases.manage');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | 'new' | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['purchases', status, page],
    queryFn: () => get<Page<any>>('/purchases', { status: status || undefined, page, pageSize: 25 }),
  });
  return (
    <div className="card">
      <div className="flex flex-wrap justify-between gap-2 border-b border-slate-200 p-3">
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('common.allStatuses')}</option>
          {['DRAFT', 'RECEIVED', 'CANCELLED'].map((s) => <option key={s} value={s}>{t(`purchases.status.${s}`)}</option>)}
        </select>
        {canManage && <button className="btn-primary" onClick={() => setOpenId('new')}><Plus size={16} /> {t('purchases.new')}</button>}
      </div>
      {isLoading ? <Loading /> : !data?.rows.length ? <Empty /> : (
        <table className="table">
          <thead><tr><th>{t('purchases.number')}</th><th>{t('purchases.supplier')}</th><th>{t('common.date')}</th><th>{t('common.status')}</th><th>{t('purchases.payment')}</th><th className="text-end">{t('purchases.taxPaid')}</th><th className="text-end">{t('common.total')}</th><th className="text-end">{t('purchases.paid')}</th></tr></thead>
          <tbody>
            {data.rows.map((p) => (
              <tr key={p.id} className="cursor-pointer" onClick={() => setOpenId(p.id)}>
                <td className="num font-semibold text-brand-800">{p.purchaseNo}</td>
                <td>{p.supplierName}</td>
                <td className="num text-xs">{f.dateTime(p.receivedAt ?? p.orderedAt)}</td>
                <td><Badge color={STATUS_COLOR[p.status as keyof typeof STATUS_COLOR]}>{t(`purchases.status.${p.status}`)}</Badge></td>
                <td>{p.status === 'RECEIVED' && <Badge color={PAY_COLOR[p.paymentStatus as keyof typeof PAY_COLOR]}>{t(`purchases.paymentStatus.${p.paymentStatus}`)}</Badge>}</td>
                <td className="text-end num">{f.money(p.taxTotal)}</td>
                <td className="text-end num font-semibold">{f.money(p.status === 'DRAFT' ? p.estimatedNet : p.total)}</td>
                <td className="text-end num">{f.money(p.paidTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination page={page} pageSize={25} total={data?.total ?? 0} onChange={setPage} />
      {openId && <PurchaseDialog id={openId === 'new' ? null : openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

interface Line { product: Product | null; qty: number; unitCost: number; batchNo: string; expiryDate: string }

function PurchaseDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const canManage = useCan('purchases.manage');
  const { data: suppliers } = useSuppliers();
  const { data: existing, isLoading } = useQuery({ queryKey: ['purchase', id], queryFn: () => get<any>(`/purchases/${id}`), enabled: !!id });
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [lines, setLines] = useState<Line[] | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('BANK');

  const editable = !id || existing?.status === 'DRAFT';
  const currentLines: Line[] =
    lines ??
    (existing?.items?.map((it: any) => ({
      product: { id: it.productId, name: it.productName, sku: it.sku, translations: it.translations } as Product,
      qty: it.quantity, unitCost: it.unitCost, batchNo: it.batchNo ?? '', expiryDate: it.expiryDate ?? '',
    })) ?? [{ product: null, qty: 1, unitCost: 0, batchNo: '', expiryDate: '' }]);
  const supplier = supplierId ?? existing?.supplierId ?? null;
  const setLine = (i: number, patch: Partial<Line>) => setLines(currentLines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const estimated = currentLines.reduce((s, l) => s + l.qty * l.unitCost, 0);

  const refresh = () => ['purchases', 'purchase', 'products', 'pos-catalog', 'suppliers', 'inventory-overview'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const body = (receive: boolean) => ({
    supplierId: supplier,
    supplierInvoiceNo: invoiceNo || existing?.supplierInvoiceNo || null,
    receive,
    items: currentLines.filter((l) => l.product).map((l) => ({ productId: l.product!.id, qty: l.qty, unitCost: l.unitCost, batchNo: l.batchNo || null, expiryDate: l.expiryDate || null })),
  });
  const save = useMutation({
    mutationFn: async (receive: boolean) => {
      if (!id) return api.post('/purchases', body(receive));
      await api.put(`/purchases/${id}`, body(false));
      if (receive) await api.post(`/purchases/${id}/receive`);
    },
    onSuccess: () => { toast.success('common.saved'); refresh(); onClose(); },
    onError: (e) => toast.error(errorKey(e)),
  });
  const action = useMutation({
    mutationFn: (a: 'cancel' | 'pay') => (a === 'cancel' ? api.post(`/purchases/${id}/cancel`) : api.post(`/purchases/${id}/pay`, { amount: payAmount, method: payMethod })),
    onSuccess: () => { toast.success('common.saved'); refresh(); setPayAmount(0); },
    onError: (e) => toast.error(errorKey(e)),
  });

  if (id && isLoading) return null;
  const valid = supplier && currentLines.some((l) => l.product && l.qty > 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={id ? `${t('purchases.order')} ${existing?.purchaseNo ?? ''}` : t('purchases.new')}
      footer={
        editable && canManage ? (
          <>
            {id && <button className="btn-ghost text-red-600" onClick={() => action.mutate('cancel')}>{t('purchases.cancelOrder')}</button>}
            <button className="btn-secondary" disabled={!valid || save.isPending} onClick={() => save.mutate(false)}>{t('purchases.saveDraft')}</button>
            <button className="btn-primary" disabled={!valid || save.isPending} onClick={() => save.mutate(true)}>{t('purchases.receive')}</button>
          </>
        ) : <button className="btn-secondary" onClick={onClose}>{t('common.close')}</button>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label={t('purchases.supplier')}>
          <select className="input" disabled={!editable} value={supplier ?? ''} onChange={(e) => setSupplierId(Number(e.target.value))}>
            <option value="">—</option>
            {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label={t('purchases.invoiceNo')}><input className="input" disabled={!editable} value={invoiceNo || existing?.supplierInvoiceNo || ''} onChange={(e) => setInvoiceNo(e.target.value)} /></Field>
        {existing && <div className="text-sm"><span className="label">{t('common.status')}</span><Badge color={STATUS_COLOR[existing.status as keyof typeof STATUS_COLOR]}>{t(`purchases.status.${existing.status}`)}</Badge></div>}
      </div>
      <table className="table">
        <thead><tr><th className="w-72">{t('products.name')}</th><th>{t('inventory.quantity')}</th><th>{t('purchases.unitCost')}</th><th>{t('products.batchNo')}</th><th>{t('products.expiryDate')}</th><th className="text-end">{t('purchases.net')}</th>{existing?.status === 'RECEIVED' && <th className="text-end">{t('purchases.tax')}</th>}<th /></tr></thead>
        <tbody>
          {currentLines.map((l, i) => (
            <tr key={i}>
              <td>{editable ? <ProductSelect value={l.product} onChange={(p) => setLine(i, { product: p, unitCost: p?.purchasePrice ?? 0 })} /> : f.name(l.product?.name ?? '', l.product?.translations)}</td>
              <td><NumberInput className="w-24" disabled={!editable} value={l.qty} onChange={(v) => setLine(i, { qty: v })} min={0} /></td>
              <td><NumberInput className="w-28" disabled={!editable} value={l.unitCost} onChange={(v) => setLine(i, { unitCost: v })} min={0} /></td>
              <td><input className="input w-28" disabled={!editable} value={l.batchNo} onChange={(e) => setLine(i, { batchNo: e.target.value })} /></td>
              <td><input type="date" className="input w-40 num" disabled={!editable} value={l.expiryDate} onChange={(e) => setLine(i, { expiryDate: e.target.value })} /></td>
              <td className="text-end num">{f.money(l.qty * l.unitCost)}</td>
              {existing?.status === 'RECEIVED' && <td className="text-end num">{f.money(existing.items[i]?.taxAmount)}</td>}
              <td>{editable && <button className="text-red-600" onClick={() => setLines(currentLines.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {editable && <button className="btn-ghost mt-2" onClick={() => setLines([...currentLines, { product: null, qty: 1, unitCost: 0, batchNo: '', expiryDate: '' }])}><Plus size={15} /> {t('purchases.addLine')}</button>}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="text-sm">
          {existing?.status === 'RECEIVED' && canManage && existing.paidTotal < existing.total && (
            <div className="flex items-end gap-2 rounded-lg bg-slate-50 p-3">
              <Field label={t('purchases.recordPayment')}><NumberInput className="w-32" value={payAmount} onChange={setPayAmount} max={existing.total - existing.paidTotal} /></Field>
              <select className="input w-auto" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                {['BANK', 'CARD', 'MOBILE'].map((m) => <option key={m} value={m}>{t(`paymentMethods.${m}`)}</option>)}
              </select>
              <button className="btn-primary" disabled={payAmount <= 0} onClick={() => action.mutate('pay')}>{t('purchases.pay')}</button>
            </div>
          )}
        </div>
        <div className="min-w-60 space-y-1 text-sm">
          {existing?.status === 'RECEIVED' ? (
            <>
              <div className="flex justify-between"><span>{t('purchases.net')}</span><span className="num">{f.money(existing.subtotal)}</span></div>
              <div className="flex justify-between"><span>{t('purchases.taxPaid')}</span><span className="num">{f.money(existing.taxTotal)}</span></div>
              <div className="flex justify-between font-bold"><span>{t('common.total')}</span><span className="num">{f.money(existing.total)}</span></div>
              <div className="flex justify-between text-slate-500"><span>{t('purchases.paid')}</span><span className="num">{f.money(existing.paidTotal)}</span></div>
            </>
          ) : (
            <div className="flex justify-between font-bold"><span>{t('purchases.estimatedNet')}</span><span className="num">{f.money(estimated)}</span></div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SupplierList() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const canManage = useCan('suppliers.manage');
  const { data, isLoading } = useSuppliers();
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const save = useMutation({
    mutationFn: (s: Partial<Supplier>) => (s.id ? api.put(`/suppliers/${s.id}`, s) : api.post('/suppliers', s)),
    onSuccess: () => { toast.success('common.saved'); qc.invalidateQueries({ queryKey: ['suppliers'] }); setEditing(null); },
    onError: (e) => toast.error(errorKey(e)),
  });
  return (
    <div className="card">
      {canManage && <div className="flex justify-end border-b border-slate-200 p-3"><button className="btn-primary" onClick={() => setEditing({ leadTimeDays: 3, isActive: 1 })}><Plus size={16} /> {t('suppliers.new')}</button></div>}
      {isLoading ? <Loading /> : !data?.length ? <Empty /> : (
        <table className="table">
          <thead><tr><th>{t('suppliers.name')}</th><th>{t('suppliers.contact')}</th><th>{t('customers.phone')}</th><th className="text-end">{t('suppliers.leadTime')}</th><th className="text-end">{t('suppliers.balance')}</th><th /></tr></thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{s.name}</td><td>{s.contactName}</td><td className="num">{s.phone}</td>
                <td className="text-end num">{s.leadTimeDays}</td>
                <td className={`text-end num ${s.balance > 0 ? 'font-semibold text-red-700' : ''}`}>{f.money(s.balance)}</td>
                <td className="text-end">{canManage && <button className="btn-ghost p-1.5" onClick={() => setEditing(s)}><Pencil size={15} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? t('suppliers.edit') : t('suppliers.new')}
          footer={<><button className="btn-secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</button><button className="btn-primary" disabled={!editing.name} onClick={() => save.mutate({ ...editing, isActive: !!editing.isActive } as any)}>{t('common.save')}</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('suppliers.name')} className="sm:col-span-2"><input className="input" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label={t('suppliers.contact')}><input className="input" value={editing.contactName ?? ''} onChange={(e) => setEditing({ ...editing, contactName: e.target.value })} /></Field>
            <Field label={t('customers.phone')}><input className="input num" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
            <Field label={t('customers.email')}><input className="input" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
            <Field label={t('suppliers.taxNumber')}><input className="input" value={editing.taxNumber ?? ''} onChange={(e) => setEditing({ ...editing, taxNumber: e.target.value })} /></Field>
            <Field label={t('customers.address')} className="sm:col-span-2"><input className="input" value={editing.address ?? ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
            <Field label={t('suppliers.leadTime')} hint={t('suppliers.leadTimeHint')}><NumberInput value={editing.leadTimeDays ?? 3} onChange={(v) => setEditing({ ...editing, leadTimeDays: v })} min={0} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
