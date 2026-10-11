import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { Page } from '../api/client';
import { get } from '../api/hooks';
import type { Product } from '../api/types';
import { useFormat } from '../lib/format';

/** Recherche de produit (nom, SKU, code-barres, nom traduit). */
export function ProductSelect({ value, onChange, autoFocus }: { value: Product | null; onChange: (p: Product | null) => void; autoFocus?: boolean }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['product-search', search],
    queryFn: () => get<Page<Product>>('/products', { search: search || undefined, pageSize: 15 }),
    enabled: open,
  });

  if (value) {
    return (
      <div className="input flex items-center justify-between">
        <span>{f.name(value.name, value.translations)} <span className="text-xs text-slate-500 num">({value.sku})</span></span>
        <button className="text-xs text-brand-700" onClick={() => onChange(null)}>{t('common.change')}</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        className="input"
        autoFocus={autoFocus}
        placeholder={t('products.searchPlaceholder')}
        value={search}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setSearch(e.target.value)}
      />
      {open && !!data?.rows.length && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {data.rows.map((p) => (
            <button key={p.id} type="button" className="flex w-full justify-between px-3 py-2 text-start text-sm hover:bg-slate-50" onMouseDown={() => { onChange(p); setSearch(''); }}>
              <span>{f.name(p.name, p.translations)} <span className="text-xs text-slate-500 num">{p.sku}</span></span>
              <span className="text-xs text-slate-500 num">{f.qty(p.stockQty)} {p.unitCode}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
