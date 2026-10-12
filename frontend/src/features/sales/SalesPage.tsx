import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorKey, type Page } from '../../api/client';
import { get } from '../../api/hooks';
import type { Receipt as ReceiptData } from '../../api/types';
import { useNavigate } from 'react-router-dom';
import type { Product } from '../../api/types';
import { useAuth, useCan } from '../../stores/auth';
import { useCart } from '../../stores/cart';
import { toast } from '../../stores/toast';
import { daysAgo, today, useFormat } from '../../lib/format';
import { Badge, DateRange, Empty, Loading, Modal, PageHeader, Pagination } from '../../components/ui';
import { Receipt, printReceipt } from '../pos/Receipt';
import { LANGUAGES } from '../../i18n';

export function SalesPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [range, setRange] = useState({ from: daysAgo(6), to: today() });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['sales', range, search, status, page],
    queryFn: () => get<Page<any> & { amount: number }>('/sales', { ...range, search: search || undefined, status: status || undefined, page, pageSize: 30 }),
  });
  return (
    <div>
      <PageHeader title={t('sales.title')} subtitle={data ? t('sales.summary', { count: data.total, amount: f.money(data.amount) }) : undefined}
        actions={<DateRange from={range.from} to={range.to} onChange={(from, to) => { setRange({ from, to }); setPage(1); }} />} />
      <div className="card">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3">
          <input className="input max-w-xs" placeholder={t('sales.searchPlaceholder')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.allStatuses')}</option>
            <option value="COMPLETED">{t('sales.status.COMPLETED')}</option>
            <option value="VOIDED">{t('sales.status.VOIDED')}</option>
          </select>
        </div>
        {isLoading ? <Loading /> : !data?.rows.length ? <Empty /> : (
          <table className="table">
            <thead><tr><th>{t('sales.receipt')}</th><th>{t('common.date')}</th><th>{t('sales.cashier')}</th><th>{t('sales.customer')}</th><th>{t('sales.methods')}</th><th className="text-end">{t('sales.items')}</th><th className="text-end">{t('pos.tax')}</th><th className="text-end">{t('common.total')}</th><th>{t('common.status')}</th></tr></thead>
            <tbody>
              {data.rows.map((s) => (
                <tr key={s.id} className="cursor-pointer" onClick={() => setOpenId(s.id)}>
                  <td className="num font-semibold text-brand-800">{s.receiptNo}</td>
                  <td className="num text-xs">{f.dateTime(s.createdAt)}</td>
                  <td>{s.cashier}</td>
                  <td>{s.customerName ?? '—'}</td>
                  <td className="text-xs">{String(s.methods ?? '').split(',').filter(Boolean).map((m) => t(`paymentMethods.${m}`)).join(' + ')}</td>
                  <td className="text-end num">{s.itemCount}</td>
                  <td className="text-end num">{f.money(s.taxTotal)}</td>
                  <td className="text-end num font-semibold">{f.money(s.total)}</td>
                  <td><Badge color={s.status === 'COMPLETED' ? 'green' : 'red'}>{t(`sales.status.${s.status}`)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} pageSize={30} total={data?.total ?? 0} onChange={setPage} />
      </div>
      {openId && <SaleDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function SaleDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useAuth((s) => s.user);
  const canVoidAny = useCan('sales.void');
  const canVoidOwn = useCan('sales.void_own');
  const canPos = useCan('pos.use');
  const { data } = useQuery({ queryKey: ['sale', id], queryFn: () => get<ReceiptData>(`/sales/${id}`) });
  // Manager / administrateur : toujours. Vendeur : ses propres ventes de moins de 24 h.
  const within24h = !!data && data.ageMinutes < 24 * 60;
  const canVoid = !!data && (canVoidAny || (canVoidOwn && data.userId === me?.id && within24h));
  const tooOld = !!data && !canVoidAny && canVoidOwn && data.status === 'COMPLETED' && data.userId === me?.id && !within24h;
  const [correct, setCorrect] = useState(false);
  const [lang, setLang] = useState<string | undefined>();
  const [reason, setReason] = useState('');
  const [voiding, setVoiding] = useState(false);
  const voidSale = useMutation({
    mutationFn: () => api.post(`/sales/${id}/void`, { reason }),
    onSuccess: async () => {
      toast.success('sales.voidedOk');
      ['sales', 'sale', 'session', 'pos-catalog'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setVoiding(false);
      if (correct && data) {
        // Correction : la vente annulée revient dans le panier, à modifier puis encaisser à nouveau
        const catalog = await qc.fetchQuery({ queryKey: ['pos-catalog'], queryFn: () => get<Page<Product>>('/products', { active: 'true', pageSize: 500 }) });
        const cart = useCart.getState();
        cart.clear();
        for (const it of data.items) {
          const p = catalog.rows.find((x) => x.id === it.productId);
          if (!p) continue;
          cart.add(p, it.quantity);
          if (it.discount) cart.setDiscount(p.id, it.discount);
        }
        cart.setCustomer(data.customerId ?? null);
        navigate('/pos');
      }
    },
    onError: (e) => toast.error(errorKey(e)),
  });
  return (
    <Modal open onClose={onClose} title={data?.receiptNo ?? ''} size="sm"
      footer={
        <>
          {canVoid && data?.status === 'COMPLETED' && <>
            <button className="btn-ghost text-red-600" onClick={() => { setCorrect(false); setVoiding(true); }}>{t('sales.void')}</button>
            {canPos && <button className="btn-secondary" onClick={() => { setCorrect(true); setVoiding(true); }}>{t('sales.correct')}</button>}
          </>}
          <button className="btn-primary" onClick={() => printReceipt(data?.store.widthMm)}>{t('pos.printReceipt')}</button>
        </>
      }>
      {data && (
        <>
          <div className="mb-2 flex justify-center gap-1 text-xs">
            {t('sales.receiptLanguage')}:
            {LANGUAGES.map((l) => <button key={l.code} className={(lang ?? data.language) === l.code ? 'font-bold text-brand-800 underline' : 'text-slate-500'} onClick={() => setLang(l.code)}>{l.label}</button>)}
          </div>
          <div className="print-area rounded border border-slate-200"><Receipt receipt={data} lang={lang} /></div>
          {tooOld && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{t('sales.lockedAfter24h')}</p>}
          {data.status === 'VOIDED' && <p className="mt-2 text-sm text-red-700">{t('sales.voidReason')}: {data.voidReason}</p>}
          {voiding && (
            <div className="mt-3 space-y-2 rounded-lg bg-red-50 p-3">
              {correct && <p className="text-sm text-slate-700">{t('sales.correctHint')}</p>}
              <input className="input" placeholder={t('sales.voidReason')} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              <button className="btn-danger w-full" disabled={reason.trim().length < 3 || voidSale.isPending} onClick={() => voidSale.mutate()}>{correct ? t('sales.confirmCorrect') : t('sales.confirmVoid')}</button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
