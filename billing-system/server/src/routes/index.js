import { Router } from 'express';
import authRoutes from './auth.routes.js';
import categoryRoutes from './category.routes.js';
import customerRoutes from './customer.routes.js';
import productRoutes from './product.routes.js';
import invoiceRoutes from './invoice.routes.js';
import salesOrderRoutes from './salesOrder.routes.js';
import quotationRoutes from './quotation.routes.js';
import deliveryChallanRoutes from './deliveryChallan.routes.js';
import salesReturnRoutes from './salesReturn.routes.js';
import inventoryRoutes from './inventory.routes.js';
import purchaseRoutes from './purchase.routes.js';
import paymentRoutes from './payment.routes.js';
import udharRoutes from './udhar.routes.js';
import auditRoutes from './audit.routes.js';
import khataRoutes from './khata.routes.js';
import branchRoutes from './branch.routes.js';
import notificationRoutes from './notification.routes.js';
import couponRoutes from './coupon.routes.js';
import batchRoutes from './batch.routes.js';
import backupRoutes from './backup.routes.js';
import loyaltyRoutes from './loyalty.routes.js';
import masterDataRoutes from './masterData.routes.js';
import reportRoutes from './report.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import settingsRoutes from './settings.routes.js';
import supplierRoutes from './supplier.routes.js';
import userRoutes from './user.routes.js';
import invoiceTemplateRoutes from './invoiceTemplate.routes.js';
// Advanced (ERP) modules. Each router gates itself on its feature flag, so a
// module that is switched off answers 403 rather than quietly working.
import stockTransferRoutes from './stockTransfer.routes.js';
import stockAdjustmentRoutes from './stockAdjustment.routes.js';
import stockCountRoutes from './stockCount.routes.js';
import purchaseOrderRoutes from './purchaseOrder.routes.js';
import grnRoutes from './grn.routes.js';
import purchaseReturnRoutes from './purchaseReturn.routes.js';
import warehouseRoutes from './warehouse.routes.js';
import stockOwnerRoutes from './stockOwner.routes.js';
import warehouseFoundationRoutes from './warehouseFoundation.routes.js';
import expenseRoutes from './expense.routes.js';
import cashRoutes from './cash.routes.js';
import accountingRoutes from './accounting.routes.js';
import approvalRoutes from './approval.routes.js';
import ledgerRoutes from './ledger.routes.js';
// Available in both modes: costs, cash and stock integrity are not advanced
// questions, whatever the size of the business asking them.
import cashFlowRoutes from './cashflow.routes.js';
import stockAuditRoutes from './stockAudit.routes.js';
import warehouseOpsRoutes from './warehouseOps.routes.js';
import fulfilmentRoutes from './fulfilment.routes.js';
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
router.use('/udhar', udharRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/khata', khataRoutes);
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
router.use('/grn', grnRoutes);
router.use('/purchase-returns', purchaseReturnRoutes);
router.use('/warehouses', warehouseRoutes);
// Whose goods are on the shelf — one row for a shop, one per client for a 3PL.
router.use('/stock-owners', stockOwnerRoutes);
// Bin routing, exceptions, tasks and storage snapshots — the layer picking,
// replenishment, packing and billing are built on.
router.use('/warehouse', warehouseFoundationRoutes);
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
