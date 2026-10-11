import { describe, expect, it } from 'vitest';
import { evaluateRules, type AgentData } from '../src/modules/agent/domain/rules.js';

const base: AgentData = {
  customers: [],
  closedSessions: [],
  products: [],
  settings: { pricesIncludeTax: true, minMarginPct: 5, cashToleranceAbs: 200, cashTolerancePct: 0.5 },
};

describe('Smart Agent TypeScript rules', () => {
  it('flags customers above 80% of their credit limit', () => {
    const alerts = evaluateRules({
      ...base,
      customers: [
        { id: 1, fullName: 'A', balance: 900, creditLimit: 1000 },
        { id: 2, fullName: 'B', balance: 1200, creditLimit: 1000 },
        { id: 3, fullName: 'C', balance: 100, creditLimit: 1000 },
      ],
    });
    expect(alerts.map((a) => [a.key, a.severity])).toEqual([
      ['CREDIT:1', 'WARNING'],
      ['CREDIT:2', 'CRITICAL'],
    ]);
  });

  it('flags cash discrepancies beyond tolerance', () => {
    const alerts = evaluateRules({
      ...base,
      closedSessions: [
        { id: 1, closedAt: '', difference: -861, salesTotal: 5691, closedBy: 'x' },
        { id: 2, closedAt: '', difference: 50, salesTotal: 5000, closedBy: 'x' },
      ],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ key: 'CASHDIFF:1', severity: 'CRITICAL' });
  });

  it('flags products sold below cost + minimum margin and suggests a price', () => {
    const alerts = evaluateRules({
      ...base,
      products: [
        { id: 1, name: 'Below cost', salePrice: 100, avgCost: 120, taxPct: 0, fixedTaxPerUnit: 0 },
        { id: 2, name: 'Healthy', salePrice: 150, avgCost: 100, taxPct: 0, fixedTaxPerUnit: 0 },
        { id: 3, name: 'Thin with VAT', salePrice: 118, avgCost: 98, taxPct: 18, fixedTaxPerUnit: 0 },
      ],
    });
    expect(alerts.map((a) => a.key)).toEqual(['MARGIN:1', 'MARGIN:3']);
    expect(alerts[0].severity).toBe('CRITICAL');
    // 98 / 0.95 * 1.18 = 121.73
    expect(alerts[1].payload.suggestedPrice).toBe(121.73);
  });
});
