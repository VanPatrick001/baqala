import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Barcode, Minus, Plus, ScanLine, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { api, errorKey, type Page } from '../../api/client';
import { get, useCategories, useCustomers, useSettings } from '../../api/hooks';
import type { CashSession, Product, Receipt as ReceiptData } from '../../api/types';
import { useCart } from '../../stores/cart';
import { toast } from '../../stores/toast';
import { useFormat } from '../../lib/format';
import { applyPromotion, computeCart } from '../../lib/cart';
import { Badge, Field, Loading, Modal, NumberInput } from '../../components/ui';
import { PaymentModal } from './PaymentModal';
import { Receipt, printReceipt } from './Receipt';

const REGISTER_ID = 1;

export function PosPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: session, isLoading } = useQuery({
    queryKey: ['session', REGISTER_ID],
    queryFn: () => get<CashSession | null>('/cash/sessions/current', { registerId: REGISTER_ID }),
  });

  if (isLoading) return <Loading />;
  if (!session) return <OpenSession onOpened={() => qc.invalidateQueries({ queryKey: ['session'] })} />;
  return <Till session={session} />;
}

function OpenSession({ onOpened }: { onOpened: () => void }) {
  const { t } = useTranslation();
  const [float, setFloat] = useState(0);
  const open = useMutation({
    mutationFn: () => api.post('/cash/sessions/open', { registerId: REGISTER_ID, openingFloat: float }),
    onSuccess: () => { toast.success('cash.sessionOpened'); onOpened(); },
    onError: (e) => toast.error(errorKey(e)),
  });
  return (
    <div className="mx-auto mt-10 max-w-sm card p-6 text-center">
      <ScanLine className="mx-auto mb-3 text-brand-700" size={36} />
      <h2 className="mb-1 text-lg font-bold">{t('pos.noSession')}</h2>
      <p className="mb-4 text-sm text-slate-500">{t('pos.openSessionHint')}</p>
      <Field label={t('cash.openingFloat')}><NumberInput value={float} onChange={setFloat} min={0} /></Field>
      <button className="btn-primary mt-4 w-full" onClick={() => open.mutate()} disabled={open.isPending}>{t('cash.openSession')}</button>
    </div>
  );
}

function Till({ session }: { session: CashSession }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const { data: categories } = useCategories();
  const cart = useCart();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const pricesIncludeTax = settings?.prices_include_tax !== false;

  // Catalogue complet chargé une fois : filtrage instantané côté client
  const { data: catalog } = useQuery({
    queryKey: ['pos-catalog'],
    queryFn: () => get<Page<Product>>('/products', { active: 'true', pageSize: 500 }),
    staleTime: 30_000,
  });
  const { data: customers } = useCustomers();
  const customer = customers?.find((c) => c.id === cart.customerId) ?? null;

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (catalog?.rows ?? []).filter((p) => {
      if (categoryId && p.categoryId !== categoryId) return false;
      if (!s) return true;
      return [p.name, p.sku, p.barcode ?? '', ...Object.values(p.translations ?? {})].some((v) => String(v).toLowerCase().includes(s));
    });
  }, [catalog, search, categoryId]);

  // Raccourcis clavier : F2 = recherche, F9 = encaisser, Échap = vider la recherche
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); scanRef.current?.focus(); }
      if (e.key === 'F9' && cart.lines.length) { e.preventDefault(); setPaying(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cart.lines.length]);

  useEffect(() => { scanRef.current?.focus(); }, []);

  const unitPrice = (p: Product) => applyPromotion(p.salePrice, p.promotion);
  const totals = computeCart(
    cart.lines.map((l) => ({ qty: l.qty, unitPrice: unitPrice(l.product), discount: l.discount, taxes: l.product.taxes ?? [] })),
    pricesIncludeTax,
  );

  const addProduct = (p: Product) => {
    if (p.stockQty <= 0 && !settings?.allow_negative_stock) toast.info('pos.outOfStockWarning', { name: f.name(p.name, p.translations) });
    cart.add(p);
  };

  /** Lecteur code-barres : il "tape" le code puis Entrée. */
  const onScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = search.trim();
    if (!code) return;
    const local = catalog?.rows.find((p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase());
    if (local) {
      addProduct(local);
      setSearch('');
      return;
    }
    if (filtered.length === 1) {
      addProduct(filtered[0]);
      setSearch('');
      return;
    }
    try {
      const { data } = await api.get<Product>('/products/lookup', { params: { code } });
      addProduct(data);
      setSearch('');
    } catch {
      if (!filtered.length) toast.error('pos.productNotFound', { code });
    }
  };

  // Vente croisée : produits souvent achetés avec ceux du panier
  const ids = cart.lines.map((l) => l.product.id).sort().join(',');
  const { data: suggestions } = useQuery({
    queryKey: ['xsell', ids],
    queryFn: () => get<{ associatedId: number; associatedName: string; translations: any; confidence: number }[]>('/agent/associations', { productIds: ids, limit: 4 }),
    enabled: !!ids,
  });

  const onPaid = (r: ReceiptData) => {
    setPaying(false);
    setReceipt(r);
    cart.clear();
    qc.invalidateQueries({ queryKey: ['pos-catalog'] });
    qc.invalidateQueries({ queryKey: ['session'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
  };

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      {/* Catalogue */}
      <section className="flex min-h-0 min-w-0 flex-col">
        <form onSubmit={onScan} className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Barcode size={18} className="absolute top-2.5 start-3 text-slate-400" />
            <input
              ref={scanRef}
              className="input ps-10 text-base"
              placeholder={t('pos.scanPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="hidden items-center text-xs text-slate-400 md:flex">F2 · F9</span>
        </form>
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <button className={clsx('btn shrink-0 whitespace-nowrap py-1', !categoryId ? 'bg-brand-700 text-white' : 'btn-secondary')} onClick={() => setCategoryId(null)}>{t('common.all')}</button>
          {categories?.filter((c) => c.isActive).map((c) => (
            <button key={c.id} className={clsx('btn shrink-0 whitespace-nowrap py-1', categoryId === c.id ? 'bg-brand-700 text-white' : 'btn-secondary')} onClick={() => setCategoryId(c.id)}>
              {f.name(c.name, c.translations)}
            </button>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => addProduct(p)} className={clsx('card relative flex flex-col items-start p-3 text-start transition hover:border-brand-500 hover:shadow', p.stockQty <= 0 && 'opacity-60')}>
              {p.promotion && <span className="absolute top-2 end-2"><Badge color="red">-{p.promotion.type === 'PERCENT' ? `${p.promotion.value}%` : f.money(p.promotion.value)}</Badge></span>}
              <span className="line-clamp-2 text-sm font-semibold text-slate-800">{f.name(p.name, p.translations)}</span>
              <span className="mt-auto pt-2 text-base font-bold text-brand-800 num">{f.money(unitPrice(p))}</span>
              <span className={clsx('text-xs num', p.stockStatus === 'OK' ? 'text-slate-400' : 'text-red-600')}>{t('pos.inStock')}: {f.qty(p.stockQty)} {p.unitCode}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Panier */}
      <section className="card flex min-h-0 flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 p-3">
          <button className="btn-secondary py-1.5" onClick={() => setCustomerOpen(true)}>
            <UserRound size={16} /> {customer && !customer.isWalkIn ? customer.fullName : t('pos.walkIn')}
          </button>
          <span className="text-xs text-slate-500">{t('pos.session')} #<span className="num">{session.id}</span></span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {cart.lines.length === 0 && <div className="p-10 text-center text-sm text-slate-400">{t('pos.emptyCart')}</div>}
          {cart.lines.map((l, i) => {
            const r = totals.lines[i];
            const allowDecimal = !!l.product.allowsDecimal;
            return (
              <div key={l.product.id} className="border-b border-slate-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{f.name(l.product.name, l.product.translations)}</div>
                    <div className="text-xs text-slate-500 num">{f.money(unitPrice(l.product))} / {l.product.unitCode}</div>
                  </div>
                  <div className="text-sm font-bold num">{f.money(r.total)}</div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button className="btn-secondary p-1" onClick={() => cart.setQty(l.product.id, l.qty - 1)}><Minus size={14} /></button>
                  <input
                    className="input w-20 py-1 text-center num"
                    type="number"
                    step={allowDecimal ? '0.001' : '1'}
                    value={l.qty}
                    onChange={(e) => cart.setQty(l.product.id, allowDecimal ? Number(e.target.value) : Math.round(Number(e.target.value)))}
                  />
                  <button className="btn-secondary p-1" onClick={() => cart.setQty(l.product.id, l.qty + 1)}><Plus size={14} /></button>
                  <label className="ms-auto flex items-center gap-1 text-xs text-slate-500">
                    {t('pos.discount')}
                    <input className="input w-20 py-1 num" type="number" min={0} value={l.discount || ''} onChange={(e) => cart.setDiscount(l.product.id, Number(e.target.value))} />
                  </label>
                  <button className="btn-ghost p-1 text-red-600" onClick={() => cart.remove(l.product.id)} aria-label={t('common.delete')}><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
          {!!suggestions?.length && (
            <div className="p-3">
              <div className="mb-2 flex items-center gap-1 text-xs font-semibold text-violet-700"><Sparkles size={14} /> {t('pos.oftenBoughtWith')}</div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => {
                  const p = catalog?.rows.find((x) => x.id === s.associatedId);
                  return p ? (
                    <button key={s.associatedId} className="btn-secondary py-1 text-xs" onClick={() => addProduct(p)}>
                      <Plus size={12} /> {f.name(s.associatedName, s.translations)}
                    </button>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-1 border-t border-slate-200 p-3 text-sm">
          <Line label={t('pos.subtotal')} value={f.money(totals.subtotal)} />
          <Line label={t('pos.tax')} value={f.money(totals.tax)} />
          {totals.discount > 0 && <Line label={t('pos.discount')} value={`− ${f.money(totals.discount)}`} />}
          <div className="flex items-center justify-between pt-1 text-xl font-extrabold"><span>{t('pos.total')}</span><span className="num">{f.money(totals.total)}</span></div>
          <div className="flex gap-2 pt-2">
            <button className="btn-secondary" disabled={!cart.lines.length} onClick={() => cart.clear()}><X size={16} /> {t('pos.clear')}</button>
            <button className="btn-primary flex-1 py-3 text-base" disabled={!cart.lines.length} onClick={() => setPaying(true)}>{t('pos.pay')} (F9)</button>
          </div>
        </div>
      </section>

      {paying && (
        <PaymentModal
          total={totals.total}
          sessionId={session.id}
          customer={customer && !customer.isWalkIn ? customer : null}
          language={i18n.language}
          onClose={() => setPaying(false)}
          onPaid={onPaid}
        />
      )}

      <CustomerPicker open={customerOpen} onClose={() => setCustomerOpen(false)} />

      <Modal
        open={!!receipt}
        onClose={() => { setReceipt(null); scanRef.current?.focus(); }}
        title={t('pos.saleCompleted')}
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => { setReceipt(null); scanRef.current?.focus(); }}>{t('pos.newSale')}</button>
            <button className="btn-primary" onClick={() => printReceipt(receipt?.store.widthMm)}>{t('pos.printReceipt')}</button>
          </>
        }
      >
        {receipt && (
          <>
            {receipt.changeDue > 0 && (
              <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-center">
                <div className="text-xs font-semibold text-emerald-700">{t('pos.changeDue')}</div>
                <div className="text-3xl font-extrabold text-emerald-800 num">{f.money(receipt.changeDue)}</div>
              </div>
            )}
            <div className="print-area rounded border border-slate-200"><Receipt receipt={receipt} /></div>
          </>
        )}
      </Modal>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-slate-600"><span>{label}</span><span className="num">{value}</span></div>;
}

function CustomerPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const { data: customers } = useCustomers(search);
  const setCustomer = useCart((s) => s.setCustomer);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const create = useMutation({
    mutationFn: () => api.post<{ id: number }>('/customers', { fullName: newName, phone: newPhone || null }),
    onSuccess: ({ data }) => { setCustomer(data.id); qc.invalidateQueries({ queryKey: ['customers'] }); setNewName(''); setNewPhone(''); onClose(); },
    onError: (e) => toast.error(errorKey(e)),
  });
  return (
    <Modal open={open} onClose={onClose} title={t('pos.selectCustomer')} size="md">
      <input className="input mb-3" placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {customers?.map((c) => (
          <button key={c.id} className="flex w-full items-center justify-between p-2.5 text-start text-sm hover:bg-slate-50" onClick={() => { setCustomer(c.isWalkIn ? null : c.id); onClose(); }}>
            <span>
              <span className="font-semibold">{c.isWalkIn ? t('pos.walkIn') : c.fullName}</span>
              {c.phone && <span className="ms-2 text-xs text-slate-500 num">{c.phone}</span>}
            </span>
            {c.creditLimit > 0 && <span className="text-xs text-slate-500">{t('customers.balance')}: <span className="num">{f.money(c.balance)}</span> / <span className="num">{f.money(c.creditLimit)}</span></span>}
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        <div className="mb-2 text-xs font-semibold text-slate-600">{t('customers.new')}</div>
        <div className="flex gap-2">
          <input className="input" placeholder={t('customers.fullName')} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className="input w-36" placeholder={t('customers.phone')} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <button className="btn-primary" disabled={!newName || create.isPending} onClick={() => create.mutate()}>{t('common.add')}</button>
        </div>
      </div>
    </Modal>
  );
}
