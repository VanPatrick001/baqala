import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorKey, type Page } from '../../api/client';
import { get, useCategories, useMeta, useSettings, useTaxes } from '../../api/hooks';
import type { Category, Tax } from '../../api/types';
import { useCan } from '../../stores/auth';
import { toast } from '../../stores/toast';
import { useFormat } from '../../lib/format';
import { Badge, Empty, Field, Loading, Modal, NumberInput, PageHeader, Pagination, Tabs } from '../../components/ui';

type Tab = 'store' | 'taxes' | 'categories' | 'users' | 'audit';

export function SettingsPage() {
  const { t } = useTranslation();
  const canSettings = useCan('settings.manage');
  const canUsers = useCan('users.manage');
  const canAudit = useCan('audit.view');
  const tabs: { value: Tab; label: string }[] = [
    ...(canSettings ? [{ value: 'store' as Tab, label: t('settings.tabs.store') }] : []),
    { value: 'taxes', label: t('settings.tabs.taxes') },
    { value: 'categories', label: t('settings.tabs.categories') },
    ...(canUsers ? [{ value: 'users' as Tab, label: t('settings.tabs.users') }] : []),
    ...(canAudit ? [{ value: 'audit' as Tab, label: t('settings.tabs.audit') }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0].value);
  return (
    <div>
      <PageHeader title={t('settings.title')} />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'store' && <StoreSettings />}
      {tab === 'taxes' && <Taxes />}
      {tab === 'categories' && <Categories />}
      {tab === 'users' && <Users />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}

const STORE_FIELDS: { key: string; type: 'text' | 'number' | 'bool' }[] = [
  { key: 'store_name', type: 'text' }, { key: 'store_address', type: 'text' }, { key: 'store_phone', type: 'text' },
  { key: 'store_tax_number', type: 'text' }, { key: 'currency_code', type: 'text' }, { key: 'currency_decimals', type: 'number' },
  { key: 'receipt_footer', type: 'text' }, { key: 'receipt_width_mm', type: 'number' },
  { key: 'prices_include_tax', type: 'bool' }, { key: 'allow_negative_stock', type: 'bool' },
  { key: 'expiry_alert_days', type: 'number' }, { key: 'agent_velocity_days', type: 'number' }, { key: 'agent_coverage_days', type: 'number' },
  { key: 'agent_slow_mover_days', type: 'number' }, { key: 'agent_waste_multiplier', type: 'number' }, { key: 'agent_max_voids_per_day', type: 'number' },
  { key: 'agent_basket_days', type: 'number' }, { key: 'agent_min_pair_count', type: 'number' }, { key: 'agent_min_margin_pct', type: 'number' },
  { key: 'agent_cash_tolerance', type: 'number' }, { key: 'agent_cash_tolerance_pct', type: 'number' },
];

function StoreSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useSettings();
  const [form, setForm] = useState<Record<string, any>>({});
  useEffect(() => { if (data) setForm(data); }, [data]);
  const save = useMutation({
    mutationFn: () => api.put('/settings', Object.fromEntries(STORE_FIELDS.map((f) => [f.key, form[f.key]]))),
    onSuccess: () => { toast.success('common.saved'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e) => toast.error(errorKey(e)),
  });
  if (!data) return <Loading />;
  return (
    <div className="card p-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {STORE_FIELDS.map((f) => (
          <Field key={f.key} label={t(`settings.store.${f.key}`)}>
            {f.type === 'bool' ? (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} /> {t('common.enabled')}</label>
            ) : f.type === 'number' ? (
              <NumberInput value={form[f.key] ?? 0} onChange={(v) => setForm({ ...form, [f.key]: v })} />
            ) : (
              <input className="input" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            )}
          </Field>
        ))}
      </div>
      <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>{t('common.save')}</button></div>
    </div>
  );
}

function Taxes() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const canManage = useCan('taxes.manage');
  const { data, isLoading } = useTaxes();
  const [editing, setEditing] = useState<Partial<Tax> | null>(null);
  const save = useMutation({
    mutationFn: (x: Partial<Tax>) => {
      const body = { ...x, isActive: !!x.isActive, translations: x.translations ?? {} };
      return x.id ? api.put(`/taxes/${x.id}`, body) : api.post('/taxes', body);
    },
    onSuccess: () => { toast.success('common.saved'); qc.invalidateQueries({ queryKey: ['taxes'] }); setEditing(null); },
    onError: (e) => toast.error(errorKey(e)),
  });
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <p className="text-sm text-slate-600">{t('settings.taxes.hint')}</p>
        {canManage && <button className="btn-primary" onClick={() => setEditing({ type: 'PERCENT', appliesTo: 'BOTH', rate: 0, isActive: 1 })}><Plus size={16} /> {t('settings.taxes.new')}</button>}
      </div>
      {isLoading ? <Loading /> : (
        <table className="table">
          <thead><tr><th>{t('settings.taxes.code')}</th><th>{t('settings.taxes.name')}</th><th>{t('settings.taxes.type')}</th><th className="text-end">{t('settings.taxes.rate')}</th><th>{t('settings.taxes.appliesTo')}</th><th className="text-end">{t('nav.products')}</th><th>{t('common.status')}</th><th /></tr></thead>
          <tbody>
            {data?.map((x) => (
              <tr key={x.id}>
                <td className="num font-semibold">{x.code}</td>
                <td>{f.name(x.name, x.translations)}</td>
                <td>{t(`settings.taxes.types.${x.type}`)}</td>
                <td className="text-end num">{x.type === 'PERCENT' ? `${x.rate}%` : f.money(x.rate)}</td>
                <td>{t(`settings.taxes.scopes.${x.appliesTo}`)}</td>
                <td className="text-end num">{x.productCount}</td>
                <td>{x.isActive ? <Badge color="green">{t('common.active')}</Badge> : <Badge>{t('common.inactive')}</Badge>}</td>
                <td>{canManage && <button className="btn-ghost p-1.5" onClick={() => setEditing(x)}><Pencil size={15} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? t('settings.taxes.edit') : t('settings.taxes.new')}
          footer={<><button className="btn-secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</button><button className="btn-primary" disabled={!editing.code || !editing.name} onClick={() => save.mutate(editing)}>{t('common.save')}</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('settings.taxes.code')}><input className="input num" value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} /></Field>
            <Field label={`${t('settings.taxes.name')} (English)`}><input className="input" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label={`${t('settings.taxes.name')} (اردو)`}><input dir="rtl" className="input" value={editing.translations?.ur ?? ''} onChange={(e) => setEditing({ ...editing, translations: { ...editing.translations, ur: e.target.value } })} /></Field>
            <Field label={`${t('settings.taxes.name')} (العربية)`}><input dir="rtl" className="input" value={editing.translations?.ar ?? ''} onChange={(e) => setEditing({ ...editing, translations: { ...editing.translations, ar: e.target.value } })} /></Field>
            <Field label={t('settings.taxes.type')}>
              <select className="input" value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as Tax['type'] })}>
                <option value="PERCENT">{t('settings.taxes.types.PERCENT')}</option><option value="FIXED">{t('settings.taxes.types.FIXED')}</option>
              </select>
            </Field>
            <Field label={t('settings.taxes.rate')}><NumberInput value={editing.rate ?? 0} onChange={(v) => setEditing({ ...editing, rate: v })} min={0} /></Field>
            <Field label={t('settings.taxes.appliesTo')}>
              <select className="input" value={editing.appliesTo} onChange={(e) => setEditing({ ...editing, appliesTo: e.target.value as Tax['appliesTo'] })}>
                {['SALES', 'PURCHASES', 'BOTH'].map((s) => <option key={s} value={s}>{t(`settings.taxes.scopes.${s}`)}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={!!editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked ? 1 : 0 })} /> {t('common.active')}</label>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Categories() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const canManage = useCan('products.manage');
  const { data, isLoading } = useCategories();
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['categories'] });
  const save = useMutation({
    mutationFn: (c: Partial<Category>) => {
      const body = { code: c.code, name: c.name, sortOrder: c.sortOrder ?? 0, isActive: c.isActive !== 0, parentId: c.parentId ?? null, translations: c.translations ?? {} };
      return c.id ? api.put(`/categories/${c.id}`, body) : api.post('/categories', body);
    },
    onSuccess: () => { toast.success('common.saved'); refresh(); setEditing(null); },
    onError: (e) => toast.error(errorKey(e)),
  });
  const remove = useMutation({ mutationFn: (id: number) => api.delete(`/categories/${id}`), onSuccess: refresh, onError: (e) => toast.error(errorKey(e)) });
  return (
    <div className="card">
      {canManage && <div className="flex justify-end border-b border-slate-200 p-3"><button className="btn-primary" onClick={() => setEditing({ isActive: 1, sortOrder: 0 })}><Plus size={16} /> {t('settings.categories.new')}</button></div>}
      {isLoading ? <Loading /> : (
        <table className="table">
          <thead><tr><th>{t('settings.taxes.code')}</th><th>English</th><th>اردو</th><th>العربية</th><th className="text-end">{t('nav.products')}</th><th /></tr></thead>
          <tbody>
            {data?.map((c) => (
              <tr key={c.id}>
                <td className="num text-xs">{c.code}</td><td className="font-semibold">{c.name}</td>
                <td dir="rtl" lang="ur">{c.translations?.ur}</td><td dir="rtl" lang="ar">{c.translations?.ar}</td>
                <td className="text-end num">{c.productCount}</td>
                <td className="whitespace-nowrap text-end">{canManage && <>
                  <button className="btn-ghost p-1.5" onClick={() => setEditing(c)}><Pencil size={15} /></button>
                  <button className="btn-ghost p-1.5 text-red-600" onClick={() => window.confirm(t('settings.categories.confirmDelete', { name: f.name(c.name, c.translations) })) && remove.mutate(c.id)}><Trash2 size={15} /></button>
                </>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? t('settings.categories.edit') : t('settings.categories.new')}
          footer={<><button className="btn-secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</button><button className="btn-primary" disabled={!editing.code || !editing.name} onClick={() => save.mutate(editing)}>{t('common.save')}</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('settings.taxes.code')}><input className="input num" value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="English"><input className="input" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="اردو"><input dir="rtl" className="input" value={editing.translations?.ur ?? ''} onChange={(e) => setEditing({ ...editing, translations: { ...editing.translations, ur: e.target.value } })} /></Field>
            <Field label="العربية"><input dir="rtl" className="input" value={editing.translations?.ar ?? ''} onChange={(e) => setEditing({ ...editing, translations: { ...editing.translations, ar: e.target.value } })} /></Field>
            <Field label={t('settings.categories.sortOrder')}><NumberInput value={editing.sortOrder ?? 0} onChange={(v) => setEditing({ ...editing, sortOrder: v })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Users() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: meta } = useMeta();
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => get<any[]>('/users') });
  const [editing, setEditing] = useState<any | null>(null);
  const save = useMutation({
    mutationFn: (u: any) => {
      const body = { username: u.username, fullName: u.fullName, email: u.email || null, phone: u.phone || null, roleId: u.roleId, preferredLanguage: u.preferredLanguage ?? 'en', isActive: !!u.isActive, password: u.password || undefined };
      return u.id ? api.put(`/users/${u.id}`, body) : api.post('/users', body);
    },
    onSuccess: () => { toast.success('common.saved'); qc.invalidateQueries({ queryKey: ['users'] }); setEditing(null); },
    onError: (e) => toast.error(errorKey(e)),
  });
  return (
    <div className="card">
      <div className="flex justify-end border-b border-slate-200 p-3"><button className="btn-primary" onClick={() => setEditing({ roleId: 3, isActive: 1, preferredLanguage: 'en' })}><Plus size={16} /> {t('settings.users.new')}</button></div>
      {isLoading ? <Loading /> : (
        <table className="table">
          <thead><tr><th>{t('auth.username')}</th><th>{t('customers.fullName')}</th><th>{t('settings.users.role')}</th><th>{t('settings.users.language')}</th><th>{t('settings.users.lastLogin')}</th><th>{t('common.status')}</th><th /></tr></thead>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id}>
                <td className="num font-semibold">{u.username}</td><td>{u.fullName}</td><td>{t(`roles.${u.role}`)}</td>
                <td>{meta?.languages.find((l) => l.code === u.preferredLanguage)?.nativeName}</td>
                <td className="num text-xs">{u.lastLoginAt ?? '—'}</td>
                <td>{u.isActive ? <Badge color="green">{t('common.active')}</Badge> : <Badge>{t('common.inactive')}</Badge>}</td>
                <td><button className="btn-ghost p-1.5" onClick={() => setEditing(u)}><Pencil size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? t('settings.users.edit') : t('settings.users.new')}
          footer={<><button className="btn-secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</button><button className="btn-primary" disabled={!editing.username || !editing.fullName || (!editing.id && (editing.password ?? '').length < 8)} onClick={() => save.mutate(editing)}>{t('common.save')}</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('auth.username')}><input className="input num" value={editing.username ?? ''} onChange={(e) => setEditing({ ...editing, username: e.target.value })} /></Field>
            <Field label={t('customers.fullName')}><input className="input" value={editing.fullName ?? ''} onChange={(e) => setEditing({ ...editing, fullName: e.target.value })} /></Field>
            <Field label={t('settings.users.role')}>
              <select className="input" value={editing.roleId} onChange={(e) => setEditing({ ...editing, roleId: Number(e.target.value) })}>
                {meta?.roles.map((r) => <option key={r.id} value={r.id}>{t(`roles.${r.code}`)}</option>)}
              </select>
            </Field>
            <Field label={t('settings.users.language')}>
              <select className="input" value={editing.preferredLanguage} onChange={(e) => setEditing({ ...editing, preferredLanguage: e.target.value })}>
                {meta?.languages.map((l) => <option key={l.code} value={l.code}>{l.nativeName}</option>)}
              </select>
            </Field>
            <Field label={t('customers.email')}><input className="input" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
            <Field label={editing.id ? t('settings.users.resetPassword') : t('auth.password')} hint={t('auth.passwordRule')}><input type="password" className="input" value={editing.password ?? ''} onChange={(e) => setEditing({ ...editing, password: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked ? 1 : 0 })} /> {t('common.active')}</label>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Audit() {
  const { t } = useTranslation();
  const f = useFormat();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['audit', page], queryFn: () => get<Page<any>>('/audit', { page, pageSize: 50 }) });
  return (
    <div className="card">
      {isLoading ? <Loading /> : !data?.rows.length ? <Empty /> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>{t('common.date')}</th><th>{t('common.user')}</th><th>{t('settings.audit.action')}</th><th>{t('settings.audit.entity')}</th><th>{t('settings.audit.changes')}</th></tr></thead>
            <tbody>
              {data.rows.map((a) => (
                <tr key={a.id}>
                  <td className="num text-xs">{f.dateTime(a.createdAt)}</td>
                  <td>{a.userName ?? '—'}</td>
                  <td><Badge>{a.action}</Badge></td>
                  <td className="text-xs">{a.entityType} #{a.entityId}</td>
                  <td className="max-w-md text-xs text-slate-600"><code className="break-all" dir="ltr">{a.newValues ? JSON.stringify(a.newValues) : ''}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={50} total={data?.total ?? 0} onChange={setPage} />
    </div>
  );
}
