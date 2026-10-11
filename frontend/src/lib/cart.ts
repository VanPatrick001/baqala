// Copie du domaine backend (backend/src/modules/pos/domain/cart.ts) pour l'aperçu instantané en caisse.
// Le total définitif est toujours calculé par sp_pos_checkout côté base.
/**
 * Calculs de panier purs (sans I/O), identiques à sp_pos_checkout.
 * Utilisés pour l'aperçu en caisse et couverts par les tests unitaires.
 * La base reste la source de vérité au moment de l'encaissement.
 */

export interface TaxRule {
  type: 'PERCENT' | 'FIXED';
  rate: number;
  appliesTo?: 'SALES' | 'PURCHASES' | 'BOTH';
}

export interface CartLineInput {
  qty: number;
  unitPrice: number;
  discount?: number;
  taxes: TaxRule[];
}

export interface CartLineResult {
  gross: number;
  net: number;
  tax: number;
  total: number;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeLine(line: CartLineInput, pricesIncludeTax: boolean): CartLineResult {
  const taxes = line.taxes.filter((t) => t.appliesTo !== 'PURCHASES');
  const pct = taxes.filter((t) => t.type === 'PERCENT').reduce((s, t) => s + t.rate, 0);
  const fixedPerUnit = taxes.filter((t) => t.type === 'FIXED').reduce((s, t) => s + t.rate, 0);
  const gross = round2(line.qty * line.unitPrice - (line.discount ?? 0));

  let base = pricesIncludeTax ? round2((gross - line.qty * fixedPerUnit) / (1 + pct / 100)) : gross;
  const tax = taxes.reduce(
    (s, t) => s + (t.type === 'PERCENT' ? round2((base * t.rate) / 100) : round2(line.qty * t.rate)),
    0,
  );
  if (pricesIncludeTax) {
    // Le prix affiché reste exact : l'arrondi est absorbé par la base HT
    base = round2(gross - tax);
    return { gross, net: base, tax: round2(tax), total: gross };
  }
  return { gross, net: base, tax: round2(tax), total: round2(base + tax) };
}

export function computeCart(lines: CartLineInput[], pricesIncludeTax: boolean) {
  const results = lines.map((l) => computeLine(l, pricesIncludeTax));
  return {
    lines: results,
    subtotal: round2(results.reduce((s, r) => s + r.net, 0)),
    discount: round2(lines.reduce((s, l) => s + (l.discount ?? 0), 0)),
    tax: round2(results.reduce((s, r) => s + r.tax, 0)),
    total: round2(results.reduce((s, r) => s + r.total, 0)),
  };
}

export type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE' | 'CREDIT';

/** Rendu monnaie : seules les espèces peuvent dépasser le total. */
export function computeChange(total: number, payments: { method: PaymentMethod; amount: number }[]) {
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  const cash = round2(payments.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amount, 0));
  const change = round2(Math.max(0, paid - total));
  return {
    paid,
    remaining: round2(Math.max(0, total - paid)),
    change,
    valid: paid >= total && change <= cash,
  };
}

/** Prix après promotion active (PERCENT ou FIXED). */
export function applyPromotion(price: number, promo?: { type: 'PERCENT' | 'FIXED'; value: number } | null): number {
  if (!promo) return price;
  return promo.type === 'PERCENT' ? round2(price * (1 - promo.value / 100)) : Math.max(0, round2(price - promo.value));
}
