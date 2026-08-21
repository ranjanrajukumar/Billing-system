import { sequelize } from '../config/database.js';
import RoleModel from './role.model.js';
import UserModel from './user.model.js';
import CustomerModel from './customer.model.js';
import CategoryModel from './category.model.js';
import ProductModel from './product.model.js';
import InvoiceModel from './invoice.model.js';
import InvoiceItemModel from './invoiceItem.model.js';
import PaymentModel from './payment.model.js';
import SupplierModel from './supplier.model.js';
import PurchaseModel from './purchase.model.js';
import PurchaseItemModel from './purchaseItem.model.js';
import StockMovementModel from './stockMovement.model.js';
import CompanyModel from './company.model.js';
import SettingModel from './setting.model.js';
import BrandModel from './brand.model.js';
import UnitModel from './unit.model.js';
import WarehouseModel from './warehouse.model.js';
import GstTaxModel from './gstTax.model.js';
import HsnSacModel from './hsnSac.model.js';
import PaymentModeModel from './paymentMode.model.js';
import ExpenseCategoryModel from './expenseCategory.model.js';
import FinancialYearModel from './financialYear.model.js';
import InvoiceSettingModel from './invoiceSettings.model.js';
import SalesOrderModel from './salesOrder.model.js';
import SalesOrderItemModel from './salesOrderItem.model.js';
import QuotationModel from './quotation.model.js';
import QuotationItemModel from './quotationItem.model.js';
import DeliveryChallanModel from './deliveryChallan.model.js';
import DeliveryChallanItemModel from './deliveryChallanItem.model.js';
import SalesReturnModel from './salesReturn.model.js';
import SalesReturnItemModel from './salesReturnItem.model.js';
import InvoiceTemplateModel from './invoiceTemplate.model.js';
import AuditLogModel from './auditLog.model.js';
import KhataEntryModel from './khataEntry.model.js';
import BranchModel from './branch.model.js';
import BranchStockModel from './branchStock.model.js';
import StockOwnerModel from './stockOwner.model.js';
import IdempotencyKeyModel from './idempotencyKey.model.js';
import WarehouseExceptionModel from './warehouseException.model.js';
import WarehouseTaskModel from './warehouseTask.model.js';
import WarehouseStorageSnapshotModel from './warehouseStorageSnapshot.model.js';
import CouponModel from './coupon.model.js';
import CouponUsageModel from './couponUsage.model.js';
import LoyaltyTransactionModel from './loyaltyTransaction.model.js';
import ProductBatchModel from './productBatch.model.js';
import FeatureFlagModel from './featureFlag.model.js';
import StockTransferModel from './stockTransfer.model.js';
import StockTransferItemModel from './stockTransferItem.model.js';
import StockAdjustmentModel from './stockAdjustment.model.js';
import StockAdjustmentItemModel from './stockAdjustmentItem.model.js';
import StockCountModel from './stockCount.model.js';
import StockCountItemModel from './stockCountItem.model.js';
import PurchaseOrderModel from './purchaseOrder.model.js';
import PurchaseOrderItemModel from './purchaseOrderItem.model.js';
import GrnModel from './grn.model.js';
import GrnItemModel from './grnItem.model.js';
import SrvModel from './srv.model.js';
import SrvItemModel from './srvItem.model.js';
import PurchaseReturnModel from './purchaseReturn.model.js';
import PurchaseReturnItemModel from './purchaseReturnItem.model.js';
import ProductSerialModel from './productSerial.model.js';
import WarehouseBinModel from './warehouseBin.model.js';
import BinStockModel from './binStock.model.js';
import PutAwayRuleModel from './putAwayRule.model.js';
import UserLocationModel from './userLocation.model.js';
import PackingSlipModel from './packingSlip.model.js';
import PackingSlipItemModel from './packingSlipItem.model.js';
import ExpenseModel from './expense.model.js';
import CashRegisterModel from './cashRegister.model.js';
import CashTransactionModel from './cashTransaction.model.js';
import BankAccountModel from './bankAccount.model.js';
import BankTransactionModel from './bankTransaction.model.js';
import ChartOfAccountModel from './chartOfAccount.model.js';
import JournalEntryModel from './journalEntry.model.js';
import JournalEntryLineModel from './journalEntryLine.model.js';
import ApprovalRuleModel from './approvalRule.model.js';
import ApprovalRequestModel from './approvalRequest.model.js';
import GatepassModel from './gatepass.model.js';
import InboundAppointmentModel from './inboundAppointment.model.js';
import QcInspectionModel from './qcInspection.model.js';
import PickWaveModel from './pickWave.model.js';
import ShipmentModel from './shipment.model.js';
import RepairOrderModel from './repairOrder.model.js';
import { installAuditHooks } from '../services/audit.service.js';
import SubscriptionModel from './subscription.model.js';

export const Role = RoleModel(sequelize);
export const User = UserModel(sequelize);
export const Customer = CustomerModel(sequelize);
export const Category = CategoryModel(sequelize);
export const Product = ProductModel(sequelize);
export const Invoice = InvoiceModel(sequelize);
export const InvoiceItem = InvoiceItemModel(sequelize);
export const Payment = PaymentModel(sequelize);
export const Supplier = SupplierModel(sequelize);
export const Purchase = PurchaseModel(sequelize);
export const PurchaseItem = PurchaseItemModel(sequelize);
export const StockMovement = StockMovementModel(sequelize);
export const Company = CompanyModel(sequelize);
export const Setting = SettingModel(sequelize);
export const Brand = BrandModel(sequelize);
export const Unit = UnitModel(sequelize);
export const Warehouse = WarehouseModel(sequelize);
export const GstTax = GstTaxModel(sequelize);
export const HsnSac = HsnSacModel(sequelize);
export const PaymentMode = PaymentModeModel(sequelize);
export const ExpenseCategory = ExpenseCategoryModel(sequelize);
export const FinancialYear = FinancialYearModel(sequelize);
export const InvoiceSetting = InvoiceSettingModel(sequelize);
export const SalesOrder = SalesOrderModel(sequelize);
export const SalesOrderItem = SalesOrderItemModel(sequelize);
export const Quotation = QuotationModel(sequelize);
export const QuotationItem = QuotationItemModel(sequelize);
export const DeliveryChallan = DeliveryChallanModel(sequelize);
export const DeliveryChallanItem = DeliveryChallanItemModel(sequelize);
export const SalesReturn = SalesReturnModel(sequelize);
export const SalesReturnItem = SalesReturnItemModel(sequelize);
export const InvoiceTemplate = InvoiceTemplateModel(sequelize);
export const AuditLog = AuditLogModel(sequelize);
export const KhataEntry = KhataEntryModel(sequelize);
export const Branch = BranchModel(sequelize);
export const StockOwner = StockOwnerModel(sequelize);
export const IdempotencyKey = IdempotencyKeyModel(sequelize);
export const WarehouseException = WarehouseExceptionModel(sequelize);
export const WarehouseTask = WarehouseTaskModel(sequelize);
export const WarehouseStorageSnapshot = WarehouseStorageSnapshotModel(sequelize);
export const BranchStock = BranchStockModel(sequelize);
export const Coupon = CouponModel(sequelize);
export const CouponUsage = CouponUsageModel(sequelize);
export const LoyaltyTransaction = LoyaltyTransactionModel(sequelize);
export const ProductBatch = ProductBatchModel(sequelize);
export const FeatureFlag = FeatureFlagModel(sequelize);
export const StockTransfer = StockTransferModel(sequelize);
export const StockTransferItem = StockTransferItemModel(sequelize);
export const StockAdjustment = StockAdjustmentModel(sequelize);
export const StockAdjustmentItem = StockAdjustmentItemModel(sequelize);
export const StockCount = StockCountModel(sequelize);
export const StockCountItem = StockCountItemModel(sequelize);
export const PurchaseOrder = PurchaseOrderModel(sequelize);
export const PurchaseOrderItem = PurchaseOrderItemModel(sequelize);
export const Grn = GrnModel(sequelize);
export const GrnItem = GrnItemModel(sequelize);
export const Srv = SrvModel(sequelize);
export const SrvItem = SrvItemModel(sequelize);
export const PurchaseReturn = PurchaseReturnModel(sequelize);
export const PurchaseReturnItem = PurchaseReturnItemModel(sequelize);
export const ProductSerial = ProductSerialModel(sequelize);
export const WarehouseBin = WarehouseBinModel(sequelize);
export const BinStock = BinStockModel(sequelize);
export const PutAwayRule = PutAwayRuleModel(sequelize);
export const UserLocation = UserLocationModel(sequelize);
export const PackingSlip = PackingSlipModel(sequelize);
export const PackingSlipItem = PackingSlipItemModel(sequelize);
export const Expense = ExpenseModel(sequelize);
export const CashRegister = CashRegisterModel(sequelize);
export const CashTransaction = CashTransactionModel(sequelize);
export const BankAccount = BankAccountModel(sequelize);
export const BankTransaction = BankTransactionModel(sequelize);
export const ChartOfAccount = ChartOfAccountModel(sequelize);
export const JournalEntry = JournalEntryModel(sequelize);
export const JournalEntryLine = JournalEntryLineModel(sequelize);
export const ApprovalRule = ApprovalRuleModel(sequelize);
export const ApprovalRequest = ApprovalRequestModel(sequelize);
export const Gatepass = GatepassModel(sequelize);
export const InboundAppointment = InboundAppointmentModel(sequelize);
export const QcInspection = QcInspectionModel(sequelize);
export const PickWave = PickWaveModel(sequelize);
export const Shipment = ShipmentModel(sequelize);
export const RepairOrder = RepairOrderModel(sequelize);
export const Subscription = SubscriptionModel(sequelize);

Role.hasMany(User, { foreignKey: 'roleId', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
User.belongsTo(Role, { foreignKey: 'roleId', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

Customer.hasMany(Subscription, { foreignKey: 'customerId' });
Subscription.belongsTo(Customer, { foreignKey: 'customerId' });
Product.hasMany(Subscription, { foreignKey: 'productId' });
Subscription.belongsTo(Product, { foreignKey: 'productId' });

Category.hasMany(Product, { foreignKey: 'categoryId' });
Product.belongsTo(Category, { foreignKey: 'categoryId' });

Product.belongsTo(Product, { as: 'parent', foreignKey: 'parentId' });
Product.hasMany(Product, { as: 'variants', foreignKey: 'parentId' });
Product.belongsTo(Branch, { as: 'warehouse', foreignKey: 'warehouseId' });

Supplier.hasMany(Purchase, { foreignKey: 'supplierId' });
Purchase.belongsTo(Supplier, { foreignKey: 'supplierId' });
User.hasMany(Purchase, { foreignKey: 'createdBy' });
Purchase.belongsTo(User, { foreignKey: 'createdBy', as: 'purchaseCreator' });
Purchase.hasMany(PurchaseItem, { foreignKey: 'purchaseId', onDelete: 'CASCADE' });
PurchaseItem.belongsTo(Purchase, { foreignKey: 'purchaseId' });
Product.hasMany(PurchaseItem, { foreignKey: 'productId' });
PurchaseItem.belongsTo(Product, { foreignKey: 'productId' });
Product.hasMany(StockMovement, { foreignKey: 'productId' });
StockMovement.belongsTo(Product, { foreignKey: 'productId' });
User.hasMany(StockMovement, { foreignKey: 'createdBy' });
StockMovement.belongsTo(User, { foreignKey: 'createdBy', as: 'stockUser' });

Customer.hasMany(Invoice, { foreignKey: 'customerId' });
Invoice.belongsTo(Customer, { foreignKey: 'customerId' });
User.hasMany(Invoice, { foreignKey: 'createdBy' });
Invoice.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

Invoice.hasMany(InvoiceItem, { foreignKey: 'invoiceId', onDelete: 'CASCADE' });
InvoiceItem.belongsTo(Invoice, { foreignKey: 'invoiceId' });
Product.hasMany(InvoiceItem, { foreignKey: 'productId' });
InvoiceItem.belongsTo(Product, { foreignKey: 'productId' });

Invoice.hasMany(Payment, { foreignKey: 'invoiceId' });
Payment.belongsTo(Invoice, { foreignKey: 'invoiceId' });

// Phase 1 Associations
Customer.hasMany(SalesOrder, { foreignKey: 'customerId' });
SalesOrder.belongsTo(Customer, { foreignKey: 'customerId' });
User.hasMany(SalesOrder, { foreignKey: 'createdBy' });
SalesOrder.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
SalesOrder.hasMany(SalesOrderItem, { foreignKey: 'orderId', onDelete: 'CASCADE' });
SalesOrderItem.belongsTo(SalesOrder, { foreignKey: 'orderId' });
Product.hasMany(SalesOrderItem, { foreignKey: 'productId' });
SalesOrderItem.belongsTo(Product, { foreignKey: 'productId' });

Customer.hasMany(Quotation, { foreignKey: 'customerId' });
Quotation.belongsTo(Customer, { foreignKey: 'customerId' });
User.hasMany(Quotation, { foreignKey: 'createdBy' });
Quotation.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
Quotation.hasMany(QuotationItem, { foreignKey: 'quotationId', onDelete: 'CASCADE' });
QuotationItem.belongsTo(Quotation, { foreignKey: 'quotationId' });
Product.hasMany(QuotationItem, { foreignKey: 'productId' });
QuotationItem.belongsTo(Product, { foreignKey: 'productId' });

Customer.hasMany(DeliveryChallan, { foreignKey: 'customerId' });
DeliveryChallan.belongsTo(Customer, { foreignKey: 'customerId' });
User.hasMany(DeliveryChallan, { foreignKey: 'createdBy' });
DeliveryChallan.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
DeliveryChallan.hasMany(DeliveryChallanItem, { foreignKey: 'challanId', onDelete: 'CASCADE' });
DeliveryChallanItem.belongsTo(DeliveryChallan, { foreignKey: 'challanId' });
Product.hasMany(DeliveryChallanItem, { foreignKey: 'productId' });
DeliveryChallanItem.belongsTo(Product, { foreignKey: 'productId' });

Customer.hasMany(SalesReturn, { foreignKey: 'customerId' });
SalesReturn.belongsTo(Customer, { foreignKey: 'customerId' });
Invoice.hasMany(SalesReturn, { foreignKey: 'invoiceId' });
SalesReturn.belongsTo(Invoice, { foreignKey: 'invoiceId' });
User.hasMany(SalesReturn, { foreignKey: 'createdBy' });
SalesReturn.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
SalesReturn.hasMany(SalesReturnItem, { foreignKey: 'returnId', onDelete: 'CASCADE' });
SalesReturnItem.belongsTo(SalesReturn, { foreignKey: 'returnId' });
Product.hasMany(SalesReturnItem, { foreignKey: 'productId' });
SalesReturnItem.belongsTo(Product, { foreignKey: 'productId' });

// Branch scoping: transactions happen at a location, masters are shared.
Branch.hasMany(User, { foreignKey: 'branchId' });
User.belongsTo(Branch, { foreignKey: 'branchId' });

Branch.hasMany(Gatepass, { foreignKey: 'branchId' });
Gatepass.belongsTo(Branch, { foreignKey: 'branchId' });

User.hasMany(Gatepass, { foreignKey: 'authadd', as: 'creator' });
Gatepass.belongsTo(User, { foreignKey: 'authadd', as: 'creator' });

Branch.hasMany(BranchStock, { foreignKey: 'branchId' });
BranchStock.belongsTo(Branch, { foreignKey: 'branchId' });
// ---- Foundation: exceptions, tasks, snapshots ----
WarehouseException.belongsTo(Branch, { foreignKey: 'branchId' });
WarehouseException.belongsTo(WarehouseBin, { foreignKey: 'binId' });
WarehouseException.belongsTo(Product, { foreignKey: 'productId' });
WarehouseException.belongsTo(ProductBatch, { foreignKey: 'batchId' });
WarehouseException.belongsTo(StockOwner, { foreignKey: 'ownerId' });
WarehouseException.belongsTo(User, { foreignKey: 'assignedUserId', as: 'assignedTo' });
WarehouseException.belongsTo(User, { foreignKey: 'reportedByUserId', as: 'reportedBy' });
WarehouseException.belongsTo(User, { foreignKey: 'resolvedByUserId', as: 'resolvedBy' });

WarehouseTask.belongsTo(Branch, { foreignKey: 'branchId' });
WarehouseTask.belongsTo(WarehouseBin, { foreignKey: 'sourceBinId', as: 'sourceBin' });
WarehouseTask.belongsTo(WarehouseBin, { foreignKey: 'destinationBinId', as: 'destinationBin' });
WarehouseTask.belongsTo(Product, { foreignKey: 'productId' });
WarehouseTask.belongsTo(ProductBatch, { foreignKey: 'batchId' });
WarehouseTask.belongsTo(StockOwner, { foreignKey: 'ownerId' });
WarehouseTask.belongsTo(User, { foreignKey: 'assignedUserId', as: 'assignedTo' });

WarehouseStorageSnapshot.belongsTo(Branch, { foreignKey: 'branchId' });
WarehouseStorageSnapshot.belongsTo(Product, { foreignKey: 'productId' });
WarehouseStorageSnapshot.belongsTo(StockOwner, { foreignKey: 'ownerId' });
// binId and batchId are deliberately plain columns with no foreign key.
//
// A snapshot is a historical billing record and has to outlive the things it
// describes: a bin can be renamed away or a warehouse reorganised years after
// an invoice was sent, and none of that may make the invoice unreproducible or
// block the deletion. They also carry 0 rather than NULL when absent, so the
// unique key on the snapshot grain behaves the same on every database — and a
// foreign key would reject that sentinel outright.

IdempotencyKey.belongsTo(User, { foreignKey: 'userId' });

StockOwner.hasMany(BranchStock, { foreignKey: 'ownerId' });
BranchStock.belongsTo(StockOwner, { foreignKey: 'ownerId' });
StockOwner.hasMany(BinStock, { foreignKey: 'ownerId' });
BinStock.belongsTo(StockOwner, { foreignKey: 'ownerId' });
StockMovement.belongsTo(StockOwner, { foreignKey: 'ownerId' });
Product.hasMany(BranchStock, { foreignKey: 'productId' });
BranchStock.belongsTo(Product, { foreignKey: 'productId' });

for (const model of [Invoice, Purchase, SalesOrder, Quotation, DeliveryChallan, SalesReturn, StockMovement]) {
  Branch.hasMany(model, { foreignKey: 'branchId' });
  model.belongsTo(Branch, { foreignKey: 'branchId' });
}

Coupon.hasMany(CouponUsage, { foreignKey: 'couponId' });
CouponUsage.belongsTo(Coupon, { foreignKey: 'couponId' });
Customer.hasMany(CouponUsage, { foreignKey: 'customerId' });
CouponUsage.belongsTo(Customer, { foreignKey: 'customerId' });

Customer.hasMany(LoyaltyTransaction, { foreignKey: 'customerId' });
LoyaltyTransaction.belongsTo(Customer, { foreignKey: 'customerId' });

// Seed lots: held per product per branch, and referenced by the lines that sell
// them so a bill can be traced back to the lot it came out of.
Product.hasMany(ProductBatch, { foreignKey: 'productId' });
ProductBatch.belongsTo(Product, { foreignKey: 'productId' });
Branch.hasMany(ProductBatch, { foreignKey: 'branchId' });
ProductBatch.belongsTo(Branch, { foreignKey: 'branchId' });
ProductBatch.hasMany(InvoiceItem, { foreignKey: 'batchId' });
InvoiceItem.belongsTo(ProductBatch, { foreignKey: 'batchId' });
ProductBatch.hasMany(SalesReturnItem, { foreignKey: 'batchId' });
SalesReturnItem.belongsTo(ProductBatch, { foreignKey: 'batchId' });

// ---- Warehouse / ERP associations ----
// Branches and warehouses are both rows in `branches`, so every location link
// below points at the same model and the stock engine never has to ask which.

// Location hierarchy and internal storage structure.
Branch.hasMany(Branch, { foreignKey: 'parentId', as: 'childLocations' });
Branch.belongsTo(Branch, { foreignKey: 'parentId', as: 'parentLocation' });
Branch.hasMany(WarehouseBin, { foreignKey: 'branchId' });
WarehouseBin.belongsTo(Branch, { foreignKey: 'branchId' });
WarehouseBin.hasMany(WarehouseBin, { foreignKey: 'parentId', as: 'children' });
WarehouseBin.belongsTo(WarehouseBin, { foreignKey: 'parentId', as: 'parent' });

// The rung that completes Warehouse → Zone → Rack → Bin → Product.
// Per-location rights: which locations a user may work at, and how.
User.hasMany(UserLocation, { foreignKey: 'userId', onDelete: 'CASCADE' });
UserLocation.belongsTo(User, { foreignKey: 'userId' });
Branch.hasMany(UserLocation, { foreignKey: 'branchId', onDelete: 'CASCADE' });
UserLocation.belongsTo(Branch, { foreignKey: 'branchId' });

WarehouseBin.hasMany(BinStock, { foreignKey: 'binId' });
BinStock.belongsTo(WarehouseBin, { foreignKey: 'binId' });
Product.hasMany(BinStock, { foreignKey: 'productId' });
BinStock.belongsTo(Product, { foreignKey: 'productId' });
BinStock.belongsTo(Branch, { foreignKey: 'branchId' });
BinStock.belongsTo(ProductBatch, { foreignKey: 'batchId' });

// Put-away rules point at the bin they send stock to.
PutAwayRule.belongsTo(WarehouseBin, { foreignKey: 'targetBinId', as: 'targetBin' });
PutAwayRule.belongsTo(Branch, { foreignKey: 'branchId' });

// Packing: cartons prepared for dispatch, and what went into each.
PackingSlip.hasMany(PackingSlipItem, { foreignKey: 'packageId', onDelete: 'CASCADE' });
PackingSlipItem.belongsTo(PackingSlip, { foreignKey: 'packageId' });
PackingSlipItem.belongsTo(Product, { foreignKey: 'productId' });
PackingSlipItem.belongsTo(ProductBatch, { foreignKey: 'batchId' });
PackingSlip.belongsTo(Branch, { foreignKey: 'branchId' });

// Transfers move stock between two locations, so both ends are aliased.
StockTransfer.belongsTo(Branch, { foreignKey: 'fromBranchId', as: 'fromBranch' });
StockTransfer.belongsTo(Branch, { foreignKey: 'toBranchId', as: 'toBranch' });
StockTransfer.hasMany(StockTransferItem, { foreignKey: 'transferId', onDelete: 'CASCADE' });
StockTransferItem.belongsTo(StockTransfer, { foreignKey: 'transferId' });
StockTransferItem.belongsTo(Product, { foreignKey: 'productId' });
Product.hasMany(StockTransferItem, { foreignKey: 'productId' });
StockTransfer.belongsTo(User, { foreignKey: 'requestedBy', as: 'requester' });
StockTransfer.belongsTo(User, { foreignKey: 'approvedBy', as: 'approver' });

StockAdjustment.belongsTo(Branch, { foreignKey: 'branchId' });
StockAdjustment.hasMany(StockAdjustmentItem, { foreignKey: 'adjustmentId', onDelete: 'CASCADE' });
StockAdjustmentItem.belongsTo(StockAdjustment, { foreignKey: 'adjustmentId' });
StockAdjustmentItem.belongsTo(Product, { foreignKey: 'productId' });
StockAdjustment.belongsTo(User, { foreignKey: 'approvedBy', as: 'approver' });

StockCount.belongsTo(Branch, { foreignKey: 'branchId' });
StockCount.hasMany(StockCountItem, { foreignKey: 'countId', onDelete: 'CASCADE' });
StockCountItem.belongsTo(StockCount, { foreignKey: 'countId' });
StockCountItem.belongsTo(Product, { foreignKey: 'productId' });

// Purchasing chain: PO -> GRN -> Purchase invoice.
PurchaseOrder.belongsTo(Supplier, { foreignKey: 'supplierId' });
Supplier.hasMany(PurchaseOrder, { foreignKey: 'supplierId' });
PurchaseOrder.belongsTo(Branch, { foreignKey: 'branchId' });
PurchaseOrder.hasMany(PurchaseOrderItem, { foreignKey: 'poId', onDelete: 'CASCADE' });
PurchaseOrderItem.belongsTo(PurchaseOrder, { foreignKey: 'poId' });
PurchaseOrderItem.belongsTo(Product, { foreignKey: 'productId' });
Product.hasMany(PurchaseOrderItem, { foreignKey: 'productId' });
PurchaseOrder.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

Grn.belongsTo(PurchaseOrder, { foreignKey: 'poId' });
PurchaseOrder.hasMany(Grn, { foreignKey: 'poId' });
Grn.belongsTo(Supplier, { foreignKey: 'supplierId' });
Grn.belongsTo(Branch, { foreignKey: 'branchId' });
Grn.hasMany(GrnItem, { foreignKey: 'grnId', onDelete: 'CASCADE' });
GrnItem.belongsTo(Grn, { foreignKey: 'grnId' });
GrnItem.belongsTo(Product, { foreignKey: 'productId' });
GrnItem.belongsTo(PurchaseOrderItem, { foreignKey: 'poItemId' });
Grn.belongsTo(User, { foreignKey: 'receivedBy', as: 'receiver' });
Grn.belongsTo(Purchase, { foreignKey: 'purchaseId' });

Srv.belongsTo(Supplier, { foreignKey: 'supplierId' });
Srv.belongsTo(Branch, { foreignKey: 'branchId' });
Srv.hasMany(SrvItem, { foreignKey: 'srvId', onDelete: 'CASCADE' });
SrvItem.belongsTo(Srv, { foreignKey: 'srvId' });
SrvItem.belongsTo(Product, { foreignKey: 'productId' });
Srv.belongsTo(User, { foreignKey: 'receivedBy', as: 'receiver' });

InboundAppointment.belongsTo(Supplier, { foreignKey: 'supplierId' });
Supplier.hasMany(InboundAppointment, { foreignKey: 'supplierId' });
InboundAppointment.belongsTo(PurchaseOrder, { foreignKey: 'poId' });
PurchaseOrder.hasMany(InboundAppointment, { foreignKey: 'poId' });
InboundAppointment.belongsTo(Branch, { foreignKey: 'branchId' });
Branch.hasMany(InboundAppointment, { foreignKey: 'branchId' });

QcInspection.belongsTo(Grn, { foreignKey: 'grnId' });
Grn.hasMany(QcInspection, { foreignKey: 'grnId' });
QcInspection.belongsTo(Product, { foreignKey: 'productId' });
Product.hasMany(QcInspection, { foreignKey: 'productId' });
QcInspection.belongsTo(User, { foreignKey: 'inspectorId', as: 'inspector' });
QcInspection.belongsTo(SalesReturn, { foreignKey: 'returnId' });
SalesReturn.hasMany(QcInspection, { foreignKey: 'returnId' });
QcInspection.belongsTo(SalesReturnItem, { foreignKey: 'returnItemId' });
SalesReturnItem.hasMany(QcInspection, { foreignKey: 'returnItemId' });

PickWave.belongsTo(Branch, { foreignKey: 'branchId' });
Branch.hasMany(PickWave, { foreignKey: 'branchId' });
SalesOrder.belongsTo(PickWave, { foreignKey: 'waveId' });
PickWave.hasMany(SalesOrder, { foreignKey: 'waveId' });

Shipment.belongsTo(Invoice, { foreignKey: 'invoiceId' });
Invoice.hasMany(Shipment, { foreignKey: 'invoiceId' });

RepairOrder.belongsTo(Product, { foreignKey: 'productId' });
Product.hasMany(RepairOrder, { foreignKey: 'productId' });
RepairOrder.belongsTo(Branch, { foreignKey: 'branchId' });
Branch.hasMany(RepairOrder, { foreignKey: 'branchId' });
RepairOrder.belongsTo(QcInspection, { foreignKey: 'qcInspectionId' });
QcInspection.hasMany(RepairOrder, { foreignKey: 'qcInspectionId' });

PurchaseReturn.belongsTo(Supplier, { foreignKey: 'supplierId' });
Supplier.hasMany(PurchaseReturn, { foreignKey: 'supplierId' });
PurchaseReturn.belongsTo(Purchase, { foreignKey: 'purchaseId' });
Purchase.hasMany(PurchaseReturn, { foreignKey: 'purchaseId' });
PurchaseReturn.belongsTo(Branch, { foreignKey: 'branchId' });
PurchaseReturn.hasMany(PurchaseReturnItem, { foreignKey: 'returnId', onDelete: 'CASCADE' });
PurchaseReturnItem.belongsTo(PurchaseReturn, { foreignKey: 'returnId' });
PurchaseReturnItem.belongsTo(Product, { foreignKey: 'productId' });
Product.hasMany(PurchaseReturnItem, { foreignKey: 'productId' });

// Serials are individual units, so they hang off products and their documents.
Product.hasMany(ProductSerial, { foreignKey: 'productId' });
ProductSerial.belongsTo(Product, { foreignKey: 'productId' });
ProductSerial.belongsTo(Branch, { foreignKey: 'branchId' });
ProductSerial.belongsTo(Customer, { foreignKey: 'customerId' });
ProductSerial.belongsTo(Invoice, { foreignKey: 'invoiceId' });
ProductSerial.belongsTo(ProductBatch, { foreignKey: 'batchId' });

// Money.
Expense.belongsTo(Branch, { foreignKey: 'branchId' });
Expense.belongsTo(ExpenseCategory, { foreignKey: 'categoryId' });
ExpenseCategory.hasMany(Expense, { foreignKey: 'categoryId' });
Expense.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

CashRegister.belongsTo(Branch, { foreignKey: 'branchId' });
Branch.hasMany(CashRegister, { foreignKey: 'branchId' });
CashRegister.hasMany(CashTransaction, { foreignKey: 'registerId' });
CashTransaction.belongsTo(CashRegister, { foreignKey: 'registerId' });

BankAccount.belongsTo(Branch, { foreignKey: 'branchId' });
BankAccount.hasMany(BankTransaction, { foreignKey: 'bankAccountId' });
BankTransaction.belongsTo(BankAccount, { foreignKey: 'bankAccountId' });

// Accounting.
ChartOfAccount.hasMany(ChartOfAccount, { foreignKey: 'parentId', as: 'children' });
ChartOfAccount.belongsTo(ChartOfAccount, { foreignKey: 'parentId', as: 'parent' });
JournalEntry.hasMany(JournalEntryLine, { foreignKey: 'entryId', onDelete: 'CASCADE' });
JournalEntryLine.belongsTo(JournalEntry, { foreignKey: 'entryId' });
JournalEntryLine.belongsTo(ChartOfAccount, { foreignKey: 'accountId' });
ChartOfAccount.hasMany(JournalEntryLine, { foreignKey: 'accountId' });
JournalEntry.belongsTo(Branch, { foreignKey: 'branchId' });
JournalEntry.belongsTo(User, { foreignKey: 'postedBy', as: 'poster' });

// Approvals.
ApprovalRequest.belongsTo(ApprovalRule, { foreignKey: 'ruleId' });
ApprovalRequest.belongsTo(User, { foreignKey: 'requestedBy', as: 'requester' });
ApprovalRequest.belongsTo(User, { foreignKey: 'decidedBy', as: 'decider' });
ApprovalRequest.belongsTo(Branch, { foreignKey: 'branchId' });

// Every new document type is branch-scoped like the originals.
for (const model of [
  StockAdjustment, StockCount, PurchaseOrder, Grn, PurchaseReturn, Expense,
]) {
  Branch.hasMany(model, { foreignKey: 'branchId' });
}

// Registered once all models exist so every write is captured.
installAuditHooks(sequelize, AuditLog);

export { sequelize };
