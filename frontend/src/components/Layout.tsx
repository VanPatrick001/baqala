import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  BarChart3, Boxes, BrainCircuit, Wallet, LayoutDashboard, LogOut, Menu, Package, Receipt, Settings, ShoppingCart, Truck, Users, X,
} from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useAuth, useCan, can } from '../stores/auth';
import { get } from '../api/hooks';
import { ChangePasswordModal } from '../features/auth/ChangePasswordModal';

const NAV = [
  { to: '/', key: 'nav.dashboard', icon: LayoutDashboard, perm: ['dashboard.view', 'reports.view'] },
  { to: '/pos', key: 'nav.pos', icon: ShoppingCart, perm: ['pos.use'] },
  { to: '/sales', key: 'nav.sales', icon: Receipt, perm: ['sales.view', 'sales.view_own'] },
  { to: '/products', key: 'nav.products', icon: Package, perm: ['products.view'] },
  { to: '/inventory', key: 'nav.inventory', icon: Boxes, perm: ['stock.view'] },
  { to: '/purchases', key: 'nav.purchases', icon: Truck, perm: ['purchases.view'] },
  { to: '/customers', key: 'nav.customers', icon: Users, perm: ['customers.view'] },
  { to: '/cash', key: 'nav.cash', icon: Wallet, perm: ['cash.view', 'cash.session'] },
  { to: '/reports', key: 'nav.reports', icon: BarChart3, perm: ['reports.view'] },
  { to: '/agent', key: 'nav.agent', icon: BrainCircuit, perm: ['agent.view'], badge: true },
  { to: '/settings', key: 'nav.settings', icon: Settings, perm: ['settings.manage', 'taxes.view', 'users.manage'] },
];

export function Layout() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState(false);
  const canAgent = useCan('agent.view');
  const { data: agent } = useQuery({
    queryKey: ['agent-summary'],
    queryFn: () => get<{ counts: { severity: string; count: number }[] }>('/agent/summary'),
    enabled: canAgent,
    refetchInterval: 60_000,
  });
  const critical = agent?.counts.filter((c) => c.severity !== 'INFO').reduce((s, c) => s + c.count, 0) ?? 0;

  const items = NAV.filter((n) => can(user, ...n.perm));

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className={clsx(
          'no-print fixed inset-y-0 start-0 z-30 flex w-60 flex-col border-e border-slate-200 bg-white transition-transform lg:static',
          open ? 'translate-x-0' : 'max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <span className="flex items-center gap-2 text-lg font-extrabold tracking-wide text-brand-800">
            <img src="/favicon.svg" alt="" className="h-7 w-7" /> BAQALA
          </span>
          <button className="lg:hidden" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold', isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100')
              }
            >
              <n.icon size={18} />
              <span className="flex-1">{t(n.key)}</span>
              {n.badge && critical > 0 && <span className="rounded-full bg-red-600 px-1.5 text-xs text-white num">{critical}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3 text-sm">
          <div className="font-semibold text-slate-800">{user?.fullName}</div>
          <div className="text-xs text-slate-500">{t(`roles.${user?.role}`)}</div>
          <div className="mt-2 flex gap-2">
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setPwd(true)}>{t('auth.changePassword')}</button>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { logout(); navigate('/login'); }}>
              <LogOut size={14} /> {t('auth.logout')}
            </button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="menu"><Menu size={20} /></button>
          <div className="flex-1" />
          <LanguageSwitcher />
        </header>
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
      <ChangePasswordModal open={pwd || !!user?.mustChangePassword} forced={!!user?.mustChangePassword} onClose={() => setPwd(false)} />
    </div>
  );
}
