import { DataTypes } from 'sequelize';
import { unsignedInteger } from './types.js';

export default (sequelize) => {
  const ExpenseCategory = sequelize.define('ExpenseCategory', {
    id: { type: unsignedInteger(sequelize), autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.STRING },
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
  return ExpenseCategory;
};
