import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorKey, type Page } from '../../api/client';
import { get, useCategories } from '../../api/hooks';
import type { Product } from '../../api/types';
import { useCan } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { useFormat } from '../../lib/format';
import { Badge, Empty, Loading, PageHeader, Pagination } from '../../components/ui';
import { ProductForm } from './ProductForm';

export function ProductsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const canManage = useCan('products.manage');
  const { data: categories } = useCategories();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const pageSize = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, categoryId, status, page],
    queryFn: () => get<Page<Product>>('/products', { search: search || undefined, categoryId: categoryId || undefined, status: status || undefined, page, pageSize }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/products/${id}`),
    onSuccess: () => { toast.success('common.deleted'); qc.invalidateQueries({ queryKey: ['products'] }); },
    onError: (e) => toast.error(errorKey(e)),
  });

  return (
    <div>
      <PageHeader
        title={t('products.title')}
        subtitle={t('products.count', { count: data?.total ?? 0 })}
        actions={canManage && <button className="btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> {t('products.new')}</button>}
      />
      <div className="card">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3">
          <input className="input max-w-xs" placeholder={t('products.searchPlaceholder')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select className="input w-auto" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
            <option value="">{t('products.allCategories')}</option>
            {categories?.map((c) => <option key={c.id} value={c.id}>{f.name(c.name, c.translations)}</option>)}
          </select>
          <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">{t('products.allStatuses')}</option>
            <option value="ALERT">{t('products.status.ALERT')}</option>
            <option value="LOW">{t('products.status.LOW')}</option>
            <option value="OUT">{t('products.status.OUT')}</option>
            <option value="OK">{t('products.status.OK')}</option>
          </select>
        </div>
        {isLoading ? <Loading /> : !data?.rows.length ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('products.name')}</th><th>{t('products.sku')}</th><th>{t('products.category')}</th>
                  <th className="text-end">{t('products.purchasePrice')}</th><th className="text-end">{t('products.salePrice')}</th>
                  <th className="text-end">{t('products.stock')}</th><th>{t('products.nextExpiry')}</th><th>{t('products.taxes')}</th><th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((p) => (
                  <tr key={p.id} className={!p.isActive ? 'opacity-50' : ''}>
                    <td className="font-semibold">
                      {f.name(p.name, p.translations)}
                      {p.promotion && <span className="ms-2"><Badge color="red">{t('products.onPromo')}</Badge></span>}
                    </td>
                    <td className="text-xs text-slate-500"><div className="num">{p.sku}</div><div className="num">{p.barcode}</div></td>
                    <td>{p.categoryName ? f.name(p.categoryName, categories?.find((c) => c.id === p.categoryId)?.translations) : '—'}</td>
                    <td className="text-end num">{f.money(p.purchasePrice)}</td>
                    <td className="text-end num font-semibold">{f.money(p.salePrice)}</td>
                    <td className="text-end">
                      <Badge color={p.stockStatus === 'OK' ? 'green' : p.stockStatus === 'LOW' ? 'amber' : 'red'}>
                        <span className="num">{f.qty(p.stockQty)}</span> {p.unitCode}
                      </Badge>
                      <div className="text-xs text-slate-400">{t('products.min')}: <span className="num">{f.qty(p.minStock)}</span></div>
                    </td>
                    <td className="num text-xs">{p.nextExpiry ? f.date(p.nextExpiry) : '—'}</td>
                    <td className="text-xs">{p.taxes?.map((x) => x.code).join(', ') || '—'}</td>
                    <td className="whitespace-nowrap text-end">
                      {canManage && (
                        <>
                          <button className="btn-ghost p-1.5" onClick={() => setEditing(p)} aria-label={t('common.edit')}><Pencil size={15} /></button>
                          <button className="btn-ghost p-1.5 text-red-600" onClick={() => window.confirm(t('products.confirmDelete', { name: p.name })) && remove.mutate(p.id)} aria-label={t('common.delete')}><Trash2 size={15} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onChange={setPage} />
      </div>
      {editing && <ProductForm product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
