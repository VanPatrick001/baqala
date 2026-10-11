import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, PackageX } from 'lucide-react';
import { api, errorKey, type Page } from '../../api/client';
import { get } from '../../api/hooks';
import type { Batch, Product } from '../../api/types';
import { useCan } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { useFormat } from '../../lib/format';
import { Badge, Empty, Field, Loading, Modal, NumberInput, PageHeader, Pagination, StatCard, Tabs } from '../../components/ui';
import { ProductSelect } from '../../components/ProductSelect';

type Tab = 'movements' | 'expiry' | 'alerts';
const TYPES = ['PURCHASE', 'SALE', 'SALE_RETURN', 'WASTE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'OPENING'];

export function InventoryPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const canManage = useCan('stock.manage');
  const [tab, setTab] = useState<Tab>('movements');
  const [dialog, setDialog] = useState<'waste' | 'adjust' | null>(null);
  const { data: overview } = useQuery({ queryKey: ['inventory-overview'], queryFn: () => get<Record<string, number>>('/inventory/overview') });

  return (
    <div>
      <PageHeader
        title={t('inventory.title')}
        actions={canManage && (
          <>
            <button className="btn-secondary" onClick={() => setDialog('waste')}><PackageX size={16} /> {t('inventory.recordWaste')}</button>
            <button className="btn-primary" onClick={() => setDialog('adjust')}><ClipboardCheck size={16} /> {t('inventory.adjust')}</button>
          </>
        )}
      />
      {overview && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label={t('inventory.stockValue')} value={f.money(overview.stockValue)} hint={<>{t('inventory.retailValue')} <span className="num">{f.money(overview.retailValue)}</span></>} />
          <StatCard label={t('inventory.products')} value={f.number(overview.products, 0)} />
          <StatCard label={t('inventory.lowStock')} value={f.number(overview.lowStock, 0)} tone={overview.lowStock ? 'amber' : 'slate'} />
          <StatCard label={t('inventory.outOfStock')} value={f.number(overview.outOfStock, 0)} tone={overview.outOfStock ? 'red' : 'slate'} />
          <StatCard label={t('inventory.expiring')} value={f.number(overview.expiringBatches, 0)} hint={<>{t('inventory.expired')}: <span className="num">{overview.expiredBatches}</span></>} tone={overview.expiredBatches ? 'red' : overview.expiringBatches ? 'amber' : 'slate'} />
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'movements', label: t('inventory.tabs.movements') },
        { value: 'expiry', label: t('inventory.tabs.expiry') },
        { value: 'alerts', label: t('inventory.tabs.alerts') },
      ]} />
      {tab === 'movements' && <Movements />}
      {tab === 'expiry' && <Expiry />}
      {tab === 'alerts' && <LowStock />}
      {dialog && <StockDialog kind={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Movements() {
  const { t } = useTranslation();
  const f = useFormat();
  const [type, setType] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['movements', type, product?.id, page],
    queryFn: () => get<Page<any>>('/inventory/movements', { type: type || undefined, productId: product?.id, page, pageSize: 50 }),
  });
  return (
    <div className="card">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3">
        <div className="w-72"><ProductSelect value={product} onChange={(p) => { setProduct(p); setPage(1); }} /></div>
        <select className="input w-auto" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">{t('inventory.allTypes')}</option>
          {TYPES.map((x) => <option key={x} value={x}>{t(`movementTypes.${x}`)}</option>)}
        </select>
      </div>
      {isLoading ? <Loading /> : !data?.rows.length ? <Empty /> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>{t('common.date')}</th><th>{t('products.name')}</th><th>{t('inventory.type')}</th><th className="text-end">{t('inventory.quantity')}</th><th className="text-end">{t('inventory.unitCost')}</th><th className="text-end">{t('inventory.balance')}</th><th>{t('inventory.batch')}</th><th>{t('inventory.reason')}</th><th>{t('common.user')}</th></tr></thead>
            <tbody>
              {data.rows.map((m) => (
                <tr key={m.id}>
                  <td className="num text-xs">{f.dateTime(m.createdAt)}</td>
                  <td className="font-semibold">{f.name(m.productName, m.translations)}</td>
                  <td><Badge color={m.quantity > 0 ? 'green' : m.type === 'WASTE' ? 'red' : 'slate'}>{t(`movementTypes.${m.type}`)}</Badge></td>
                  <td className={`text-end num font-semibold ${m.quantity > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{m.quantity > 0 ? '+' : ''}{f.qty(m.quantity)}</td>
                  <td className="text-end num">{f.money(m.unitCost)}</td>
                  <td className="text-end num">{f.qty(m.balanceAfter)}</td>
                  <td className="text-xs">{m.batchNo ?? ''} {m.expiryDate && <span className="num text-slate-500">({f.date(m.expiryDate)})</span>}</td>
                  <td className="text-xs text-slate-600">{m.reason ?? (m.referenceType ? `${t(`references.${m.referenceType}`, { defaultValue: m.referenceType })} #${m.referenceId ?? ''}` : '')}</td>
                  <td className="text-xs">{m.userName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={50} total={data?.total ?? 0} onChange={setPage} />
    </div>
  );
}

function Expiry() {
  const { t } = useTranslation();
  const f = useFormat();
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({ queryKey: ['batches', days], queryFn: () => get<Batch[]>('/inventory/batches', { withinDays: days }) });
  return (
    <div className="card">
      <div className="flex items-center gap-2 border-b border-slate-200 p-3 text-sm">
        {t('inventory.expiringWithin')}
        {[7, 15, 30, 60, 90].map((d) => <button key={d} className={d === days ? 'btn-primary py-1' : 'btn-secondary py-1'} onClick={() => setDays(d)}><span className="num">{d}</span> {t('common.days')}</button>)}
      </div>
      {isLoading ? <Loading /> : !data?.length ? <Empty /> : (
        <table className="table">
          <thead><tr><th>{t('products.name')}</th><th>{t('inventory.batch')}</th><th>{t('products.expiryDate')}</th><th className="text-end">{t('inventory.daysLeft')}</th><th className="text-end">{t('inventory.quantity')}</th><th className="text-end">{t('inventory.valueAtRisk')}</th></tr></thead>
          <tbody>
            {data.map((b) => (
              <tr key={b.id}>
                <td className="font-semibold">{f.name(b.productName ?? '', b.translations)}</td>
                <td>{b.batchNo ?? '—'}</td>
                <td className="num">{f.date(b.expiryDate)}</td>
                <td className="text-end"><Badge color={(b.daysLeft ?? 0) < 0 ? 'red' : (b.daysLeft ?? 0) <= 7 ? 'amber' : 'blue'}><span className="num">{b.daysLeft}</span></Badge></td>
                <td className="text-end num">{f.qty(b.qtyRemaining)}</td>
                <td className="text-end num">{f.money(b.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LowStock() {
  const { t } = useTranslation();
  const f = useFormat();
  const { data, isLoading } = useQuery({ queryKey: ['products', 'ALERT'], queryFn: () => get<Page<Product>>('/products', { status: 'ALERT', pageSize: 200 }) });
  if (isLoading) return <Loading />;
  if (!data?.rows.length) return <div className="card"><Empty text={t('inventory.noLowStock')} /></div>;
  return (
    <div className="card">
      <table className="table">
        <thead><tr><th>{t('products.name')}</th><th className="text-end">{t('products.stock')}</th><th className="text-end">{t('products.minStock')}</th><th className="text-end">{t('products.reorderQty')}</th><th>{t('products.supplier')}</th></tr></thead>
        <tbody>
          {data.rows.map((p) => (
            <tr key={p.id}>
              <td className="font-semibold">{f.name(p.name, p.translations)}</td>
              <td className="text-end"><Badge color={p.stockStatus === 'OUT' ? 'red' : 'amber'}><span className="num">{f.qty(p.stockQty)}</span></Badge></td>
              <td className="text-end num">{f.qty(p.minStock)}</td>
              <td className="text-end num">{f.qty(p.reorderQty)}</td>
              <td>{p.supplierName ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StockDialog({ kind, onClose }: { kind: 'waste' | 'adjust'; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(0);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const { data: detail } = useQuery({ queryKey: ['product', product?.id], queryFn: () => get<Product>(`/products/${product!.id}`), enabled: !!product });

  const save = useMutation({
    mutationFn: (): Promise<unknown> =>
      kind === 'waste'
        ? api.post('/inventory/waste', { productId: product!.id, qty, batchId, reason })
        : api.post('/inventory/adjust', { productId: product!.id, countedQty: qty, reason }),
    onSuccess: () => {
      toast.success('common.saved');
      ['movements', 'products', 'inventory-overview', 'batches', 'pos-catalog'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    },
    onError: (e) => toast.error(errorKey(e)),
  });

  const reasons = kind === 'waste' ? ['expired', 'damaged', 'theft', 'spoiled'] : ['count', 'correction'];

  return (
    <Modal
      open
      onClose={onClose}
      title={kind === 'waste' ? t('inventory.recordWaste') : t('inventory.adjust')}
      footer={<><button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button><button className="btn-primary" disabled={!product || !reason || (kind === 'waste' && qty <= 0) || save.isPending} onClick={() => save.mutate()}>{t('common.save')}</button></>}
    >
      <div className="space-y-3">
        <Field label={t('products.name')}><ProductSelect value={product} onChange={(p) => { setProduct(p); setBatchId(null); }} autoFocus /></Field>
        {product && <p className="text-sm text-slate-600">{t('inventory.currentStock')}: <span className="num font-semibold">{f.qty(detail?.stockQty ?? product.stockQty)} {product.unitCode}</span></p>}
        <Field label={kind === 'waste' ? t('inventory.quantityLost') : t('inventory.countedQty')} hint={kind === 'adjust' ? t('inventory.adjustHint') : undefined}>
          <NumberInput value={qty} onChange={setQty} min={0} />
        </Field>
        {kind === 'waste' && !!detail?.batches?.length && (
          <Field label={t('inventory.batch')}>
            <select className="input" value={batchId ?? ''} onChange={(e) => setBatchId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('inventory.fefoAuto')}</option>
              {detail.batches.map((b) => <option key={b.id} value={b.id}>{b.batchNo ?? `#${b.id}`} · {b.expiryDate ? f.date(b.expiryDate) : '—'} · {f.qty(b.qtyRemaining)}</option>)}
            </select>
          </Field>
        )}
        <Field label={t('inventory.reason')}>
          <div className="mb-2 flex flex-wrap gap-2">
            {reasons.map((r) => <button key={r} type="button" className="btn-secondary py-1 text-xs" onClick={() => setReason(t(`inventory.reasons.${r}`))}>{t(`inventory.reasons.${r}`)}</button>)}
          </div>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
