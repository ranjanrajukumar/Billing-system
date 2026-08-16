import { DataTypes } from 'sequelize';

export function unsignedInteger(sequelize) {
  if (['mysql', 'mariadb'].includes(sequelize.getDialect())) {
    return DataTypes.INTEGER.UNSIGNED;
  }
  return DataTypes.INTEGER;
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
