import { Router } from 'express';
import authRoutes from '../modules/platform/auth.routes.js';
import categoryRoutes from '../modules/inventory/category.routes.js';
import customerRoutes from '../modules/sales/customer.routes.js';
import productRoutes from '../modules/inventory/product.routes.js';
import invoiceRoutes from '../modules/sales/invoice.routes.js';
import salesOrderRoutes from '../modules/sales/salesOrder.routes.js';
import quotationRoutes from '../modules/sales/quotation.routes.js';
import deliveryChallanRoutes from '../modules/sales/deliveryChallan.routes.js';
import salesReturnRoutes from '../modules/sales/salesReturn.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import purchaseRoutes from '../modules/purchasing/purchase.routes.js';
import paymentRoutes from '../modules/sales/payment.routes.js';
import udharRoutes from '../modules/sales/udhar.routes.js';
import auditRoutes from '../modules/platform/audit.routes.js';
import gatepassRoutes from '../modules/warehouse/gatepass.routes.js';
import inboundAppointmentRoutes from '../modules/purchasing/inboundAppointment.routes.js';
import qcRoutes from '../modules/purchasing/qc.routes.js';
import waveRoutes from '../modules/warehouse/wave.routes.js';
import shipmentRoutes from '../modules/warehouse/shipment.routes.js';
import repairRoutes from '../modules/warehouse/repair.routes.js';
import khataRoutes from '../modules/sales/khata.routes.js';
import subscriptionRoutes from '../modules/sales/subscription.routes.js';
import branchRoutes from '../modules/platform/branch.routes.js';
import notificationRoutes from '../modules/platform/notification.routes.js';
import couponRoutes from '../modules/sales/coupon.routes.js';
import batchRoutes from '../modules/inventory/batch.routes.js';
import backupRoutes from '../modules/platform/backup.routes.js';
import loyaltyRoutes from '../modules/sales/loyalty.routes.js';
import masterDataRoutes from '../modules/inventory/masterData.routes.js';
import reportRoutes from '../modules/reporting/report.routes.js';
import dashboardRoutes from '../modules/reporting/dashboard.routes.js';
import settingsRoutes from '../modules/platform/settings.routes.js';
import supplierRoutes from '../modules/purchasing/supplier.routes.js';
import userRoutes from '../modules/platform/user.routes.js';
import invoiceTemplateRoutes from '../modules/sales/invoiceTemplate.routes.js';
// Advanced (ERP) modules. Each router gates itself on its feature flag, so a
// module that is switched off answers 403 rather than quietly working.
import stockTransferRoutes from '../modules/inventory/stockTransfer.routes.js';
import stockAdjustmentRoutes from '../modules/inventory/stockAdjustment.routes.js';
import stockCountRoutes from '../modules/inventory/stockCount.routes.js';
import purchaseOrderRoutes from '../modules/purchasing/purchaseOrder.routes.js';
import srvRoutes from '../modules/purchasing/srv.routes.js';
// Stock endpoints addressed under /branches. Mounted ahead of the branch
// router so `/branches/stock/:id` is matched before `/branches/:id` treats
// "stock" as an id.
import branchStockRoutes from '../modules/inventory/branchStock.routes.js';
import stockIssueRoutes from '../modules/inventory/stockIssue.routes.js';
import processRoutes from '../modules/reporting/process.routes.js';
import grnRoutes from '../modules/purchasing/grn.routes.js';
import purchaseReturnRoutes from '../modules/purchasing/purchaseReturn.routes.js';
import warehouseRoutes from '../modules/warehouse/warehouse.routes.js';
import stockOwnerRoutes from '../modules/warehouse/stockOwner.routes.js';
import productInventoryRoutes from '../modules/inventory/productInventory.routes.js';
import demandPlanningRoutes from '../modules/planning/demandPlanning.routes.js';
import replenishmentRoutes from '../modules/planning/replenishment.routes.js';
import warehouseFoundationRoutes from '../modules/warehouse/warehouseFoundation.routes.js';
// Connected hardware, and the outbound half of the API.
import deviceOpsRoutes from '../modules/warehouse/deviceOps.routes.js';
import webhookRoutes from '../modules/platform/webhook.routes.js';
import expenseRoutes from '../modules/accounting/expense.routes.js';
import cashRoutes from '../modules/accounting/cash.routes.js';
import accountingRoutes from '../modules/accounting/accounting.routes.js';
import approvalRoutes from '../modules/platform/approval.routes.js';
import ledgerRoutes from '../modules/accounting/ledger.routes.js';
// Available in both modes: costs, cash and stock integrity are not advanced
// questions, whatever the size of the business asking them.
import cashFlowRoutes from '../modules/accounting/cashflow.routes.js';
import stockAuditRoutes from '../modules/inventory/stockAudit.routes.js';
import warehouseOpsRoutes from '../modules/warehouse/warehouseOps.routes.js';
import fulfilmentRoutes from '../modules/warehouse/fulfilment.routes.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { resolveBranch } from '../middleware/branchContext.js';

const router = Router();
router.use('/auth', authRoutes);

// Everything past this point knows which branch it is acting on.
// Authenticate first so the branch can be resolved from the signed-in user.
router.use(authenticate, resolveBranch);
router.use('/categories', categoryRoutes);
router.use('/customers', customerRoutes);
router.use('/products', productRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/sales-orders', salesOrderRoutes);
router.use('/quotations', quotationRoutes);
router.use('/delivery-challans', deliveryChallanRoutes);
router.use('/sales-returns', salesReturnRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/payments', paymentRoutes);
router.use('/gatepasses', gatepassRoutes);
router.use('/inbound-appointments', inboundAppointmentRoutes);
router.use('/qc', qcRoutes);
router.use('/waves', waveRoutes);
router.use('/shipments', shipmentRoutes);
router.use('/repairs', repairRoutes);
router.use('/udhar', udharRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/khata', khataRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/branches', branchStockRoutes);
router.use('/branches', branchRoutes);
router.use('/notifications', notificationRoutes);
router.use('/coupons', couponRoutes);
router.use('/batches', batchRoutes);
router.use('/backups', backupRoutes);
router.use('/loyalty', loyaltyRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/master-data', masterDataRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/settings', settingsRoutes);
router.use('/invoice-templates', invoiceTemplateRoutes);
router.use('/users', userRoutes);

// Advanced mode.
router.use('/stock-transfers', stockTransferRoutes);
router.use('/stock-adjustments', stockAdjustmentRoutes);
router.use('/stock-counts', stockCountRoutes);
router.use('/purchase-orders', purchaseOrderRoutes);
router.use('/srv', srvRoutes);
router.use('/stock-issues', stockIssueRoutes);
router.use('/process', processRoutes);
router.use('/grn', grnRoutes);
router.use('/purchase-returns', purchaseReturnRoutes);
router.use('/warehouses', warehouseRoutes);
// Whose goods are on the shelf — one row for a shop, one per client for a 3PL.
router.use('/stock-owners', stockOwnerRoutes);
// Mounted at the root of /api rather than under a prefix: these paths extend
// existing resources (/products/:id/units) as well as adding new ones
// (/movements, /containers), and burying them under /inventory-engine would
// make the product endpoints read as if they belonged to a different system.
router.use('/', productInventoryRoutes);
router.use('/demand-planning', demandPlanningRoutes);
router.use('/replenishment', replenishmentRoutes);
// Bin routing, exceptions, tasks and storage snapshots — the layer picking,
// replenishment, packing and billing are built on.
router.use('/warehouse', warehouseFoundationRoutes);
// Mounted under /warehouse-devices rather than inside /warehouse, so the
// foundation router's module gate ('warehouses') and this one's ('devices')
// stay independent — a site can run bins without scanners, and scanners
// without ever having drawn a bin tree.
router.use('/warehouse-devices', deviceOpsRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/expenses', expenseRoutes);
router.use('/cash', cashRoutes);
router.use('/accounting', accountingRoutes);
router.use('/approvals', approvalRoutes);
// Party ledgers work in both modes — a small shop needs them most of all.
router.use('/ledgers', ledgerRoutes);
router.use('/cash-flow', cashFlowRoutes);
router.use('/stock-audit', stockAuditRoutes);
// Put-away, picking and packing — the warehouse floor.
router.use('/warehouse-ops', warehouseOpsRoutes);
// Allocate, pick, pack and dispatch a sales order.
router.use('/fulfilment', fulfilmentRoutes);

export default router;
