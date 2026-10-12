import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import { Banknote, CreditCard, HandCoins, Smartphone, Trash2 } from 'lucide-react';
import { api, errorKey } from '../../api/client';
import type { Customer, Receipt } from '../../api/types';
import { useCart } from '../../stores/cart';
import { useFormat } from '../../lib/format';
import { computeChange, round2, type PaymentMethod } from '../../lib/cart';
import { Modal, NumberInput } from '../../components/ui';
import { Keypad } from '../../components/Keypad';
import { useTouchScreen } from '../../lib/touch';

const METHODS: { method: PaymentMethod; icon: typeof Banknote }[] = [
  { method: 'CASH', icon: Banknote },
  { method: 'CARD', icon: CreditCard },
  { method: 'MOBILE', icon: Smartphone },
  { method: 'CREDIT', icon: HandCoins },
];

export function PaymentModal({
  total, sessionId, customer, language, onClose, onPaid,
}: { total: number; sessionId: number; customer: Customer | null; language: string; onClose: () => void; onPaid: (r: Receipt) => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const touch = useTouchScreen();
  const lines = useCart((s) => s.lines);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [amount, setAmount] = useState(total);
  const [reference, setReference] = useState('');
  const [tenders, setTenders] = useState<{ method: PaymentMethod; amount: number; reference?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const state = computeChange(total, tenders);
  // Sans paiement ajouté, « Confirmer » utilise directement le montant saisi
  const pending = tenders.length ? tenders : amount > 0 ? [{ method, amount: round2(amount), reference: reference || undefined }] : [];
  const pendingState = computeChange(total, pending);
  const pendingValid = pendingState.valid && !(method === 'CREDIT' && !customer && !tenders.length);
  const creditAvailable = customer ? Math.max(0, customer.creditLimit - customer.balance) : 0;

  const addTender = (m = method, a = amount) => {
    if (a <= 0) return;
    if (m === 'CREDIT' && !customer) return setError('errors.creditRequiresCustomer');
    if (m !== 'CASH' && a > state.remaining + 0.001) return setError('errors.overpaymentNonCash');
    setError(null);
    const next = [...tenders, { method: m, amount: round2(a), reference: reference || undefined }];
    setTenders(next);
    setReference('');
    setAmount(computeChange(total, next).remaining);
  };

  const checkout = useMutation({
    mutationFn: (payments: typeof tenders) =>
      api.post<Receipt>('/pos/checkout', {
        sessionId,
        customerId: customer?.id ?? null,
        language,
        items: lines.map((l) => ({ product_id: l.product.id, qty: l.qty, discount: l.discount })),
        payments,
      }),
    onSuccess: ({ data }) => onPaid(data),
    onError: (e) => setError(errorKey(e)),
  });

  // Paiement exact en un clic (cas le plus fréquent)
  const quickPay = (m: PaymentMethod, a: number) => checkout.mutate([...tenders, { method: m, amount: round2(a) }]);
  const remaining = state.remaining;
  const cashSuggestions = Array.from(new Set([remaining, Math.ceil(remaining / 10) * 10, Math.ceil(remaining / 100) * 100, Math.ceil(remaining / 500) * 500, Math.ceil(remaining / 1000) * 1000])).filter((v) => v > 0).slice(0, 5);

  return (
    <Modal
      open
      onClose={onClose}
      title={t('pos.payment')}
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary min-w-40" disabled={!pendingValid || checkout.isPending} onClick={() => checkout.mutate(pending)}>
            {t('pos.confirmPayment')}
          </button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <Box label={t('pos.total')} value={f.money(total)} />
        <Box label={t('pos.remaining')} value={f.money(remaining)} tone={remaining > 0 ? 'amber' : 'green'} />
        <Box label={t('pos.changeDue')} value={f.money(tenders.length ? state.change : pendingState.change)} tone="green" />
      </div>

      <div className="mb-3 grid grid-cols-4 gap-2">
        {METHODS.map(({ method: m, icon: Icon }) => (
          <button
            key={m}
            className={clsx('flex flex-col items-center gap-1 rounded-lg border p-2 text-xs font-semibold', method === m ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600')}
            onClick={() => { setMethod(m); setAmount(m === 'CREDIT' ? Math.min(remaining, creditAvailable) : remaining); }}
          >
            <Icon size={20} /> {t(`paymentMethods.${m}`)}
          </button>
        ))}
      </div>

      {method === 'CREDIT' && (
        <p className="mb-2 text-xs text-slate-600">
          {customer ? t('pos.creditAvailable', { amount: f.money(creditAvailable) }) : t('errors.creditRequiresCustomer')}
        </p>
      )}

      <div className="flex gap-2">
        <NumberInput value={amount} onChange={setAmount} min={0} className="text-lg" autoFocus={!touch} onKeyDown={(e) => { if (e.key !== 'Enter') return; if (!tenders.length && pendingValid) checkout.mutate(pending); else addTender(); }} />
        {(method === 'CARD' || method === 'MOBILE') && (
          <input className="input w-40" placeholder={t('pos.reference')} value={reference} onChange={(e) => setReference(e.target.value)} />
        )}
        <button className="btn-secondary whitespace-nowrap" onClick={() => addTender()}>{t('pos.addPayment')}</button>
      </div>

      {touch && (
        <Keypad
          value={amount}
          onChange={setAmount}
          enterLabel={tenders.length ? t('pos.addPayment') : t('pos.confirmPayment')}
          onEnter={() => { if (!tenders.length && pendingValid) checkout.mutate(pending); else addTender(); }}
        />
      )}

      {method === 'CASH' && remaining > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {cashSuggestions.map((v) => (
            <button key={v} className="btn-secondary py-1 num" onClick={() => (tenders.length ? addTender('CASH', v) : quickPay('CASH', v))}>{f.money(v)}</button>
          ))}
        </div>
      )}
      {method !== 'CASH' && method !== 'CREDIT' && remaining > 0 && tenders.length === 0 && (
        <button className="btn-primary mt-2 w-full" onClick={() => quickPay(method, remaining)} disabled={checkout.isPending}>
          {t('pos.payExact', { method: t(`paymentMethods.${method}`) })}
        </button>
      )}

      {tenders.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {tenders.map((p, i) => (
            <li key={i} className="flex items-center justify-between p-2 text-sm">
              <span>{t(`paymentMethods.${p.method}`)} {p.reference && <span className="text-xs text-slate-500">({p.reference})</span>}</span>
              <span className="flex items-center gap-2"><span className="num font-semibold">{f.money(p.amount)}</span>
                <button className="text-red-600" onClick={() => { const next = tenders.filter((_, j) => j !== i); setTenders(next); setAmount(computeChange(total, next).remaining); }}><Trash2 size={14} /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{t(error)}</div>}
    </Modal>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'green' }) {
  return (
    <div className={clsx('rounded-lg p-2', tone === 'amber' ? 'bg-amber-50' : tone === 'green' ? 'bg-emerald-50' : 'bg-slate-100')}>
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="text-lg font-bold num">{value}</div>
    </div>
  );
}
