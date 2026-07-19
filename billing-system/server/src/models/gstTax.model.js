import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const GstTax = sequelize.define('GstTax', {
    name: { type: DataTypes.STRING, allowNull: false },
    rate: { type: DataTypes.FLOAT, allowNull: false },
    taxType: { type: DataTypes.STRING, allowNull: false },
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
  return GstTax;
};
