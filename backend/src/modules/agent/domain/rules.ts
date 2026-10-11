/**
 * Moteur de règles TypeScript du Smart Agent (couche domaine, sans I/O).
 *
 * Les règles "lourdes" sur les volumes (vélocité, péremption, paniers) tournent en SQL
 * (sp_agent_rule_*). Ce moteur ajoute des règles métier qui s'écrivent plus naturellement
 * en code et se testent unitairement. Ajouter une règle = ajouter un objet à RULES.
 */

export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertType = 'ANOMALY' | 'CREDIT_RISK' | 'PROMOTION' | 'REORDER';

export interface AlertDraft {
  type: AlertType;
  severity: Severity;
  productId?: number | null;
  key: string; // clé de déduplication (préfixée 'APP:' par le moteur)
  messageKey: string; // clé i18n
  payload: Record<string, unknown>;
  score: number;
}

export interface AgentData {
  customers: { id: number; fullName: string; balance: number; creditLimit: number }[];
  closedSessions: { id: number; closedAt: string; difference: number; salesTotal: number; closedBy: string }[];
  products: { id: number; name: string; salePrice: number; avgCost: number; taxPct: number; fixedTaxPerUnit: number }[];
  settings: { pricesIncludeTax: boolean; minMarginPct: number; cashToleranceAbs: number; cashTolerancePct: number };
}

export interface Rule {
  id: string;
  evaluate(data: AgentData): AlertDraft[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Clients proches ou au-delà de leur plafond de crédit. */
export const creditRiskRule: Rule = {
  id: 'credit-risk',
  evaluate: ({ customers }) =>
    customers
      .filter((c) => c.creditLimit > 0 && c.balance >= 0.8 * c.creditLimit)
      .map((c) => {
        const usage = c.balance / c.creditLimit;
        return {
          type: 'CREDIT_RISK',
          severity: usage >= 1 ? 'CRITICAL' : 'WARNING',
          key: `CREDIT:${c.id}`,
          messageKey: 'agent.creditRisk',
          payload: { customerId: c.id, customer: c.fullName, balance: c.balance, limit: c.creditLimit, usagePct: Math.round(usage * 100) },
          score: Math.min(90, 50 + usage * 30),
        };
      }),
};

/** Écarts de caisse significatifs sur les sessions clôturées récentes. */
export const cashDiscrepancyRule: Rule = {
  id: 'cash-discrepancy',
  evaluate: ({ closedSessions, settings }) =>
    closedSessions
      .filter((s) => Math.abs(s.difference) > Math.max(settings.cashToleranceAbs, (s.salesTotal * settings.cashTolerancePct) / 100))
      .map((s) => ({
        type: 'ANOMALY',
        severity: s.difference < 0 ? 'CRITICAL' : 'WARNING',
        key: `CASHDIFF:${s.id}`,
        messageKey: 'agent.anomaly.cashDiscrepancy',
        payload: { sessionId: s.id, difference: s.difference, closedAt: s.closedAt, user: s.closedBy, salesTotal: s.salesTotal },
        score: Math.min(95, 60 + Math.abs(s.difference) / 100),
      })),
};

/** Produits dont le prix de vente HT ne couvre plus le coût + marge minimale. */
export const marginErosionRule: Rule = {
  id: 'margin-erosion',
  evaluate: ({ products, settings }) =>
    products
      .filter((p) => p.avgCost > 0 && p.salePrice > 0)
      .map((p) => {
        const net = settings.pricesIncludeTax ? (p.salePrice - p.fixedTaxPerUnit) / (1 + p.taxPct / 100) : p.salePrice;
        const marginPct = ((net - p.avgCost) / net) * 100;
        return { p, net, marginPct };
      })
      .filter(({ marginPct }) => marginPct < settings.minMarginPct)
      .map(({ p, net, marginPct }) => ({
        type: 'ANOMALY',
        severity: marginPct < 0 ? 'CRITICAL' : 'WARNING',
        productId: p.id,
        key: `MARGIN:${p.id}`,
        messageKey: 'agent.anomaly.lowMargin',
        payload: {
          product: p.name,
          salePrice: p.salePrice,
          netPrice: round2(net),
          avgCost: round2(p.avgCost),
          marginPct: round2(marginPct),
          minMarginPct: settings.minMarginPct,
          suggestedPrice: round2(
            (p.avgCost / (1 - settings.minMarginPct / 100)) * (settings.pricesIncludeTax ? 1 + p.taxPct / 100 : 1) +
              (settings.pricesIncludeTax ? p.fixedTaxPerUnit : 0),
          ),
        },
        score: marginPct < 0 ? 80 : 55,
      })),
};

export const RULES: Rule[] = [creditRiskRule, cashDiscrepancyRule, marginErosionRule];

export function evaluateRules(data: AgentData, rules: Rule[] = RULES): AlertDraft[] {
  return rules.flatMap((r) => r.evaluate(data));
}
