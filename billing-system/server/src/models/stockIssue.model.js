import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';

export const ISSUE_STATUSES = ['Draft', 'Issued', 'Closed', 'Cancelled'];

/**
 * Why the material left the store. Reporting is the point — "what did we spend
 * on maintenance" is a different question from "what did we give away as
 * samples", and both are invisible if every issue is just an outward movement.
 */
export const ISSUE_PURPOSES = [
  'Consumption', 'Maintenance', 'Production', 'Repair', 'Sample', 'Loan', 'Other',
];

/**
 * Store Issue Voucher (SIV) — stock leaving the store with no sale behind it.
 *
 * The outward mirror of the SRV. A purchase brings goods in against a supplier
 * and an invoice takes them out against a customer; this is the third case both
 * of those miss — material going to a department, a person or a job, where
 * there is no counterparty and nothing to bill, but the stock has still gone.
 *
 * Without it that movement has to be recorded as a stock adjustment, which says
 * the quantity changed and nothing about who has it. The difference matters
 * most at the other end: an adjustment can never be *returned*, so unused
 * material comes back as a second unrelated adjustment and the two are only
 * connectable by whoever remembers.
 *
 * Posting is one-way, as it is for the SRV: an issued voucher has moved real
 * stock, so it is corrected by returning against it rather than by editing
 * history.
 */
export default (sequelize) => sequelize.define('StockIssue', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  issueNumber: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  issueDate: { type: DataTypes.DATEONLY, allowNull: false },
  branchId: { type: unsignedInteger(sequelize), allowNull: false },
  status: { ...enumType(sequelize, ISSUE_STATUSES), allowNull: false, defaultValue: 'Draft' },
  purpose: { ...enumType(sequelize, ISSUE_PURPOSES), allowNull: false, defaultValue: 'Consumption' },

  // ---- Who has it ----
  // All four are optional individually and at least one is required together,
  // which the controller enforces. They are separate columns rather than a
  // type/value pair because they are not alternatives: material is routinely
  // issued to a named fitter, for the maintenance department, against a job
  // number, and losing any of the three loses a question somebody asks.
  departmentId: { type: unsignedInteger(sequelize), allowNull: true },
  issuedToUserId: { type: unsignedInteger(sequelize), allowNull: true },
  // For a recipient who is not a system user — a contractor, a driver, a
  // visiting engineer.
  issuedToName: { type: DataTypes.STRING(160), allowNull: true },
  jobNumber: { type: DataTypes.STRING(60), allowNull: true },

  /**
   * Is any of this expected back?
   *
   * A drum of grease issued to production is gone the moment it is issued; a
   * torque wrench lent to the same department is not. Both are issues and both
   * reduce stock, but only one of them belongs on the "still out" report — and
   * a report that lists consumed material as outstanding forever is one nobody
   * reads twice.
   */
  returnable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

  issuedBy: { type: unsignedInteger(sequelize), allowNull: true },
  // Set once the voucher has been posted to stock; posting is one-way.
  issuedAt: { type: DataTypes.DATE, allowNull: true },
  // Set when nothing more is expected back, either because everything was
  // returned or because somebody said the rest was consumed.
  closedAt: { type: DataTypes.DATE, allowNull: true },
  remarks: { type: DataTypes.TEXT },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'stock_issues',
  indexes: [
    { fields: ['branch_id'] },
    { fields: ['status'] },
    { fields: ['issue_date'] },
    { fields: ['department_id'] },
    { fields: ['issued_to_user_id'] },
  ]
});
