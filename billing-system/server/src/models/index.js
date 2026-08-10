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
import CouponModel from './coupon.model.js';
import CouponUsageModel from './couponUsage.model.js';
import LoyaltyTransactionModel from './loyaltyTransaction.model.js';
import ProductBatchModel from './productBatch.model.js';
import { installAuditHooks } from '../services/audit.service.js';
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
export const BranchStock = BranchStockModel(sequelize);
export const Coupon = CouponModel(sequelize);
export const CouponUsage = CouponUsageModel(sequelize);
export const LoyaltyTransaction = LoyaltyTransactionModel(sequelize);
export const ProductBatch = ProductBatchModel(sequelize);
Role.hasMany(User, { foreignKey: 'roleId', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
User.belongsTo(Role, { foreignKey: 'roleId', onDelete: 'RESTRICT', onUpdate: 'CASCADE' });

Category.hasMany(Product, { foreignKey: 'categoryId' });
Product.belongsTo(Category, { foreignKey: 'categoryId' });

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

Branch.hasMany(BranchStock, { foreignKey: 'branchId' });
BranchStock.belongsTo(Branch, { foreignKey: 'branchId' });
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

// Registered once all models exist so every write is captured.
installAuditHooks(sequelize, AuditLog);

export { sequelize };
