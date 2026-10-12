import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './stores/auth';
import { canOpen, homePath, type ModuleKey } from './lib/modules';
import { Layout } from './components/Layout';
import { ToastHost } from './components/ui';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { PosPage } from './features/pos/PosPage';
import { SalesPage } from './features/sales/SalesPage';
import { ProductsPage } from './features/products/ProductsPage';
import { InventoryPage } from './features/inventory/InventoryPage';
import { PurchasesPage } from './features/purchases/PurchasesPage';
import { CustomersPage } from './features/customers/CustomersPage';
import { CashPage } from './features/cash/CashPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { AgentPage } from './features/agent/AgentPage';
import { SettingsPage } from './features/settings/SettingsPage';

/** Page réservée : module autorisé pour l'utilisateur et permission du rôle. Sinon, retour à sa page d'accueil. */
function Guard({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const user = useAuth((s) => s.user);
  if (canOpen(user, module)) return <>{children}</>;
  const home = homePath(user);
  return home ? <Navigate to={home} replace /> : <NoAccess />;
}

/** Aucun module attribué à ce compte. */
function NoAccess() {
  const { t } = useTranslation();
  return <div className="card mx-auto mt-10 max-w-md p-6 text-center text-sm text-slate-600">{t('errors.noModule')}</div>;
}

function Home() {
  const user = useAuth((s) => s.user);
  if (canOpen(user, 'dashboard')) return <DashboardPage />;
  const home = homePath(user);
  return home ? <Navigate to={home} replace /> : <NoAccess />;
}

export function App() {
  const token = useAuth((s) => s.token);
  return (
    <>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route element={token ? <Layout /> : <Navigate to="/login" replace />}>
          <Route index element={<Home />} />
          <Route path="pos" element={<Guard module="pos"><PosPage /></Guard>} />
          <Route path="sales" element={<Guard module="sales"><SalesPage /></Guard>} />
          <Route path="products" element={<Guard module="products"><ProductsPage /></Guard>} />
          <Route path="inventory" element={<Guard module="inventory"><InventoryPage /></Guard>} />
          <Route path="purchases" element={<Guard module="purchases"><PurchasesPage /></Guard>} />
          <Route path="customers" element={<Guard module="customers"><CustomersPage /></Guard>} />
          <Route path="cash" element={<Guard module="cash"><CashPage /></Guard>} />
          <Route path="reports" element={<Guard module="reports"><ReportsPage /></Guard>} />
          <Route path="agent" element={<Guard module="agent"><AgentPage /></Guard>} />
          <Route path="settings" element={<Guard module="settings"><SettingsPage /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ToastHost />
    </>
  );
}
