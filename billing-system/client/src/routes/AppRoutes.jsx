import { Suspense, lazy } from 'react';
import { Box } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import RoleRoute from '../components/RoleRoute.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import Loader from '../components/Loader.jsx';
// Eager: the two screens a signed-out visitor can land on. Everything else is
// split out below, so the first load is the shell and the page being asked for
// rather than all fifty-odd screens in the application.
import Login from '../pages/Login.jsx';
import NotFound from '../pages/NotFound.jsx';

const AuditLogs = lazy(() => import('../pages/AuditLogs.jsx'));
const Branches = lazy(() => import('../pages/Branches.jsx'));
const Backups = lazy(() => import('../pages/Backups.jsx'));
const QuickBill = lazy(() => import('../pages/QuickBill.jsx'));
const Batches = lazy(() => import('../pages/Batches.jsx'));
const TaxReports = lazy(() => import('../pages/TaxReports.jsx'));
const Coupons = lazy(() => import('../pages/Coupons.jsx'));
const Customers = lazy(() => import('../pages/Customers.jsx'));
const Dashboard = lazy(() => import('../pages/Dashboard.jsx'));
const DeliveryChallans = lazy(() => import('../pages/DeliveryChallans.jsx'));
const Srv = lazy(() => import('../pages/Srv.jsx'));
const InvoiceDesigner = lazy(() => import('../pages/InvoiceDesigner.jsx'));
const Invoices = lazy(() => import('../pages/Invoices.jsx'));
const Khata = lazy(() => import('../pages/Khata.jsx'));
const Purchases = lazy(() => import('../pages/Purchases.jsx'));
const Quotations = lazy(() => import('../pages/Quotations.jsx'));
const SalesOrders = lazy(() => import('../pages/SalesOrders.jsx'));
const SalesReturns = lazy(() => import('../pages/SalesReturns.jsx'));
const Suppliers = lazy(() => import('../pages/Suppliers.jsx'));
const Udhar = lazy(() => import('../pages/Udhar.jsx'));
const Inventory = lazy(() => import('../pages/Inventory.jsx'));
const Subscriptions = lazy(() => import('../pages/Subscriptions.jsx'));
const InvoiceTemplateSetup = lazy(() => import('../pages/InvoiceTemplateSetup.jsx'));
const Masters = lazy(() => import('../pages/Masters.jsx'));
const Products = lazy(() => import('../pages/Products.jsx'));
const Profile = lazy(() => import('../pages/Profile.jsx'));
const Register = lazy(() => import('../pages/Register.jsx'));
const Reports = lazy(() => import('../pages/Reports.jsx'));
const Settings = lazy(() => import('../pages/Settings.jsx'));
const Users = lazy(() => import('../pages/Users.jsx'));
// Planning: forecast demand, decide what to bring in, and set the parameters
// the engine plans with.
const DemandPlanning = lazy(() => import('../pages/DemandPlanning.jsx'));
const Replenishment = lazy(() => import('../pages/Replenishment.jsx'));
const InventoryPolicies = lazy(() => import('../pages/InventoryPolicies.jsx'));
// Advanced (ERP) screens. Their routes always exist; the sidebar and the API
// decide whether this company can reach them. Splitting them out means a Basic
// shop never downloads the warehouse and accounting screens at all.
const PurchaseOrders = lazy(() => import('../pages/PurchaseOrders.jsx'));
const Grn = lazy(() => import('../pages/Grn.jsx'));
const PurchaseReturns = lazy(() => import('../pages/PurchaseReturns.jsx'));
const StockTransfers = lazy(() => import('../pages/StockTransfers.jsx'));
const StockAdjustments = lazy(() => import('../pages/StockAdjustments.jsx'));
const StockCounts = lazy(() => import('../pages/StockCounts.jsx'));
const Serials = lazy(() => import('../pages/Serials.jsx'));
const Warehouses = lazy(() => import('../pages/Warehouses.jsx'));
const Ledgers = lazy(() => import('../pages/Ledgers.jsx'));
const Expenses = lazy(() => import('../pages/Expenses.jsx'));
const CashRegisters = lazy(() => import('../pages/CashRegisters.jsx'));
const BankAccounts = lazy(() => import('../pages/BankAccounts.jsx'));
const ChartOfAccounts = lazy(() => import('../pages/ChartOfAccounts.jsx'));
const JournalEntries = lazy(() => import('../pages/JournalEntries.jsx'));
const Financials = lazy(() => import('../pages/Financials.jsx'));
const Approvals = lazy(() => import('../pages/Approvals.jsx'));
const CashFlow = lazy(() => import('../pages/CashFlow.jsx'));
const StockAudit = lazy(() => import('../pages/StockAudit.jsx'));
const WarehouseFloor = lazy(() => import('../pages/WarehouseFloor.jsx'));
const Gatepasses = lazy(() => import('../pages/Gatepasses.jsx'));
const InboundAppointments = lazy(() => import('../pages/InboundAppointments.jsx'));
const QcInspections = lazy(() => import('../pages/QcInspections.jsx'));
const PickWaves = lazy(() => import('../pages/PickWaves.jsx'));
const Shipments = lazy(() => import('../pages/Shipments.jsx'));
const Repairs = lazy(() => import('../pages/Repairs.jsx'));

/**
 * Shown while a screen's chunk is being fetched. The same skeleton the pages
 * use for their own loading, so a slow network looks like a slow page rather
 * than a different kind of wait.
 */
function PageFallback() {
  return (
    <Box sx={{ p: 2 }}>
      <Loader rows={6} />
    </Box>
  );
}

export default function AppRoutes({ mode, onToggleMode }) {
  return (
    <Suspense fallback={<PageFallback />}>
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

            {/* Planning */}
            <Route path="demand-planning" element={<DemandPlanning />} />
            <Route path="replenishment" element={<Replenishment />} />
            <Route path="inventory-policies" element={<InventoryPolicies />} />

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
          </Route>
        </Route>
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
  );
}
