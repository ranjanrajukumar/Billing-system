import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => sequelize.define('SalesOrderItem', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  quantity: { type: DataTypes.FLOAT, allowNull: false },

  // ---- Fulfilment ----
  // Four separate figures because they are four separate facts: stock set
  // aside, stock off the shelf, stock in a box, stock out of the building.
  // Collapsing them loses the ability to say where an order actually is.
  allocatedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  pickedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  packedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  dispatchedQty: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },

  // Which bins the picker took it from, as [{binId, batchId, quantity}], so a
  // cancellation can put it back exactly where it came from.
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

  unitPrice: { type: DataTypes.FLOAT, allowNull: false },
  discount: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  gstPercent: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  totalPrice: { type: DataTypes.FLOAT, allowNull: false },
  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'sales_order_items'
});
