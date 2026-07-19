import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Warehouse = sequelize.define('Warehouse', {
    name: { type: DataTypes.STRING, allowNull: false },
    code: { type: DataTypes.STRING, allowNull: false },
    city: { type: DataTypes.STRING },
    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
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
  return Warehouse;
};
