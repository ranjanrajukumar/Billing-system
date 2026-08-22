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
import Login from '../modules/platform/Login.jsx';
import NotFound from '../modules/platform/NotFound.jsx';

const AuditLogs = lazy(() => import('../modules/platform/AuditLogs.jsx'));
const StockOwners = lazy(() => import('../modules/warehouse/StockOwners.jsx'));
const Devices = lazy(() => import('../modules/warehouse/Devices.jsx'));
const Sensors = lazy(() => import('../modules/warehouse/Sensors.jsx'));
const RfidTags = lazy(() => import('../modules/warehouse/RfidTags.jsx'));
const Webhooks = lazy(() => import('../modules/platform/Webhooks.jsx'));
const Branches = lazy(() => import('../modules/platform/Branches.jsx'));
const Backups = lazy(() => import('../modules/platform/Backups.jsx'));
const QuickBill = lazy(() => import('../modules/sales/QuickBill.jsx'));
const Batches = lazy(() => import('../modules/inventory/Batches.jsx'));
const TaxReports = lazy(() => import('../modules/sales/TaxReports.jsx'));
const Coupons = lazy(() => import('../modules/sales/Coupons.jsx'));
const Customers = lazy(() => import('../modules/sales/Customers.jsx'));
const Dashboard = lazy(() => import('../modules/reporting/Dashboard.jsx'));
const DeliveryChallans = lazy(() => import('../modules/sales/DeliveryChallans.jsx'));
const Srv = lazy(() => import('../modules/purchasing/Srv.jsx'));
const StockIssues = lazy(() => import('../modules/inventory/StockIssues.jsx'));
const ProcessOverview = lazy(() => import('../modules/reporting/ProcessOverview.jsx'));
const StockIssueReturns = lazy(() => import('../modules/inventory/StockIssueReturns.jsx'));
const InvoiceDesigner = lazy(() => import('../modules/sales/InvoiceDesigner.jsx'));
const Invoices = lazy(() => import('../modules/sales/Invoices.jsx'));
const Khata = lazy(() => import('../modules/sales/Khata.jsx'));
const Purchases = lazy(() => import('../modules/purchasing/Purchases.jsx'));
const Quotations = lazy(() => import('../modules/sales/Quotations.jsx'));
const SalesOrders = lazy(() => import('../modules/sales/SalesOrders.jsx'));
const SalesReturns = lazy(() => import('../modules/sales/SalesReturns.jsx'));
const Suppliers = lazy(() => import('../modules/purchasing/Suppliers.jsx'));
const Udhar = lazy(() => import('../modules/sales/Udhar.jsx'));
const Inventory = lazy(() => import('../modules/inventory/Inventory.jsx'));
const Subscriptions = lazy(() => import('../modules/sales/Subscriptions.jsx'));
const InvoiceTemplateSetup = lazy(() => import('../modules/sales/InvoiceTemplateSetup.jsx'));
const Masters = lazy(() => import('../modules/inventory/Masters.jsx'));
const Products = lazy(() => import('../modules/inventory/Products.jsx'));
const Profile = lazy(() => import('../modules/platform/Profile.jsx'));
const Register = lazy(() => import('../modules/platform/Register.jsx'));
const Reports = lazy(() => import('../modules/reporting/Reports.jsx'));
const Settings = lazy(() => import('../modules/platform/Settings.jsx'));
const Users = lazy(() => import('../modules/platform/Users.jsx'));
// Planning: forecast demand, decide what to bring in, and set the parameters
// the engine plans with.
const DemandPlanning = lazy(() => import('../modules/planning/DemandPlanning.jsx'));
const Replenishment = lazy(() => import('../modules/planning/Replenishment.jsx'));
const InventoryPolicies = lazy(() => import('../modules/planning/InventoryPolicies.jsx'));
// Advanced (ERP) screens. Their routes always exist; the sidebar and the API
// decide whether this company can reach them. Splitting them out means a Basic
// shop never downloads the warehouse and accounting screens at all.
const PurchaseOrders = lazy(() => import('../modules/purchasing/PurchaseOrders.jsx'));
const Grn = lazy(() => import('../modules/purchasing/Grn.jsx'));
const PurchaseReturns = lazy(() => import('../modules/purchasing/PurchaseReturns.jsx'));
const StockTransfers = lazy(() => import('../modules/inventory/StockTransfers.jsx'));
const StockAdjustments = lazy(() => import('../modules/inventory/StockAdjustments.jsx'));
const StockCounts = lazy(() => import('../modules/inventory/StockCounts.jsx'));
const Serials = lazy(() => import('../modules/inventory/Serials.jsx'));
const Warehouses = lazy(() => import('../modules/warehouse/Warehouses.jsx'));
const Ledgers = lazy(() => import('../modules/accounting/Ledgers.jsx'));
const Expenses = lazy(() => import('../modules/accounting/Expenses.jsx'));
const CashRegisters = lazy(() => import('../modules/accounting/CashRegisters.jsx'));
const BankAccounts = lazy(() => import('../modules/accounting/BankAccounts.jsx'));
const ChartOfAccounts = lazy(() => import('../modules/accounting/ChartOfAccounts.jsx'));
const JournalEntries = lazy(() => import('../modules/accounting/JournalEntries.jsx'));
const Financials = lazy(() => import('../modules/accounting/Financials.jsx'));
const Approvals = lazy(() => import('../modules/platform/Approvals.jsx'));
const CashFlow = lazy(() => import('../modules/accounting/CashFlow.jsx'));
const StockAudit = lazy(() => import('../modules/inventory/StockAudit.jsx'));
const WarehouseFloor = lazy(() => import('../modules/warehouse/WarehouseFloor.jsx'));
const Gatepasses = lazy(() => import('../modules/warehouse/Gatepasses.jsx'));
const InboundAppointments = lazy(() => import('../modules/purchasing/InboundAppointments.jsx'));
const QcInspections = lazy(() => import('../modules/purchasing/QcInspections.jsx'));
const PickWaves = lazy(() => import('../modules/warehouse/PickWaves.jsx'));
const Shipments = lazy(() => import('../modules/warehouse/Shipments.jsx'));
const Repairs = lazy(() => import('../modules/warehouse/Repairs.jsx'));

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
            {/* One route for every process; which flows exist is the server's
                to say, and the page renders whichever it is handed. */}
            <Route path="process/:key" element={<ProcessOverview />} />
            <Route path="stock-issues" element={<StockIssues />} />
            <Route path="stock-issue-returns" element={<StockIssueReturns />} />
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
            <Route path="stock-owners" element={<StockOwners />} />
            <Route path="devices" element={<Devices />} />
            <Route path="sensors" element={<Sensors />} />
            <Route path="rfid-tags" element={<RfidTags />} />
            <Route path="webhooks" element={<Webhooks />} />
          </Route>
        </Route>
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
  );
}
