import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

/**
 * What was in the building on a given day, and what that day cost.
 *
 * Storage is rented by time, so a monthly bill is the sum of daily charges — and
 * a daily charge can only be known on the day. Current balances cannot answer
 * it: goods that arrived on the 3rd and left on the 11th are invisible by
 * month-end, yet the client owes eight days of storage on them. Reconstructing
 * that from the movement ledger means replaying every transaction in the month
 * for every product, and getting a different answer each time somebody
 * backdates a correction.
 *
 * So the day is captured while it is still true, and never recomputed. Billing
 * then becomes `SUM(charge)` over a date range, which is both cheap and, more
 * importantly, stable — the same period billed twice gives the same figure.
 *
 * `ownerId` is part of the grain even though a single-owner warehouse will only
 * ever have one value in it. Storage charges are per client; without it, a 3PL
 * holding two clients' goods in the same bin has one row for both and no way to
 * split the bill, and adding the column later means every historical snapshot
 * is unattributable.
 */
export default (sequelize) => sequelize.define('WarehouseStorageSnapshot', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },

  // The day being described, not the day it was written. A job that runs late,
  // or is re-run to fill a gap, still records the day it is about.
  snapshotDate: { type: DataTypes.DATEONLY, allowNull: false },

  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  // Copied from the bin's ancestry at capture time so a later reorganisation of
  // the warehouse cannot change what a past invoice said.
  zoneId: { type: unsignedInteger(sequelize), allowNull: true },
  binId: { type: unsignedInteger(sequelize), allowNull: true },

  productId: { type: unsignedInteger(sequelize), allowNull: false },
  batchId: { type: unsignedInteger(sequelize), allowNull: true },
  ownerId: { type: unsignedInteger(sequelize), allowNull: false },

  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  // Space actually taken, where a product declares its volume. Warehouses that
  // charge by pallet or cubic metre bill on this rather than on unit count.
  occupiedVolume: { type: DataTypes.DECIMAL(14, 4), allowNull: true },

  // The rate as it stood on the day. Stored rather than looked up, because a
  // rate change must not silently reprice history — last month's invoice has
  // already been sent.
  storageRate: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
  charge: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
  // Why the charge was zero, when it was — free days, house stock, no rate set.
  chargeBasis: { type: DataTypes.STRING(40), allowNull: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'warehouse_storage_snapshots',
  indexes: [
    // The grain. This is what makes the job safe to re-run: a second attempt
    // collides instead of double-charging, which is the failure that matters —
    // a duplicated day is money billed twice to a real client.
    //
    // Nullable columns in a unique key behave differently across databases
    // (MySQL and SQL Server treat NULLs as distinct), so the job writes 0
    // rather than NULL for absent bin and batch to keep the key meaningful.
    {
      unique: true,
      name: 'storage_snapshot_grain',
      fields: ['snapshot_date', 'branch_id', 'bin_id', 'product_id', 'batch_id', 'owner_id'],
    },
    // Monthly billing: one client, one period.
    { fields: ['owner_id', 'snapshot_date'] },
    { fields: ['branch_id', 'snapshot_date'] }
  ]
});
