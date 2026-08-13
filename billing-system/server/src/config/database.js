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
  }
};

if (settings.dialect === 'sqlite') {
  delete connectionOptions.pool;
}

export const sequelize = settings.dialect === 'sqlite'
  ? new Sequelize({
      dialect: 'sqlite',
      storage: settings.storage,
      ...connectionOptions
    })
  : new Sequelize(
      settings.database,
      settings.user,
      settings.password,
      connectionOptions
    );

