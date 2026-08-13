import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('InvoiceItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  // Printed on a bill of supply alongside the quantity.
  packing: { type: DataTypes.STRING(40) },
  um: { type: DataTypes.STRING(20) },
  // Unit conversion snapshot — records what unit was billed and how it maps
  // back to the product's primary stock unit at the time of sale.
  primaryUnit: { type: DataTypes.STRING(20), allowNull: true },
  unitConversionFactor: { type: DataTypes.DECIMAL(10, 4), allowNull: true, defaultValue: 1 },
  // The quantity expressed in the product's primary unit, used for stock deduction.
  primaryQty: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  quantity:{ type: DataTypes.DECIMAL(10, 2), allowNull: false },
  rate: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  discount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  gstPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
  gstAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },

  // Which seed lot this line came out of. The batch details are copied here as
  // well as linked, so a reprint years later still shows what was on the bag
  // even if the lot has since been edited or removed.
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  batchNumber: { type: DataTypes.STRING(60), allowNull: true },
  germinationPercent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  expiryDate: { type: DataTypes.DATEONLY, allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt', tableName: 'invoice_items' });
