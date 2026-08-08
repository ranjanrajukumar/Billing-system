import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => {
  const InvoiceTemplate = sequelize.define('InvoiceTemplate', {
    id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
    templateName: { type: DataTypes.STRING, allowNull: false },
    invoiceTitle: { type: DataTypes.STRING, defaultValue: 'TAX INVOICE' },
    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    designLayout: { type: DataTypes.JSON },

    // Section 1 - Company Info
    companyName: { type: DataTypes.STRING },
    companyLogo: { type: DataTypes.STRING },
    gstNumber: { type: DataTypes.STRING },
    panNumber: { type: DataTypes.STRING },
    address: { type: DataTypes.TEXT },
    city: { type: DataTypes.STRING },
    state: { type: DataTypes.STRING },
    pincode: { type: DataTypes.STRING },
    phoneNumber: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING },
    website: { type: DataTypes.STRING },

    // Section 2 - Invoice Number Settings
    invoicePrefix: { type: DataTypes.STRING, defaultValue: 'INV-' },
    invoiceSuffix: { type: DataTypes.STRING, defaultValue: '' },
    nextNumber: { type: DataTypes.INTEGER, defaultValue: 1 },
    financialYear: { type: DataTypes.STRING },
    autoNumbering: { type: DataTypes.BOOLEAN, defaultValue: true },
    resetYearly: { type: DataTypes.BOOLEAN, defaultValue: false },

    // Section 3 - GST Settings
    enableGst: { type: DataTypes.BOOLEAN, defaultValue: true },
    gstType: { type: DataTypes.STRING, defaultValue: 'CGST/SGST' },
    showGstNumber: { type: DataTypes.BOOLEAN, defaultValue: true },
    showHsnCode: { type: DataTypes.BOOLEAN, defaultValue: true },
    showTaxSummary: { type: DataTypes.BOOLEAN, defaultValue: true },
    roundOffMethod: { type: DataTypes.STRING, defaultValue: 'Nearest' },

    // Section 4 - Invoice Layout
    paperSize: { type: DataTypes.STRING, defaultValue: 'A4' }, // A4, A5, 80mm, 58mm
    orientation: { type: DataTypes.STRING, defaultValue: 'Portrait' },
    showCompanyLogo: { type: DataTypes.BOOLEAN, defaultValue: true },
    showQrCode: { type: DataTypes.BOOLEAN, defaultValue: true },
    showBarcode: { type: DataTypes.BOOLEAN, defaultValue: false },
    showCustomerGst: { type: DataTypes.BOOLEAN, defaultValue: true },
    showBillingAddress: { type: DataTypes.BOOLEAN, defaultValue: true },
    showShippingAddress: { type: DataTypes.BOOLEAN, defaultValue: false },
    showProductCode: { type: DataTypes.BOOLEAN, defaultValue: false },
    showProductImage: { type: DataTypes.BOOLEAN, defaultValue: false },
    showUnit: { type: DataTypes.BOOLEAN, defaultValue: false },
    showDiscount: { type: DataTypes.BOOLEAN, defaultValue: true },
    showTaxColumns: { type: DataTypes.BOOLEAN, defaultValue: true },
    showSerialNumber: { type: DataTypes.BOOLEAN, defaultValue: true },
    showFooter: { type: DataTypes.BOOLEAN, defaultValue: true },
    showSignature: { type: DataTypes.BOOLEAN, defaultValue: true },
    showTerms: { type: DataTypes.BOOLEAN, defaultValue: true },
    showWatermark: { type: DataTypes.BOOLEAN, defaultValue: false },

    // Section 5 - Footer
    footerMessage: { type: DataTypes.TEXT },
    declaration: { type: DataTypes.TEXT },
    bankName: { type: DataTypes.STRING },
    accountNumber: { type: DataTypes.STRING },
    ifscCode: { type: DataTypes.STRING },
    upiId: { type: DataTypes.STRING },
    authorizedSignatory: { type: DataTypes.STRING },

    authadd: { type: DataTypes.INTEGER, allowNull: true },
    authlstedit: { type: DataTypes.INTEGER, allowNull: true },
    authdel: { type: DataTypes.INTEGER, allowNull: true },
    detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
    delondt: { type: DataTypes.DATE, allowNull: true }
  }, {
    timestamps: true,
    createdAt: 'addondt',
    updatedAt: 'editondt',
    tableName: 'invoice_templates'
  });

  return InvoiceTemplate;
};
