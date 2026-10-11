import { describe, expect, it } from 'vitest';
import { applyPromotion, computeCart, computeChange, computeLine } from '../src/modules/pos/domain/cart.js';

const VAT18 = { type: 'PERCENT' as const, rate: 18 };
const EXCISE20 = { type: 'PERCENT' as const, rate: 20 };

describe('computeLine', () => {
  it('extracts tax from tax-inclusive prices and keeps the shelf price exact', () => {
    // Même cas que la vente de démo : 2 colas à 180 TTC avec TVA 18 % + accise 20 %
    const r = computeLine({ qty: 2, unitPrice: 180, taxes: [VAT18, EXCISE20] }, true);
    expect(r).toEqual({ gross: 360, net: 260.87, tax: 99.13, total: 360 });
  });

  it('adds tax on top of tax-exclusive prices', () => {
    const r = computeLine({ qty: 12, unitPrice: 950, taxes: [{ type: 'PERCENT', rate: 5 }] }, false);
    expect(r).toEqual({ gross: 11400, net: 11400, tax: 570, total: 11970 });
  });

  it('applies fixed per-unit levies and line discounts', () => {
    const r = computeLine({ qty: 3, unitPrice: 100, discount: 30, taxes: [{ type: 'FIXED', rate: 5 }] }, false);
    expect(r).toEqual({ gross: 270, net: 270, tax: 15, total: 285 });
  });

  it('ignores purchase-only taxes at the till', () => {
    const r = computeLine({ qty: 1, unitPrice: 100, taxes: [{ type: 'PERCENT', rate: 10, appliesTo: 'PURCHASES' }] }, true);
    expect(r.tax).toBe(0);
  });
});

describe('computeCart / computeChange', () => {
  it('sums lines', () => {
    const cart = computeCart(
      [
        { qty: 1, unitPrice: 1850, taxes: [{ type: 'PERCENT', rate: 5 }] },
        { qty: 2, unitPrice: 160, discount: 20, taxes: [{ type: 'PERCENT', rate: 5 }] },
      ],
      true,
    );
    expect(cart.total).toBe(2150);
    expect(cart.tax).toBe(102.39);
    expect(cart.discount).toBe(20);
  });

  it('gives change only from cash', () => {
    expect(computeChange(970, [{ method: 'CASH', amount: 1000 }])).toMatchObject({ change: 30, valid: true });
    expect(computeChange(220, [{ method: 'CARD', amount: 300 }]).valid).toBe(false);
    expect(computeChange(2150, [{ method: 'CASH', amount: 500 }, { method: 'CREDIT', amount: 1650 }])).toMatchObject({ remaining: 0, valid: true });
    expect(computeChange(100, [{ method: 'CASH', amount: 50 }])).toMatchObject({ remaining: 50, valid: false });
  });

  it('applies promotions', () => {
    expect(applyPromotion(150, { type: 'PERCENT', value: 50 })).toBe(75);
    expect(applyPromotion(150, { type: 'FIXED', value: 200 })).toBe(0);
    expect(applyPromotion(150, null)).toBe(150);
  });
});
