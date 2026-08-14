import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * One product on a transfer. `dispatchedQty` and `receivedQty` are tracked
 * separately from the requested quantity so a short receipt (breakage, a bag
 * left behind) is visible rather than silently reconciled.
 */
export default (sequelize) => sequelize.define('StockTransferItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  transferId: { type: unsignedInteger(sequelize), allowNull: false },
  productId: { type: unsignedInteger(sequelize), allowNull: false },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  batchNumber: { type: DataTypes.STRING(60), allowNull: true },
  serialNumber: { type: DataTypes.STRING(120), allowNull: true },

  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  // Taken off the shelves and onto the packing bench. Distinct from dispatched:
  // picked stock has left its bin but not the building, so the location total
  // still includes it.
  pickedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  // Which bins the picker actually took it from, as [{binId, batchId, quantity}].
  // Recorded so a cancellation can put the goods back exactly where they came
  // from rather than guessing at a bin — and so the transfer can answer "which
  // shelf did this leave from" months later.
  //
  // Stored as text and parsed here rather than as a JSON column, because the
  // application also supports SQL Server, where JSON support differs.
  pickedFrom: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('pickedFrom');
      if (!raw) return [];
      try { return JSON.parse(raw); } catch { return []; }
    },
    set(value) {
      this.setDataValue('pickedFrom', value?.length ? JSON.stringify(value) : null);
    },
  },
  dispatchedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  receivedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  damagedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  unitCost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
  um: { type: DataTypes.STRING(20), allowNull: true },
  remarks: { type: DataTypes.STRING(255) },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'stock_transfer_items',
  indexes: [{ fields: ['transfer_id'] }, { fields: ['product_id'] }]
});
