import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorKey } from '../../api/client';
import { useCategories, useMeta, useSuppliers, useTaxes } from '../../api/hooks';
import type { Product } from '../../api/types';
import { toast } from '../../stores/toast';
import { useFormat } from '../../lib/format';
import { Field, Modal, NumberInput } from '../../components/ui';

export function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const { data: categories } = useCategories();
  const { data: meta } = useMeta();
  const { data: suppliers } = useSuppliers();
  const { data: taxes } = useTaxes();
  const [form, setForm] = useState({
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    name: product?.name ?? '',
    nameUr: product?.translations?.ur ?? '',
    nameAr: product?.translations?.ar ?? '',
    categoryId: product?.categoryId ?? null as number | null,
    unitId: product?.unitId ?? 1,
    supplierId: product?.supplierId ?? null as number | null,
    purchasePrice: product?.purchasePrice ?? 0,
    salePrice: product?.salePrice ?? 0,
    minStock: product?.minStock ?? 0,
    reorderQty: product?.reorderQty ?? 0,
    trackExpiry: !!product?.trackExpiry,
    isWeighed: !!product?.isWeighed,
    isActive: product ? !!product.isActive : true,
    taxIds: product?.taxes?.map((x) => x.id) ?? [] as number[],
    initialStock: 0,
    initialExpiry: '',
    initialBatchNo: '',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((s) => ({ ...s, [k]: v }));
  const margin = form.salePrice > 0 ? ((form.salePrice - form.purchasePrice) / form.salePrice) * 100 : 0;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        barcode: form.barcode || null,
        translations: { ur: form.nameUr, ar: form.nameAr },
        initialStock: product ? undefined : form.initialStock,
        initialExpiry: form.initialExpiry || null,
        initialBatchNo: form.initialBatchNo || null,
      };
      return product ? api.put(`/products/${product.id}`, body) : api.post('/products', body);
    },
    onSuccess: () => {
      toast.success('common.saved');
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['pos-catalog'] });
      onClose();
    },
    onError: (e) => toast.error(errorKey(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? t('products.edit') : t('products.new')}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={!form.sku || !form.name || save.isPending} onClick={() => save.mutate()}>{t('common.save')}</button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={`${t('products.name')} (English)`} className="sm:col-span-3"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label={`${t('products.name')} (اردو)`}><input dir="rtl" lang="ur" className="input" value={form.nameUr} onChange={(e) => set('nameUr', e.target.value)} /></Field>
        <Field label={`${t('products.name')} (العربية)`}><input dir="rtl" lang="ar" className="input" value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} /></Field>
        <div />
        <Field label={t('products.sku')}><input className="input num" value={form.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} /></Field>
        <Field label={t('products.barcode')} hint={t('products.barcodeHint')}><input className="input num" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} /></Field>
        <Field label={t('products.category')}>
          <select className="input" value={form.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {categories?.map((c) => <option key={c.id} value={c.id}>{f.name(c.name, c.translations)}</option>)}
          </select>
        </Field>
        <Field label={t('products.unit')}>
          <select className="input" value={form.unitId} onChange={(e) => set('unitId', Number(e.target.value))}>
            {meta?.units.map((u) => <option key={u.id} value={u.id}>{t(`units.${u.code}`, { defaultValue: u.name })}</option>)}
          </select>
        </Field>
        <Field label={t('products.supplier')}>
          <select className="input" value={form.supplierId ?? ''} onChange={(e) => set('supplierId', e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <div />
        <Field label={t('products.purchasePrice')}><NumberInput value={form.purchasePrice} onChange={(v) => set('purchasePrice', v)} min={0} /></Field>
        <Field label={t('products.salePrice')} hint={t('products.marginHint', { pct: f.number(margin, 1) })}><NumberInput value={form.salePrice} onChange={(v) => set('salePrice', v)} min={0} /></Field>
        <div />
        <Field label={t('products.minStock')} hint={t('products.minStockHint')}><NumberInput value={form.minStock} onChange={(v) => set('minStock', v)} min={0} /></Field>
        <Field label={t('products.reorderQty')}><NumberInput value={form.reorderQty} onChange={(v) => set('reorderQty', v)} min={0} /></Field>
        <div />
        <div className="sm:col-span-3">
          <span className="label">{t('products.taxes')}</span>
          <div className="flex flex-wrap gap-3">
            {taxes?.filter((x) => x.isActive && x.appliesTo !== 'PURCHASES' || form.taxIds.includes(x.id)).map((x) => (
              <label key={x.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                <input type="checkbox" checked={form.taxIds.includes(x.id)} onChange={(e) => set('taxIds', e.target.checked ? [...form.taxIds, x.id] : form.taxIds.filter((i) => i !== x.id))} />
                {f.name(x.name, x.translations)} <span className="text-xs text-slate-500 num">{x.type === 'PERCENT' ? `${x.rate}%` : f.money(x.rate)}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.trackExpiry} onChange={(e) => set('trackExpiry', e.target.checked)} /> {t('products.trackExpiry')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isWeighed} onChange={(e) => set('isWeighed', e.target.checked)} /> {t('products.isWeighed')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /> {t('products.isActive')}</label>
        {!product && (
          <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:col-span-3 sm:grid-cols-3">
            <Field label={t('products.initialStock')}><NumberInput value={form.initialStock} onChange={(v) => set('initialStock', v)} min={0} /></Field>
            <Field label={t('products.batchNo')}><input className="input" value={form.initialBatchNo} onChange={(e) => set('initialBatchNo', e.target.value)} /></Field>
            <Field label={t('products.expiryDate')}><input type="date" className="input num" value={form.initialExpiry} onChange={(e) => set('initialExpiry', e.target.value)} /></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}
