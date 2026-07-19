import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';
import { getConnectionOptions, getDbSettings } from './dbSettings.js';

dotenv.config();

const settings = getDbSettings();

const connectionOptions = {
  ...getConnectionOptions({ databaseLogging: process.env.NODE_ENV === 'development' ? console.log : false }),
  define: {
    underscored: true,
    timestamps: true,
    paranoid: false
  },
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 }
};

export const sequelize = new Sequelize(
  settings.database,
  settings.user,
  settings.password,
  connectionOptions
);
