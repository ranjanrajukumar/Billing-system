import { DataTypes } from 'sequelize';
import { enumType, unsignedInteger } from './types.js';
import { BUSINESS_MODES } from '../config/modules.js';

export default (sequelize) => sequelize.define('Company', {
  id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(180), allowNull: false },
  gstNumber: { type: DataTypes.STRING(20) },
  email: { type: DataTypes.STRING(160) },
  mobile: { type: DataTypes.STRING(20) },
  address: { type: DataTypes.TEXT },
  city: { type: DataTypes.STRING(80) },
  state: { type: DataTypes.STRING(80), allowNull: false },
  pincode: { type: DataTypes.STRING(10) },
  // Registration lines printed in the letterhead.
  panNumber: { type: DataTypes.STRING(20) },
  licenseNo: { type: DataTypes.STRING(60) },
  cin: { type: DataTypes.STRING(40) },
  msmeReg: { type: DataTypes.STRING(40) },
  logoPath: { type: DataTypes.STRING(255) },
  logoData: { type: DataTypes.BLOB('long') },
  logoMimeType: { type: DataTypes.STRING(100) },
  logoUrl: {
    type: DataTypes.VIRTUAL,
    get() { return this.logoMimeType ? '/media/company/logo' : (this.logoPath || null); }
  },
  signatureUrl: { type: DataTypes.STRING(255) },
  defaultInvoiceTemplate: { type: DataTypes.STRING(50), defaultValue: 'standard' },
  // Default currency code (e.g., INR, USD, EUR) used for formatting globally.
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
  // Days a credit (udhar) sale is allowed before it counts as overdue.
  creditDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
  // Off by default: the app runs against a single implicit branch and behaves
  // exactly as it did before branches existed.
  multiBranchEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // Basic runs a shop: POS, inventory, party ledgers. Advanced adds the full
  // ERP workflow (PO/GRN, warehouses, transfers, accounting, approvals).
  // Existing installations start Basic, so nothing appears or changes for them.
  businessMode: { ...enumType(sequelize, BUSINESS_MODES), allowNull: false, defaultValue: 'Basic' },
  // Selling into the negative is refused unless a business explicitly wants it
  // (e.g. back-dated data entry where receipts are keyed after the sales).
  allowNegativeStock: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

  // Loyalty: earn N points per ₹100 spent, each point worth ₹redeemValue.
  loyaltyEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  loyaltyPointsPer100: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  loyaltyRedeemValue: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 1 },
  loyaltyMinRedeem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },

  // ── Thermal / Receipt Printer ─────────────────────────────────────
  // Default paper size shown in Quick Bill and the invoice print dropdown.
  thermalPaperSize:  { type: DataTypes.STRING(10),  allowNull: false, defaultValue: '80mm' },
  // Width in mm when thermalPaperSize is 'custom'.
  thermalCustomMm:   { type: DataTypes.INTEGER,     allowNull: true },
  // Base font size string, e.g. '8pt'.
  thermalFontSize:   { type: DataTypes.STRING(8),   allowNull: false, defaultValue: '8.5pt' },
  // Message printed at the bottom of every receipt.
  thermalFooter:     { type: DataTypes.TEXT,        allowNull: true },
  // Toggle: print CGST / SGST / IGST lines on the receipt.
  thermalShowGst:    { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: true },
  // Toggle: print QR code on receipt.
  thermalShowQr:     { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: true },
  // Toggle: print company logo on receipt.
  thermalShowLogo:   { type: DataTypes.BOOLEAN,     allowNull: false, defaultValue: false },

  authadd: { type: DataTypes.INTEGER, allowNull: true },
  authlstedit: { type: DataTypes.INTEGER, allowNull: true },
  authdel: { type: DataTypes.INTEGER, allowNull: true },
  detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
  delondt: { type: DataTypes.DATE, allowNull: true }
}, {
  timestamps: true,
  createdAt: 'addondt',
  updatedAt: 'editondt',
  tableName: 'company',
  // Logo bytes are only needed by the media endpoint and PDF rendering; both use .unscoped().
  defaultScope: { attributes: { exclude: ['logoData'] } } });
