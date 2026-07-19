import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const FinancialYear = sequelize.define('FinancialYear', {
    name: { type: DataTypes.STRING, allowNull: false },
    startDate: { type: DataTypes.STRING, allowNull: false },
    endDate: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'Open' },
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
  return FinancialYear;
};
