import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const InvoiceSetting = sequelize.define('InvoiceSetting', {
    invoicePrefix: { type: DataTypes.STRING, allowNull: false },
    nextNumber: { type: DataTypes.INTEGER, allowNull: false },
    terms: { type: DataTypes.TEXT },
    footerNote: { type: DataTypes.TEXT },
    authadd: { type: DataTypes.INTEGER, allowNull: true },
    authlstedit: { type: DataTypes.INTEGER, allowNull: true },
    authdel: { type: DataTypes.INTEGER, allowNull: true },
    detstatus: { type: DataTypes.BOOLEAN, defaultValue: false },
    delondt: { type: DataTypes.DATE, allowNull: true }
  }, {
    timestamps: true,
    createdAt: 'addondt',
    updatedAt: 'editondt'
  });
  return InvoiceSetting;
};
