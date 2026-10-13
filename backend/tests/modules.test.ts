import { describe, expect, it } from 'vitest';
import { effectivePermissions, userModules, userPermissions } from '../src/core/modules.js';

const SELLER = ['pos.use', 'sales.view_own', 'sales.void_own', 'customers.view', 'customers.create', 'cash.session', 'products.view'];
const MANAGER = ['dashboard.view', 'products.*', 'cash.*', 'reports.*', 'users.manage_sellers'];

describe('effectivePermissions', () => {
  it('garde les droits du rôle quand aucun module n\'est restreint', () => {
    expect(effectivePermissions(SELLER, null)).toEqual(expect.arrayContaining(SELLER));
  });

  it('la caisse seule garde ce dont la caisse a besoin', () => {
    const p = effectivePermissions(SELLER, ['pos']);
    expect(p).toEqual(expect.arrayContaining(['pos.use', 'products.view', 'customers.view', 'cash.session']));
  });

  it('retire les modules non cochés', () => {
    const p = effectivePermissions(['dashboard.view', 'reports.*', 'agent.*'], ['reports']);
    expect(p).toContain('reports.*');
    expect(p).not.toContain('agent.*');
    expect(p).not.toContain('dashboard.view');
  });

  it("un module coché donne son accès de base, même si le rôle ne l'a pas", () => {
    const p = effectivePermissions(SELLER, ['pos', 'reports', 'inventory']);
    expect(p).toEqual(expect.arrayContaining(['reports.view', 'stock.view']));
  });

  it('un module coché ne donne jamais la comptabilité ni la gestion des utilisateurs', () => {
    const p = effectivePermissions(SELLER, ['pos', 'cash', 'settings']);
    expect(p).not.toContain('cash.manage');
    expect(p).not.toContain('cash.view');
    expect(p).not.toContain('users.manage');
    expect(p).not.toContain('users.manage_sellers');
  });

  it('gérer implique consulter', () => {
    const p = effectivePermissions(['stock.manage', 'cash.manage', 'sales.void'], null);
    expect(p).toEqual(expect.arrayContaining(['stock.view', 'products.view', 'cash.view', 'cash.session', 'sales.void_own', 'sales.view']));
  });

  it("transforme '*' en domaines des modules autorisés", () => {
    const p = effectivePermissions(['*'], ['settings', 'reports']);
    expect(p).toEqual(expect.arrayContaining(['settings.*', 'users.*', 'taxes.*', 'audit.*', 'reports.*']));
    expect(p).not.toContain('pos.*');
    expect(p).not.toContain('*');
  });
});

describe('userPermissions', () => {
  it("l'administrateur peut tout faire, même avec des modules cochés", () => {
    expect(userPermissions({ role: 'ADMIN', permissions: ['*'], modules: ['pos'] })).toEqual(['*']);
    expect(userModules({ role: 'ADMIN', modules: ['pos'] })).toBeNull();
  });

  it('le manager a tous les droits du vendeur, y compris ceux ajoutés au vendeur', () => {
    const seller = [...SELLER, 'stock.view'];
    const p = userPermissions({ role: 'MANAGER', permissions: MANAGER, seller_permissions: JSON.stringify(seller), modules: null });
    expect(p).toEqual(expect.arrayContaining(seller));
    expect(p).toEqual(expect.arrayContaining(MANAGER));
  });

  it('le vendeur garde ses seuls droits', () => {
    const p = userPermissions({ role: 'CASHIER', permissions: SELLER, seller_permissions: SELLER, modules: null });
    expect(p).not.toContain('cash.manage');
    expect(p).not.toContain('reports.view');
  });
});
