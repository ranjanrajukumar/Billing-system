import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

/**
 * Where in the building something is, as a self-referencing tree so a small
 * business can stop at "Zone A" while a large one goes all the way down:
 *
 *     Warehouse → Zone → Aisle → Rack → Shelf → Bin
 *
 * Every rung is optional. Stock is held at the location; a bin only says where
 * to walk to find it, and nothing in the stock engine requires one to exist.
 *
 * Two things here are what turn a tree into a route somebody can walk:
 *
 *   - `pickSequence` is the order a picker passes this bin in. It is the only
 *     field that knows the building's real geometry — a rack at the end of an
 *     aisle is next to the rack at the end of the *neighbouring* aisle, which
 *     no amount of parent/child nesting can express. Sorting a pick list by it
 *     turns a list of places into one walk with no backtracking.
 *
 *   - X/Y/Z are the physical position, used to *derive* a sensible sequence and
 *     later to measure how far a picker actually walked. They are advisory:
 *     a warehouse that never measures anything leaves them null and orders its
 *     bins by hand.
 */
export const BIN_LEVELS = ['Zone', 'Aisle', 'Rack', 'Shelf', 'Bin'];

/** How far down the tree each level sits, for sorting and validation. */
export const BIN_LEVEL_DEPTH = Object.fromEntries(BIN_LEVELS.map((l, i) => [l, i]));

export default (sequelize) => sequelize.define('WarehouseBin', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  parentId: { type: unsignedInteger(sequelize), allowNull: true },
  level: { ...enumType(sequelize, BIN_LEVELS), allowNull: false, defaultValue: 'Zone' },
  code: { type: DataTypes.STRING(40), allowNull: false },
  name: { type: DataTypes.STRING(120), allowNull: true },

  // ---- Routing ----
  //
  // The walking order. Null means "not yet placed in the route": such bins sort
  // last rather than first, so an unsequenced bin never silently sends a picker
  // to the wrong end of the building.
  pickSequence: { type: DataTypes.INTEGER, allowNull: true },

  // Physical position in metres from the warehouse origin. Z is height, which
  // matters for more than distance — a heavy carton on a top shelf is a lifting
  // injury, and slotting rules use it.
  positionX: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
  positionY: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
  positionZ: { type: DataTypes.DECIMAL(10, 3), allowNull: true },

  // ---- Capacity ----
  //
  // Three independent limits, because a bin fills up in three different ways
  // and whichever runs out first is the one that stops you.
  capacity: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  capacityVolume: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
  maxWeightKg: { type: DataTypes.DECIMAL(12, 3), allowNull: true },

  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'warehouse_bins',
  indexes: [
    { fields: ['branch_id'] },
    { fields: ['parent_id'] },
    // A code identifies a place to a person: "put it in A-01-03". Two places
    // answering to that name in one building is an instruction nobody can
    // follow, so it is refused at the database rather than by convention.
    { unique: true, name: 'warehouse_bins_branch_code', fields: ['branch_id', 'code'] },
    // The pick list's ORDER BY. Covering both columns keeps the walk order a
    // single index read rather than a sort of every bin in the warehouse.
    { fields: ['branch_id', 'pick_sequence'] },
    { fields: ['branch_id', 'level'] }
  ]
});
