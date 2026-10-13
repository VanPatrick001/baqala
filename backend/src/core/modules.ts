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

/**
 * Ce que donne un module coché pour un utilisateur, même si son rôle ne l'a pas : l'accès de base
 * (consulter, utiliser). Les droits de gestion (comptabilité, utilisateurs, prix...) restent ceux du rôle.
 */
const MODULE_GRANTS: Record<ModuleKey, string[]> = {
  dashboard: ['dashboard.view', 'reports.view'],
  pos: ['pos.use', 'products.view', 'customers.view', 'customers.create', 'cash.session', 'sales.view_own', 'sales.void_own'],
  sales: ['sales.view_own', 'sales.void_own'],
  products: ['products.view'],
  inventory: ['stock.view', 'products.view'],
  purchases: ['purchases.view', 'suppliers.view', 'products.view'],
  customers: ['customers.view', 'customers.create'],
  cash: ['cash.session'],
  reports: ['reports.view'],
  agent: ['agent.view'],
  settings: ['taxes.view'],
};

/** Un droit en entraîne d'autres : gérer implique consulter, annuler toute vente implique annuler les siennes... */
const IMPLIES: Record<string, string[]> = {
  'products.manage': ['products.view'],
  'stock.manage': ['stock.view', 'products.view'],
  'stock.view': ['products.view'],
  'purchases.manage': ['purchases.view', 'suppliers.view', 'products.view'],
  'purchases.view': ['products.view'],
  'suppliers.manage': ['suppliers.view'],
  'customers.manage': ['customers.view', 'customers.create'],
  'customers.create': ['customers.view'],
  'sales.view': ['sales.view_own'],
  'sales.void': ['sales.void_own', 'sales.view', 'sales.view_own'],
  'sales.void_own': ['sales.view_own'],
  'cash.manage': ['cash.view', 'cash.session'],
  'agent.manage': ['agent.view'],
  'taxes.manage': ['taxes.view'],
  'users.manage': ['users.manage_sellers'],
  'pos.use': ['products.view', 'customers.view', 'cash.session', 'sales.view_own'],
};

function withImplied(perms: Iterable<string>): string[] {
  const out = new Set(perms);
  if (out.has('*')) return ['*'];
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of [...out]) {
      const domain = p.endsWith('.*') ? p.slice(0, -2) : null;
      const implied = domain ? Object.entries(IMPLIES).filter(([k]) => k.startsWith(domain + '.')).flatMap(([, v]) => v) : IMPLIES[p] ?? [];
      for (const i of implied) if (!out.has(i)) { out.add(i); grew = true; }
    }
  }
  return [...out];
}

/** Permissions du rôle, restreintes aux modules autorisés (NULL = tous), plus l'accès de base des modules cochés. */
export function effectivePermissions(rolePermissions: string[], modules: string[] | null): string[] {
  if (!modules) return withImplied(rolePermissions);
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
  for (const m of allowed) for (const g of MODULE_GRANTS[m as ModuleKey] ?? []) out.add(g);
  return withImplied(out);
}

/** Colonnes SQL nécessaires à userPermissions (à joindre sur users u / roles r). */
export const ACCESS_COLUMNS = `u.modules, r.code AS role, r.permissions,
  (SELECT s.permissions FROM roles s WHERE s.code = 'CASHIER') AS seller_permissions`;

const asList = (raw: unknown): string[] => {
  const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Array.isArray(v) ? v : [];
};

/**
 * Droits réels d'un utilisateur :
 * - Administrateur : tout, toujours (les modules ne le limitent pas) ;
 * - Manager : ses droits + tous ceux du vendeur ;
 * - puis restriction / ajout par modules pour les autres.
 */
export function userPermissions(u: { role: string; permissions: unknown; seller_permissions?: unknown; modules: unknown }): string[] {
  if (u.role === 'ADMIN') return ['*'];
  const role = asList(u.permissions);
  const perms = u.role === 'MANAGER' ? [...new Set([...role, ...asList(u.seller_permissions)])] : role;
  return effectivePermissions(perms, parseModules(u.modules));
}

/** Modules réellement restreints (l'administrateur n'est jamais restreint). */
export const userModules = (u: { role: string; modules: unknown }) => (u.role === 'ADMIN' ? null : parseModules(u.modules));

/** Normalise la valeur JSON stockée en base (NULL = tous les modules du rôle). */
export function parseModules(raw: unknown): ModuleKey[] | null {
  const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!Array.isArray(list)) return null;
  return list.filter((m): m is ModuleKey => (MODULES as readonly string[]).includes(m));
}
