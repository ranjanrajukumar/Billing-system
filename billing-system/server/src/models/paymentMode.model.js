import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const PaymentMode = sequelize.define('PaymentMode', {
    name: { type: DataTypes.STRING, allowNull: false },
    accountType: { type: DataTypes.STRING },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
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
  return PaymentMode;
};
