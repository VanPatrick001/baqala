import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { BrainCircuit, Check, EyeOff, Play, ShoppingCart, Tag } from 'lucide-react';
import { api, errorKey } from '../../api/client';
import { get } from '../../api/hooks';
import type { SmartAlert } from '../../api/types';
import { useCan } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { useFormat } from '../../lib/format';
import { Badge, Empty, Loading, PageHeader, SeverityIcon, Tabs } from '../../components/ui';

const GROUPS: Record<string, string[]> = {
  all: [],
  stock: ['LOW_STOCK', 'OUT_OF_STOCK', 'REORDER'],
  expiry: ['NEAR_EXPIRY', 'EXPIRED'],
  anomalies: ['ANOMALY', 'CREDIT_RISK'],
  promotions: ['PROMOTION'],
  crossSell: ['CROSS_SELL'],
};

export function AgentPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const canManage = useCan('agent.manage');
  const canPurchase = useCan('purchases.manage');
  const [group, setGroup] = useState('all');
  const [selected, setSelected] = useState<number[]>([]);
  const { data: alerts, isLoading } = useQuery({ queryKey: ['alerts'], queryFn: () => get<SmartAlert[]>('/agent/alerts') });
  const { data: summary } = useQuery({ queryKey: ['agent-summary'], queryFn: () => get<any>('/agent/summary') });
  const { data: associations } = useQuery({ queryKey: ['associations'], queryFn: () => get<any[]>('/agent/associations', { limit: 15 }) });

  const refresh = () => ['alerts', 'agent-summary', 'products', 'pos-catalog', 'purchases'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const run = useMutation({ mutationFn: () => api.post('/agent/run'), onSuccess: () => { toast.success('agent.runDone'); refresh(); }, onError: (e) => toast.error(errorKey(e)) });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) => api.post(`/agent/alerts/${id}/${action}`),
    onSuccess: (_d, v) => { toast.success(v.action === 'accept-promotion' ? 'agent.promotionApplied' : v.action === 'apply-price' ? 'agent.priceApplied' : 'common.saved'); refresh(); },
    onError: (e) => toast.error(errorKey(e)),
  });
  const drafts = useMutation({
    mutationFn: (ids: number[]) => api.post<{ purchaseIds: number[] }>('/agent/reorder-drafts', { alertIds: ids }),
    onSuccess: ({ data }) => { toast.success('agent.draftsCreated', { count: data.purchaseIds.length }); setSelected([]); refresh(); navigate('/purchases'); },
    onError: (e) => toast.error(errorKey(e)),
  });

  const visible = (alerts ?? []).filter((a) => !GROUPS[group].length || GROUPS[group].includes(a.type));
  const count = (g: string) => (alerts ?? []).filter((a) => !GROUPS[g].length || GROUPS[g].includes(a.type)).length;
  const reorderIds = visible.filter((a) => a.type === 'REORDER' && a.status === 'NEW').map((a) => a.id);

  /** Message localisé : clé i18n + paramètres du payload (nom produit traduit si dispo). */
  const message = (a: SmartAlert) => {
    const p = a.payload;
    return t(a.messageKey, {
      ...p,
      product: a.translations ? f.name(p.product ?? '', a.translations) : p.product,
      stock: f.qty(p.stock), min: f.qty(p.min), qty: f.qty(p.qty), suggestedQty: f.qty(p.suggestedQty),
      valueAtRisk: f.money(p.valueAtRisk), estimatedCost: f.money(p.estimatedCost), suggestedPrice: f.money(p.suggestedPrice),
      currentPrice: f.money(p.currentPrice), loss: f.money(p.loss), amount: f.money(p.amount), balance: f.money(p.balance),
      limit: f.money(p.limit), difference: f.money(p.difference), costLast7d: f.money(p.costLast7d), salePrice: f.money(p.salePrice),
      avgCost: f.money(p.avgCost), stockValue: f.money(p.stockValue), velocityPerDay: f.number(p.velocityPerDay, 2),
      daysOfStockLeft: f.number(p.daysOfStockLeft, 1), expiry: f.date(p.expiry), marginPct: f.number(p.marginPct, 1),
      defaultValue: a.messageKey,
    });
  };

  return (
    <div>
      <PageHeader
        title={t('agent.title')}
        subtitle={summary?.lastRun ? t('agent.lastRun', { date: f.dateTime(summary.lastRun.finishedAt ?? summary.lastRun.startedAt) }) : undefined}
        actions={<button className="btn-primary" onClick={() => run.mutate()} disabled={run.isPending}><Play size={16} /> {t('agent.runNow')}</button>}
      />
      <div className="mb-4 card flex items-start gap-3 bg-gradient-to-r from-violet-50 to-white p-4">
        <BrainCircuit className="shrink-0 text-violet-700" />
        <p className="text-sm text-slate-700">{t('agent.intro')}</p>
      </div>
      <Tabs value={group} onChange={(g) => { setGroup(g); setSelected([]); }} tabs={Object.keys(GROUPS).map((g) => ({ value: g, label: t(`agent.groups.${g}`), count: count(g) }))} />

      {group === 'stock' && canPurchase && reorderIds.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <button className="btn-secondary" onClick={() => setSelected(selected.length === reorderIds.length ? [] : reorderIds)}>{t('agent.selectAllReorders')}</button>
          <button className="btn-primary" disabled={!selected.length || drafts.isPending} onClick={() => drafts.mutate(selected)}><ShoppingCart size={16} /> {t('agent.createDrafts', { count: selected.length })}</button>
        </div>
      )}

      {group === 'crossSell' && !!associations?.length && (
        <div className="card mb-4 overflow-x-auto">
          <h3 className="border-b border-slate-200 p-3 text-sm font-bold">{t('agent.associations')}</h3>
          <table className="table">
            <thead><tr><th>{t('agent.ifBuys')}</th><th>{t('agent.alsoBuys')}</th><th className="text-end">{t('agent.confidence')}</th><th className="text-end">{t('agent.lift')}</th><th className="text-end">{t('agent.pairs')}</th></tr></thead>
            <tbody>
              {associations.map((a, i) => (
                <tr key={i}><td>{a.productName}</td><td className="font-semibold">{f.name(a.associatedName, a.translations)}</td>
                  <td className="text-end num">{f.pct(a.confidence * 100)}</td><td className="text-end num">{f.number(a.lift, 2)}</td><td className="text-end num">{a.pairCount}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isLoading ? <Loading /> : !visible.length ? <div className="card"><Empty text={t('agent.noAlerts')} /></div> : (
        <div className="space-y-2">
          {visible.map((a) => (
            <div key={a.id} className={clsx('card flex flex-wrap items-start gap-3 p-3', a.severity === 'CRITICAL' && 'border-red-200', a.status === 'ACKNOWLEDGED' && 'opacity-70')}>
              {a.type === 'REORDER' && canPurchase && group === 'stock' && (
                <input type="checkbox" className="mt-1" checked={selected.includes(a.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, a.id] : selected.filter((x) => x !== a.id))} />
              )}
              <SeverityIcon severity={a.severity} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={a.severity === 'CRITICAL' ? 'red' : a.severity === 'WARNING' ? 'amber' : 'blue'}>{t(`alertTypes.${a.type}`)}</Badge>
                  {a.status === 'ACKNOWLEDGED' && <Badge>{t('agent.acknowledged')}</Badge>}
                  <span className="text-xs text-slate-400 num">{f.dateTime(a.lastSeenAt)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-800">{message(a)}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {a.type === 'PROMOTION' && canManage && (
                  <button className="btn-primary py-1 text-xs" onClick={() => act.mutate({ id: a.id, action: 'accept-promotion' })}><Tag size={14} /> {t('agent.applyPromotion', { pct: a.payload.suggestedDiscountPct })}</button>
                )}
                {a.payload?.suggestedPrice && a.messageKey === 'agent.anomaly.lowMargin' && canManage && (
                  <button className="btn-primary py-1 text-xs" onClick={() => act.mutate({ id: a.id, action: 'apply-price' })}>{t('agent.applyPrice')}</button>
                )}
                {a.type === 'REORDER' && canPurchase && (
                  <button className="btn-primary py-1 text-xs" onClick={() => drafts.mutate([a.id])}><ShoppingCart size={14} /> {t('agent.order')}</button>
                )}
                {a.status === 'NEW' && <button className="btn-secondary py-1 text-xs" onClick={() => act.mutate({ id: a.id, action: 'ack' })}><Check size={14} /> {t('agent.ack')}</button>}
                {canManage && <button className="btn-ghost py-1 text-xs" onClick={() => act.mutate({ id: a.id, action: 'dismiss' })}><EyeOff size={14} /> {t('agent.dismiss')}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
