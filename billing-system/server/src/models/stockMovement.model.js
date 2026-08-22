import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * The stock ledger. Every movement of every product at every location lands
 * here, with the balance before and after, so a quantity on screen can always
 * be traced back to the documents that produced it.
 *
 * `quantity` stays signed (negative for issues) because existing reports read
 * it that way; `quantityIn`/`quantityOut` are the ledger-style split.
 */
export const MOVEMENT_TYPES = [
  // Original set — kept exactly as-is so historical rows stay valid.
  'Purchase', 'Sale', 'Sale Return', 'Adjustment In', 'Adjustment Out', 'Opening Stock',
  // Added with the warehouse/ERP workflow.
  'Purchase Return', 'Transfer In', 'Transfer Out', 'Stock Count Adjustment',
  'Damage', 'Expired', 'GRN',
  // Material issued out of the store with no sale behind it, and the unused
  // part of it coming back. Distinct types rather than reusing Adjustment
  // Out/In because the ledger is where "why did this leave" is answered, and
  // an issue that reads as an adjustment is indistinguishable from a counting
  // correction the moment anybody looks at it a month later.
  'Issue', 'Issue Return',
];

export default (sequelize) => sequelize.define('StockMovement', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  movementType: { ...enumType(sequelize, MOVEMENT_TYPES), allowNull: false },
  quantity: { type: DataTypes.DECIMAL(18, 4), allowNull: false },
  // Ledger split, both always positive.
  quantityIn: { type: DataTypes.DECIMAL(18, 4), allowNull: false, defaultValue: 0 },
  quantityOut: { type: DataTypes.DECIMAL(18, 4), allowNull: false, defaultValue: 0 },
  // The running balance at this location, captured at the moment of the move.
  previousQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  currentQuantity: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  // Which location this happened at. branchId is kept (and still written) for
  // backward compatibility; locationType says whether it is a branch or a
  // warehouse, both of which live in the `branches` table.
  locationType: { ...enumType(sequelize, ['Branch', 'Warehouse']), allowNull: true, defaultValue: 'Branch' },
  // Whose stock moved. Without it the ledger cannot answer "what did we handle
  // for this client last month", which is the question a 3PL invoice is built
  // from — and it is the only record of that, since balances show the present
  // and say nothing about how much passed through.
  ownerId: { type: unsignedInteger(sequelize), allowNull: false, defaultValue: 1 },
  // Which balance moved: 0 for the product's loose or plain stock, or a
  // variant id for one packaged size. Without it the ledger could not explain
  // how a location arrived at "250 pouches and 8,890g loose" — every row would
  // look like a movement of the same undifferentiated pile.
  variantId: { type: unsignedInteger(sequelize), allowNull: false, defaultValue: 0 },
  unitCost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  serialNumber: { type: DataTypes.STRING(120), allowNull: true },
  transactionDate: { type: DataTypes.DATE, allowNull: true },
  referenceType: { type: DataTypes.STRING(40) },
  referenceId: { type: unsignedInteger(sequelize) },
  referenceNumber: { type: DataTypes.STRING(60) },
  notes: { type: DataTypes.TEXT }
,
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'stock_movements',
  indexes: [
    { fields: ['movement_type'] },
    { fields: ['reference_type', 'reference_id'] },
    { fields: ['product_id', 'branch_id'] },
    { fields: ['transaction_date'] },
    // Handling charges are billed from this: every in and out for one client
    // over a period.
    { fields: ['owner_id', 'transaction_date'] }
  ]
});
