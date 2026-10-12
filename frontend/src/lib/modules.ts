import { can, type User } from '../stores/auth';

/** Modules de l'application (mêmes clés que backend/src/core/modules.ts). */
export const MODULES = ['dashboard', 'pos', 'sales', 'products', 'inventory', 'purchases', 'customers', 'cash', 'reports', 'agent', 'settings'] as const;
export type ModuleKey = (typeof MODULES)[number];

/** Une page par module : chemin, et permissions dont il faut au moins une. */
export const MODULE_PAGES: { module: ModuleKey; to: string; perm: string[] }[] = [
  { module: 'dashboard', to: '/', perm: ['dashboard.view', 'reports.view'] },
  { module: 'pos', to: '/pos', perm: ['pos.use'] },
  { module: 'sales', to: '/sales', perm: ['sales.view', 'sales.view_own'] },
  { module: 'products', to: '/products', perm: ['products.view'] },
  { module: 'inventory', to: '/inventory', perm: ['stock.view'] },
  { module: 'purchases', to: '/purchases', perm: ['purchases.view'] },
  { module: 'customers', to: '/customers', perm: ['customers.view'] },
  { module: 'cash', to: '/cash', perm: ['cash.view', 'cash.session'] },
  { module: 'reports', to: '/reports', perm: ['reports.view'] },
  { module: 'agent', to: '/agent', perm: ['agent.view'] },
  { module: 'settings', to: '/settings', perm: ['settings.manage', 'taxes.view', 'users.manage', 'users.manage_sellers'] },
];

/** null = tous les modules du rôle. */
export const hasModule = (user: User | null, m: ModuleKey) => !!user && (!user.modules || user.modules.includes(m));

export const canOpen = (user: User | null, m: ModuleKey) => {
  const page = MODULE_PAGES.find((p) => p.module === m)!;
  return hasModule(user, m) && can(user, ...page.perm);
};

/** Première page accessible (page d'accueil de l'utilisateur). */
export const homePath = (user: User | null) => MODULE_PAGES.find((p) => canOpen(user, p.module))?.to ?? null;
