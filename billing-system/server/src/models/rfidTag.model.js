import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * One RFID tag and what it is stuck to.
 *
 * A tag is an identity, not a quantity. That distinction is the whole design:
 * a barcode says "this is a bag of urea", a tag says "this is *that* bag", and
 * the difference is what lets a reader sweep a pallet and know exactly which
 * items are on it rather than how many ought to be.
 *
 * So a tag maps to at most one unit of stock, and `lastSeenBinId` is a
 * location, not a stock balance. Reading a tag does not move stock. It is
 * evidence that gets compared against the balance, and any disagreement is an
 * exception for a person to settle — because a reader picking up a pallet in
 * the next aisle through a rack is a routine physical fact, and a system that
 * treated every stray read as a movement would rewrite the ledger from radio
 * noise. The ledger is the authority; this table is a witness.
 *
 * `epc` is the tag's own Electronic Product Code, unique across the estate.
 */
export const TAG_STATUSES = ['UNASSIGNED', 'ASSIGNED', 'SHIPPED', 'RETIRED'];

export default (sequelize) => sequelize.define('RfidTag', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  // The number encoded on the tag. Uniqueness is declared in the indexes block.
  epc: { type: DataTypes.STRING(128), allowNull: false },

  status: { ...enumType(sequelize, TAG_STATUSES), allowNull: false, defaultValue: 'UNASSIGNED' },

  // What it is attached to. Null while a tag is printed but not yet applied —
  // a real state on any site that pre-encodes a roll of labels.
  productId: { type: unsignedInteger(sequelize), allowNull: true },
  // The sealed pack, where the tagged thing is one. 0 means loose stock, the
  // same convention branch_stock uses.
  variantId: { type: unsignedInteger(sequelize), allowNull: true },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  // Whose goods these are. A 3PL reader sweeping a bay picks up several
  // clients' stock in one pass and the reconciliation has to keep them apart.
  ownerId: { type: unsignedInteger(sequelize), allowNull: true },

  // How much of the product this one tag represents — a tag on a pallet of 48
  // is not a tag on a single sack.
  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 1 },

  branchId: { type: unsignedInteger(sequelize), allowNull: true },

  // Where the estate last saw it, and when. Advisory: see the note above about
  // this being a witness rather than the ledger.
  lastSeenBinId: { type: unsignedInteger(sequelize), allowNull: true },
  lastSeenAt: { type: DataTypes.DATE, allowNull: true },
  lastSeenDeviceId: { type: unsignedInteger(sequelize), allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true },
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'rfid_tags',
  indexes: [
    { unique: true, name: 'rfid_tags_epc', fields: ['epc'] },
    // Reconciliation: everything the system believes is in this bin.
    { fields: ['last_seen_bin_id', 'status', 'detstatus'] },
    { fields: ['product_id', 'status'] },
    { fields: ['owner_id', 'status'] },
  ],
});
