import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

// Positive points for Earned/Adjusted-in, negative for Redeemed/Reversed.
const types = ['Earned', 'Redeemed', 'Adjusted', 'Reversed'];

export default (sequelize) => sequelize.define('LoyaltyTransaction', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  customerId: { type: unsignedInteger(sequelize), allowNull: false },
  invoiceId: { type: unsignedInteger(sequelize) },
  entryType: { ...enumType(sequelize, types), allowNull: false },
  points: { type: DataTypes.INTEGER, allowNull: false },
  balanceAfter: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  notes: { type: DataTypes.STRING(255) },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'loyalty_transactions',
  indexes: [{ fields: ['customer_id'] }, { fields: ['invoice_id'] }]
});
