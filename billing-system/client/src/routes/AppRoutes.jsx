import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import RoleRoute from '../components/RoleRoute.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import AuditLogs from '../pages/AuditLogs.jsx';
import Branches from '../pages/Branches.jsx';
import Backups from '../pages/Backups.jsx';
import QuickBill from '../pages/QuickBill.jsx';
import Batches from '../pages/Batches.jsx';
import TaxReports from '../pages/TaxReports.jsx';
import Coupons from '../pages/Coupons.jsx';
import Customers from '../pages/Customers.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import DeliveryChallans from '../pages/DeliveryChallans.jsx';
import Srv from '../pages/Srv.jsx';
import InvoiceDesigner from '../pages/InvoiceDesigner.jsx';
import Invoices from '../pages/Invoices.jsx';
import Khata from '../pages/Khata.jsx';
import Purchases from '../pages/Purchases.jsx';
import Quotations from '../pages/Quotations.jsx';
import SalesOrders from '../pages/SalesOrders.jsx';
import SalesReturns from '../pages/SalesReturns.jsx';
import Suppliers from '../pages/Suppliers.jsx';
import Udhar from '../pages/Udhar.jsx';
import Inventory from '../pages/Inventory.jsx';
import Subscriptions from '../pages/Subscriptions.jsx';
import InvoiceTemplateSetup from '../pages/InvoiceTemplateSetup.jsx';
import Login from '../pages/Login.jsx';
import Masters from '../pages/Masters.jsx';
import NotFound from '../pages/NotFound.jsx';
import Products from '../pages/Products.jsx';
import Profile from '../pages/Profile.jsx';
import Register from '../pages/Register.jsx';
import Reports from '../pages/Reports.jsx';
import Settings from '../pages/Settings.jsx';
import Users from '../pages/Users.jsx';
// Advanced (ERP) screens. Their routes always exist; the sidebar and the API
// decide whether this company can reach them.
import PurchaseOrders from '../pages/PurchaseOrders.jsx';
import Grn from '../pages/Grn.jsx';
import PurchaseReturns from '../pages/PurchaseReturns.jsx';
import StockTransfers from '../pages/StockTransfers.jsx';
import StockAdjustments from '../pages/StockAdjustments.jsx';
import StockCounts from '../pages/StockCounts.jsx';
import Serials from '../pages/Serials.jsx';
import Warehouses from '../pages/Warehouses.jsx';
import Ledgers from '../pages/Ledgers.jsx';
import Expenses from '../pages/Expenses.jsx';
import CashRegisters from '../pages/CashRegisters.jsx';
import BankAccounts from '../pages/BankAccounts.jsx';
import ChartOfAccounts from '../pages/ChartOfAccounts.jsx';
import JournalEntries from '../pages/JournalEntries.jsx';
import Financials from '../pages/Financials.jsx';
import Approvals from '../pages/Approvals.jsx';
import CashFlow from '../pages/CashFlow.jsx';
import StockAudit from '../pages/StockAudit.jsx';
import WarehouseFloor from '../pages/WarehouseFloor.jsx';
import Gatepasses from '../pages/Gatepasses.jsx';
import InboundAppointments from '../pages/InboundAppointments.jsx';
import QcInspections from '../pages/QcInspections.jsx';
import PickWaves from '../pages/PickWaves.jsx';
import Shipments from '../pages/Shipments.jsx';
import Repairs from '../pages/Repairs.jsx';

export default function AppRoutes({ mode, onToggleMode }) {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout mode={mode} onToggleMode={onToggleMode} />}>
          <Route index element={<Dashboard />} />
          <Route path="masters" element={<Masters />} />
          <Route path="customers" element={<Customers />} />
          <Route path="products" element={<Products />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="sales-orders" element={<SalesOrders />} />
          <Route path="quotations" element={<Quotations />} />
          <Route path="delivery-challans" element={<DeliveryChallans />} />
          <Route path="sales-returns" element={<SalesReturns />} />
          <Route path="udhar" element={<Udhar />} />
          <Route path="khata" element={<Khata />} />
          <Route path="quick-bill" element={<QuickBill />} />
          <Route path="subscriptions" element={<Subscriptions />} />
          <Route path="coupons" element={<Coupons />} />
          <Route path="batches" element={<Batches />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="purchases" element={<Purchases />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="reports" element={<RoleRoute><Reports /></RoleRoute>} />
          <Route path="tax-reports" element={<RoleRoute><TaxReports /></RoleRoute>} />
          <Route path="users" element={<RoleRoute><Users /></RoleRoute>} />
          <Route path="settings" element={<Settings />} />
          <Route path="branches" element={<Branches />} />
          <Route path="audit-logs" element={<RoleRoute><AuditLogs /></RoleRoute>} />
          <Route path="backups" element={<RoleRoute><Backups /></RoleRoute>} />
          <Route path="invoice-templates" element={<InvoiceTemplateSetup />} />
          <Route path="invoice-templates/:id/design" element={<InvoiceDesigner />} />
          <Route path="profile" element={<Profile />} />

          {/* Advanced mode */}
          <Route path="purchase-orders" element={<PurchaseOrders />} />
          <Route path="srv" element={<Srv />} />
          <Route path="grn" element={<Grn />} />
          <Route path="purchase-returns" element={<PurchaseReturns />} />
          <Route path="stock-transfers" element={<StockTransfers />} />
          <Route path="stock-adjustments" element={<StockAdjustments />} />
          <Route path="stock-counts" element={<StockCounts />} />
          <Route path="serials" element={<Serials />} />
          <Route path="gatepasses" element={<Gatepasses />} />
          <Route path="inbound-appointments" element={<InboundAppointments />} />
          <Route path="qc" element={<QcInspections />} />
          <Route path="waves" element={<PickWaves />} />
          <Route path="shipments" element={<Shipments />} />
          <Route path="repairs" element={<Repairs />} />
          <Route path="ledgers" element={<Ledgers />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="cash-registers" element={<CashRegisters />} />
          <Route path="bank-accounts" element={<BankAccounts />} />
          <Route path="chart-of-accounts" element={<ChartOfAccounts />} />
          <Route path="warehouses" element={<Warehouses />} />
          <Route path="journal-entries" element={<JournalEntries />} />
          <Route path="financials" element={<Financials />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="cash-flow" element={<CashFlow />} />
          <Route path="stock-audit" element={<StockAudit />} />
          <Route path="warehouse-floor" element={<WarehouseFloor />} />
          <Route path="gatepasses" element={<Gatepasses />} />
        </Route>
      </Route>
      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
