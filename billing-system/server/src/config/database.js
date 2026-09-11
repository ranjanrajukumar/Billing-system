import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';
import { getConnectionOptions, getDbSettings } from './dbSettings.js';

// Local overrides stay out of version control and take precedence over the
// shared development defaults in .env. Hosting providers still supply their
// variables through process.env, which dotenv never overwrites by default.
dotenv.config({ path: ['.env.local', '.env'] });

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
  // SQLite has one writer. A multi-connection pool turns ordinary concurrent
  // writes into SQLITE_BUSY, so it gets a single connection and is told to wait
  // rather than fail if a write is briefly held.
  connectionOptions.pool = { max: 1, min: 0, idle: 10_000, acquire: 60_000 };
  connectionOptions.retry = { match: [/SQLITE_BUSY/], max: 5 };
  connectionOptions.dialectOptions = { ...connectionOptions.dialectOptions, timeout: 30_000 };
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

