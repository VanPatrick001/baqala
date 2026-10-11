import { useTranslation } from 'react-i18next';
import type { Receipt as ReceiptData } from '../../api/types';
import { localName } from '../../lib/format';

const LOCALES: Record<string, string> = { en: 'en-US', ur: 'ur-PK-u-nu-latn', ar: 'ar-u-nu-latn' };

/**
 * Ticket de caisse imprimable (58/80 mm). Il est rendu dans la langue choisie
 * au moment de la vente (receipt.language), indépendamment de la langue de l'écran.
 */
export function Receipt({ receipt, lang }: { receipt: ReceiptData; lang?: string }) {
  const { i18n } = useTranslation();
  const lng = lang ?? receipt.language ?? 'en';
  const t = i18n.getFixedT(lng);
  const dir = lng === 'en' ? 'ltr' : 'rtl';
  const nf = new Intl.NumberFormat(LOCALES[lng], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const m = (n: number) => nf.format(n);
  const q = (n: number) => new Intl.NumberFormat(LOCALES[lng], { maximumFractionDigits: 3 }).format(n);

  return (
    <div dir={dir} lang={lng} className="receipt-print mx-auto bg-white p-3 text-slate-900" style={{ width: `${receipt.store.widthMm || 80}mm`, maxWidth: '100%' }}>
      <div className="text-center">
        <div className="text-base font-bold">{receipt.store.name}</div>
        {receipt.store.address && <div>{receipt.store.address}</div>}
        {receipt.store.phone && <div className="num">{receipt.store.phone}</div>}
        {receipt.store.taxNumber && <div>{t('receipt.taxNumber')}: <span className="num">{receipt.store.taxNumber}</span></div>}
      </div>
      <div className="my-2 border-t border-dashed border-slate-400" />
      <div className="flex justify-between"><span>{t('receipt.number')}</span><span className="num">{receipt.receiptNo}</span></div>
      <div className="flex justify-between"><span>{t('receipt.date')}</span><span className="num">{receipt.createdAt}</span></div>
      <div className="flex justify-between"><span>{t('receipt.cashier')}</span><span>{receipt.cashier}</span></div>
      {receipt.customerName && <div className="flex justify-between"><span>{t('receipt.customer')}</span><span>{receipt.customerName}</span></div>}
      {receipt.status === 'VOIDED' && <div className="my-1 text-center text-sm font-bold">*** {t('receipt.voided')} ***</div>}
      <div className="my-2 border-t border-dashed border-slate-400" />
      {receipt.items.map((it) => (
        <div key={it.id} className="mb-1">
          <div className="font-semibold">{localName(lng, it.productName, it.translations)}</div>
          <div className="flex justify-between">
            <span className="num">{q(it.quantity)} × {m(it.unitPrice)}{it.discount > 0 ? ` − ${m(it.discount)}` : ''}</span>
            <span className="num">{m(it.lineTotal)}</span>
          </div>
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-slate-400" />
      <Row label={t('receipt.subtotal')} value={m(receipt.subtotal)} />
      {receipt.taxes.map((tx) => (
        <Row key={tx.code} label={`${localName(lng, tx.name, tx.translations)} ${tx.type === 'PERCENT' ? `${tx.rate}%` : ''}`} value={m(tx.amount)} />
      ))}
      {receipt.discountTotal > 0 && <Row label={t('receipt.discount')} value={m(receipt.discountTotal)} />}
      <div className="mt-1 flex justify-between text-base font-bold"><span>{t('receipt.total')}</span><span className="num">{m(receipt.total)} {receipt.store.currency}</span></div>
      <div className="my-2 border-t border-dashed border-slate-400" />
      {receipt.payments.map((p, i) => <Row key={i} label={t(`paymentMethods.${p.method}`)} value={m(p.amount)} />)}
      {receipt.changeDue > 0 && <Row label={t('receipt.change')} value={m(receipt.changeDue)} bold />}
      {receipt.payments.some((p) => p.method === 'CREDIT') && receipt.customerBalance != null && (
        <Row label={t('receipt.customerBalance')} value={m(receipt.customerBalance)} />
      )}
      <div className="mt-3 text-center">{receipt.store.footer || t('receipt.thanks')}</div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? 'font-bold' : ''}`}><span>{label}</span><span className="num">{value}</span></div>;
}

/** Imprime le ticket au format rouleau thermique. */
export function printReceipt(widthMm = 80) {
  const style = document.createElement('style');
  style.textContent = `@page { size: ${widthMm}mm auto; margin: 2mm; }`;
  document.head.appendChild(style);
  document.body.classList.add('printing-receipt');
  document.body.style.setProperty('--receipt-width', `${widthMm}mm`);
  window.print();
  setTimeout(() => {
    style.remove();
    document.body.classList.remove('printing-receipt');
  }, 500);
}
