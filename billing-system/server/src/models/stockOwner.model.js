import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * Who owns the goods on the shelf.
 *
 * A shop owns everything it stores, so this table has exactly one row for it —
 * the house — and nothing about the system looks any different. A third-party
 * warehouse stores goods belonging to other companies, and there the difference
 * is not cosmetic: client stock sits in your building, is counted in your
 * stock-take and walks past your pickers, but you cannot sell it, it is not
 * your asset, and it must never appear in your valuation or your books.
 *
 * So ownership is a dimension of stock rather than a label on it. Every
 * `branch_stock` and `bin_stock` row belongs to exactly one owner, and the
 * quantities never mingle: a hundred of a product at a location may be sixty
 * yours and forty a client's, and those are two separate balances that happen
 * to share a shelf.
 *
 * The house row is created automatically and cannot be deleted. Everything that
 * does not say whose stock it is means the house, which is what lets a shop
 * ignore this table entirely.
 */
export default (sequelize) => sequelize.define('StockOwner', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  ownerName: { type: DataTypes.STRING(160), allowNull: false },
  // Uniqueness lives in the indexes block below, declared once.
  ownerCode: { type: DataTypes.STRING(30), allowNull: false },

  // Exactly one row is the house — the company's own goods. It is created on
  // boot, refuses deletion, and is the default owner for every movement that
  // does not name one.
  isHouse: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  contactPerson: { type: DataTypes.STRING(120) },
  mobileNumber: { type: DataTypes.STRING(20) },
  email: { type: DataTypes.STRING(160) },
  gstNumber: { type: DataTypes.STRING(20) },
  address: { type: DataTypes.STRING(255) },

  // ---- Storage and handling charges ----
  //
  // What the warehouse bills this client for. Held here rather than on a
  // contract table because a 3PL's rate card is per client and changes rarely;
  // a client on no charges at all is simply left at zero, which is what the
  // house row always is.
  storageRatePerUnitPerDay: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
  handlingRateInbound: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
  handlingRateOutbound: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
  // Free days before storage starts accruing, as most 3PL contracts allow.
  freeStorageDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
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
  tableName: 'stock_owners',
  indexes: [
    { unique: true, fields: ['owner_code'] },
    { fields: ['is_house'] },
    { fields: ['is_active'] }
  ]
});
