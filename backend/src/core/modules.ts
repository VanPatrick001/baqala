/**
 * Modules activables par utilisateur. Un utilisateur dont `users.modules` est NULL a tous les modules de son rôle ;
 * sinon il n'a que ceux de la liste (le rôle reste la limite haute : on ne donne jamais plus que le rôle).
 */
export const MODULES = ['dashboard', 'pos', 'sales', 'products', 'inventory', 'purchases', 'customers', 'cash', 'reports', 'agent', 'settings'] as const;
export type ModuleKey = (typeof MODULES)[number];

/** Domaine de permission -> module qui le possède. */
const DOMAIN_MODULE: Record<string, ModuleKey> = {
  dashboard: 'dashboard', pos: 'pos', sales: 'sales', products: 'products', stock: 'inventory',
  purchases: 'purchases', suppliers: 'purchases', customers: 'customers', cash: 'cash', reports: 'reports',
  agent: 'agent', settings: 'settings', users: 'settings', roles: 'settings', taxes: 'settings', audit: 'settings',
};

/** Permissions dont un module a besoin pour fonctionner (ex. la caisse doit lire le catalogue). */
const MODULE_NEEDS: Partial<Record<ModuleKey, string[]>> = {
  pos: ['products.view', 'customers.view', 'customers.create', 'cash.session', 'sales.view_own'],
  inventory: ['products.view'],
  purchases: ['products.view'],
  dashboard: ['reports.view'],
};

const covers = (granted: string, perm: string) => granted === '*' || granted === perm || granted === `${perm.split('.')[0]}.*`;

/** Permissions effectives = permissions du rôle, restreintes aux modules autorisés. */
export function effectivePermissions(rolePermissions: string[], modules: string[] | null): string[] {
  if (!modules) return rolePermissions;
  const allowed = new Set(modules);
  const out = new Set<string>();
  for (const p of rolePermissions) {
    if (p === '*') {
      for (const [domain, m] of Object.entries(DOMAIN_MODULE)) if (allowed.has(m)) out.add(`${domain}.*`);
      continue;
    }
    const m = DOMAIN_MODULE[p.split('.')[0]];
    if (!m || allowed.has(m)) out.add(p);
  }
  for (const m of allowed) {
    for (const need of MODULE_NEEDS[m as ModuleKey] ?? []) {
      if (rolePermissions.some((p) => covers(p, need))) out.add(need);
    }
  }
  return [...out];
}

/** Normalise la valeur JSON stockée en base (NULL = tous les modules du rôle). */
export function parseModules(raw: unknown): ModuleKey[] | null {
  const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(list)) return null;
  return list.filter((m): m is ModuleKey => (MODULES as readonly string[]).includes(m));
}
