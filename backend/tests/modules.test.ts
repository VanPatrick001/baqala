import { describe, expect, it } from 'vitest';
import { effectivePermissions } from '../src/core/modules.js';

const CASHIER = ['pos.use', 'sales.view_own', 'customers.view', 'customers.create', 'cash.session', 'products.view'];

describe('effectivePermissions', () => {
  it('garde les droits du rôle quand aucun module n\'est restreint', () => {
    expect(effectivePermissions(CASHIER, null)).toEqual(CASHIER);
  });

  it('la caisse seule garde ce dont la caisse a besoin', () => {
    const p = effectivePermissions(CASHIER, ['pos']);
    expect(p).toEqual(expect.arrayContaining(['pos.use', 'products.view', 'customers.view', 'cash.session']));
  });

  it('retire les modules non autorisés', () => {
    const p = effectivePermissions(['dashboard.view', 'reports.*', 'agent.*'], ['reports']);
    expect(p).toContain('reports.*');
    expect(p).not.toContain('agent.*');
    expect(p).not.toContain('dashboard.view');
  });

  it("n'accorde jamais plus que le rôle", () => {
    const p = effectivePermissions(['pos.use'], ['pos', 'settings']);
    expect(p).toEqual(['pos.use']);
  });

  it("transforme '*' en domaines des modules autorisés", () => {
    const p = effectivePermissions(['*'], ['settings', 'reports']);
    expect(p).toEqual(expect.arrayContaining(['settings.*', 'users.*', 'taxes.*', 'audit.*', 'reports.*']));
    expect(p).not.toContain('pos.*');
    expect(p).not.toContain('*');
  });
});
