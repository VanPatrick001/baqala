import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, useCan } from './stores/auth';
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

function Guard({ perm, children }: { perm: string[]; children: ReactNode }) {
  const allowed = useCan(...perm);
  return allowed ? <>{children}</> : <Navigate to="/pos" replace />;
}

export function App() {
  const token = useAuth((s) => s.token);
  return (
    <>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route element={token ? <Layout /> : <Navigate to="/login" replace />}>
          <Route index element={<Guard perm={['dashboard.view', 'reports.view']}><DashboardPage /></Guard>} />
          <Route path="pos" element={<PosPage />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="products" element={<Guard perm={['products.view']}><ProductsPage /></Guard>} />
          <Route path="inventory" element={<Guard perm={['stock.view']}><InventoryPage /></Guard>} />
          <Route path="purchases" element={<Guard perm={['purchases.view']}><PurchasesPage /></Guard>} />
          <Route path="customers" element={<Guard perm={['customers.view']}><CustomersPage /></Guard>} />
          <Route path="cash" element={<Guard perm={['cash.view', 'cash.session']}><CashPage /></Guard>} />
          <Route path="reports" element={<Guard perm={['reports.view']}><ReportsPage /></Guard>} />
          <Route path="agent" element={<Guard perm={['agent.view']}><AgentPage /></Guard>} />
          <Route path="settings" element={<Guard perm={['settings.manage', 'taxes.view', 'users.manage']}><SettingsPage /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <ToastHost />
    </>
  );
}
