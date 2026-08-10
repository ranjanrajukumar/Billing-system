import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { Op, Sequelize } from 'sequelize';
import { sequelize, Role, User, Company, Category, Product, Branch, BranchStock, InvoiceTemplate } from '../models/index.js';
import { DEFAULT_TEMPLATES } from './defaultTemplates.js';
import { assertSupportedAuth, getConnectionOptions, getDbSettings } from './dbSettings.js';

function quoteSqlServerName(name) {
  return `[${String(name).replaceAll(']', ']]')}]`;
}

export async function ensureDatabase() {
  const settings = getDbSettings();
  const dbName = settings.database;
  const dbDialect = settings.dialect;

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

async function ensureMissingColumns() {
  const queryInterface = sequelize.getQueryInterface();
  const models = Object.values(sequelize.models);

  for (const model of models) {
    const tableName = model.getTableName();
    const describedTable = typeof tableName === 'string' ? tableName : tableName.tableName;
    const quotedTable = queryInterface.queryGenerator.quoteTable(tableName);
    const [columns] = await sequelize.query(`SHOW COLUMNS FROM ${quotedTable}`);
    const existing = new Set(columns.map((column) => column.Field.toLowerCase()));

    for (const attribute of Object.values(model.rawAttributes)) {
      if (attribute.type?.key === 'VIRTUAL') continue;

      const fieldName = attribute.field || attribute.fieldName;
      if (!fieldName || existing.has(fieldName.toLowerCase())) continue;

      try {
        await queryInterface.addColumn(tableName, fieldName, attribute);
        console.log(`Added missing column ${describedTable}.${fieldName}`);
      } catch (error) {
        if (error.original?.code !== 'ER_DUP_FIELDNAME') throw error;
      }

      existing.add(fieldName.toLowerCase());
    }
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

async function dropDuplicateIndexes() {
  const dialect = sequelize.getDialect();
  if (dialect !== 'mysql' && dialect !== 'mariadb') return;

  const dbName = sequelize.config.database;

  const [tables] = await sequelize.query(`
    SELECT TABLE_NAME, COUNT(*) AS key_count
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = :dbName
    GROUP BY TABLE_NAME
    HAVING key_count > 5
  `, { replacements: { dbName } });

  for (const { TABLE_NAME: table } of tables) {
    const [indexes] = await sequelize.query(`SHOW INDEX FROM \`${table}\``);
    const columnToIndexes = {};

    for (const idx of indexes) {
      const col = idx.Column_name;
      if (!columnToIndexes[col]) columnToIndexes[col] = [];
      columnToIndexes[col].push(idx.Key_name);
    }

    for (const [, names] of Object.entries(columnToIndexes)) {
      const unique = [...new Set(names)];
      if (unique.length <= 1) continue;

      const keep = unique.find((n) => n === 'PRIMARY') || unique[0];
      for (const name of unique) {
        if (name === keep) continue;

        try {
          const [fks] = await sequelize.query(`
            SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = :dbName AND TABLE_NAME = :table
              AND CONSTRAINT_NAME = :name AND CONSTRAINT_TYPE = 'FOREIGN KEY'
          `, { replacements: { dbName, table, name } });

          if (fks.length) {
            await sequelize.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${name}\``);
          }

          await sequelize.query(`ALTER TABLE \`${table}\` DROP INDEX \`${name}\``);
        } catch {
          // index may already have been removed
        }
      }
    }
  }
}

/**
 * Everything that existed before branches belongs to one default branch, and
 * each product's stock becomes that branch's stock. Idempotent: rows that are
 * already assigned are left alone.
 */
async function migrateToDefaultBranch() {
  const [branch] = await Branch.findOrCreate({
    where: { branchCode: 'MAIN' },
    defaults: {
      branchName: 'Main Branch',
      branchCode: 'MAIN',
      isDefault: true,
      isActive: true,
    },
  });

  // Users without a branch work at the default one.
  await User.update({ branchId: branch.id }, { where: { branchId: null } });

  // Back-fill per-branch stock from the existing single figure.
  const products = await Product.findAll({ attributes: ['id', 'stock'] });
  for (const product of products) {
    const [row, created] = await BranchStock.findOrCreate({
      where: { branchId: branch.id, productId: product.id },
      defaults: { branchId: branch.id, productId: product.id, stock: product.stock || 0 },
    });
    if (!created && row.stock === 0 && Number(product.stock) > 0) {
      await row.update({ stock: product.stock });
    }
  }

  // Existing transactions are attributed to the default branch.
  const tables = [
    'invoices', 'purchases', 'sales_orders', 'quotations',
    'delivery_challans', 'sales_returns', 'stock_movements',
  ];
  for (const table of tables) {
    try {
      await sequelize.query(
        `UPDATE \`${table}\` SET branch_id = :branchId WHERE branch_id IS NULL`,
        { replacements: { branchId: branch.id } },
      );
    } catch (error) {
      console.warn(`Branch back-fill skipped for ${table}: ${error.message}`);
    }
  }

  return branch;
}

/**
 * Seeds the ready-made invoice layouts. Matched by name, so a template the user
 * has edited is never overwritten and re-running is harmless.
 */
async function seedInvoiceTemplates() {
  let added = 0;
  for (const template of DEFAULT_TEMPLATES) {
    const [, created] = await InvoiceTemplate.findOrCreate({
      where: { templateName: template.templateName },
      defaults: { ...template, isActive: true, isDefault: false },
    });
    if (created) added += 1;
  }
  if (added > 0) console.log(`Seeded ${added} invoice template(s).`);
}

const MIME_BY_EXTENSION = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
};

// Moves images that predate database storage off the filesystem and into their
// BLOB column. Clearing the path column makes this a no-op on later boots.
async function migrateImagesToDatabase() {
  const targets = [
    { model: Product, pathField: 'imagePath', dataField: 'imageData', mimeField: 'imageMimeType' },
    { model: Company, pathField: 'logoPath', dataField: 'logoData', mimeField: 'logoMimeType' },
    { model: User, pathField: 'profileImagePath', dataField: 'profileImageData', mimeField: 'profileImageMimeType' }
  ];

  let moved = 0;
  for (const { model, pathField, dataField, mimeField } of targets) {
    const rows = await model.unscoped().findAll({
      where: { [pathField]: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } }
    });

    for (const row of rows) {
      const storedPath = row[pathField];
      const file = path.join(process.cwd(), storedPath);
      if (!fs.existsSync(file)) {
        console.warn(`Image missing on disk, clearing reference: ${storedPath}`);
        await row.update({ [pathField]: null });
        continue;
      }

      await row.update({
        [dataField]: fs.readFileSync(file),
        [mimeField]: MIME_BY_EXTENSION[path.extname(file).toLowerCase()] || 'application/octet-stream',
        [pathField]: null
      });
      moved += 1;
    }
  }

  if (moved > 0) console.log(`Moved ${moved} image(s) from disk into the database.`);
}

export async function migrateDatabase() {
  await ensureDatabase();
  await sequelize.authenticate();

  await dropDuplicateIndexes();
  await sequelize.sync({ alter: false });
  await ensureMissingColumns();
  await seedDefaults();
  await migrateToDefaultBranch();
  await seedInvoiceTemplates();
  await migrateImagesToDatabase();
}
