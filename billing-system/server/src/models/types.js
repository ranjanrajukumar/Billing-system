import { DataTypes } from 'sequelize';

export function unsignedInteger(sequelize) {
  return sequelize.getDialect() === 'mssql' ? DataTypes.INTEGER : DataTypes.INTEGER.UNSIGNED;
}

export function enumType(sequelize, values, maxLength = 40) {
  if (sequelize.getDialect() === 'mssql') {
    return {
      type: DataTypes.STRING(maxLength),
      validate: { isIn: [values] }
    };
  }

  return { type: DataTypes.ENUM(...values) };
}
