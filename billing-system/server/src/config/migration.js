import bcrypt from 'bcrypt';
import { Sequelize } from 'sequelize';
import { sequelize, Role, User, Company, Category } from '../models/index.js';
import { assertSupportedAuth, getConnectionOptions, getDbSettings } from './dbSettings.js';

const settings = getDbSettings();
const dbName = settings.database;
const dbDialect = settings.dialect;

function quoteSqlServerName(name) {
  return `[${String(name).replaceAll(']', ']]')}]`;
}

export async function ensureDatabase() {
  if (dbDialect === 'sqlite') return;

  assertSupportedAuth();

  const adminDatabase = dbDialect === 'mssql' ? 'master' : '';
  const adminConnection = new Sequelize(
    adminDatabase,
    settings.user,
    settings.password,
    getConnectionOptions({ databaseLogging: false })
  );

  try {
    if (dbDialect === 'mssql') {
      await adminConnection.query(
        `IF DB_ID(N'${String(dbName).replaceAll("'", "''")}') IS NULL CREATE DATABASE ${quoteSqlServerName(dbName)}`
      );
      return;
    }

    await adminConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await adminConnection.close();
  }
}

export async function seedDefaults() {
  const fullPermissions = {
    users: { view: true, create: true, edit: true, delete: true },
    roles: { view: true, create: true, edit: true, delete: true },
    masters: { view: true, create: true, edit: true, delete: true },
    inventory: { view: true, create: true, edit: true, delete: true },
    purchases: { view: true, create: true, edit: true, delete: true },
    sales: { view: true, create: true, edit: true, delete: true },
    accounts: { view: true, create: true, edit: true, delete: true },
    reports: { view: true, create: true, edit: true, delete: true },
    settings: { view: true, create: true, edit: true, delete: true }
  };

  const [adminRole] = await Role.findOrCreate({ 
    where: { name: 'Admin' }, 
    defaults: { permissions: fullPermissions } 
  });
  if (adminRole) {
    await adminRole.update({ permissions: fullPermissions });
  }

  await Role.findOrCreate({ where: { name: 'Sales' }, defaults: { permissions: {} } });
  await Role.findOrCreate({ where: { name: 'Accountant' }, defaults: { permissions: {} } });
  await User.findOrCreate({
    where: { email: process.env.ADMIN_EMAIL || 'admin@example.com' },
    defaults: {
      name: 'System Admin',
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', Number(process.env.BCRYPT_ROUNDS || 12)),
      roleId: adminRole.id
    }
  });
  await Company.findOrCreate({
    where: { id: 1 },
    defaults: { name: 'Your Company', state: process.env.COMPANY_STATE || 'Tamil Nadu' }
  });
  await Category.bulkCreate([{ name: 'General' }, { name: 'Electronics' }, { name: 'Services' }], { ignoreDuplicates: true });
}

export async function migrateDatabase() {
  await ensureDatabase();
  await sequelize.authenticate();
  await sequelize.sync({ alter: process.env.DB_SYNC_ALTER !== 'false' });
  await seedDefaults();
}
