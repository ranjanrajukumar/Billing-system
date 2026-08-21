import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { Op, Sequelize } from 'sequelize';
import {
  sequelize, Role, User, Company, Category, Product, Branch, BranchStock, BinStock,
  InvoiceTemplate, StockMovement, Warehouse, WarehouseBin, ExpenseCategory, ApprovalRule,
} from '../models/index.js';
import { DEFAULT_TEMPLATES } from './defaultTemplates.js';
import { assertSupportedAuth, getConnectionOptions, getDbSettings } from './dbSettings.js';
import { withoutAudit } from '../services/audit.service.js';

function quoteSqlServerName(name) {
  return `[${String(name).replaceAll(']', ']]')}]`;
}

export async function ensureDatabase() {
  const settings = getDbSettings();
  const dbName = settings.database;
  const dbDialect = settings.dialect;

  if (dbDialect === 'sqlite') return;
  if (process.env.DB_CREATE_DATABASE === 'false') return;
  if (process.env.NODE_ENV === 'production' && process.env.DB_CREATE_DATABASE !== 'true') return;

  assertSupportedAuth();

  const adminDatabase = dbDialect === 'mssql' ? 'master' : dbName;
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
  } catch (err) {
    console.warn(`Database creation check skipped/ignored (${err.message})`);
  } finally {
    try {
      await adminConnection.close();
    } catch {}
  }
}

async function ensureMissingColumns() {
  const dialect = sequelize.getDialect();
  if (dialect !== 'mysql' && dialect !== 'mariadb') return;

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
        const columnAttribute = attribute.type?.key === 'JSON'
          ? { ...attribute, allowNull: true, defaultValue: undefined }
          : attribute;
        await queryInterface.addColumn(tableName, fieldName, columnAttribute);
        console.log(`Added missing column ${describedTable}.${fieldName}`);
      } catch (error) {
        if (error.original?.code !== 'ER_DUP_FIELDNAME') throw error;
      }

      existing.add(fieldName.toLowerCase());
    }
  }
}

/**
 * Compares the ENUM values defined in each Sequelize model with the values
 * actually present in the MySQL column and ALTERs the column when they differ.
 * This prevents "Data truncated for column" errors when new ENUM values are
 * added to a model but the database column was never updated.
 */
async function ensureEnumValues() {
  const dialect = sequelize.getDialect();
  if (dialect !== 'mysql' && dialect !== 'mariadb') return;

  const queryInterface = sequelize.getQueryInterface();
  const models = Object.values(sequelize.models);

  for (const model of models) {
    const tableName = model.getTableName();
    const describedTable = typeof tableName === 'string' ? tableName : tableName.tableName;
    const quotedTable = queryInterface.queryGenerator.quoteTable(tableName);
    const [columns] = await sequelize.query(`SHOW COLUMNS FROM ${quotedTable}`);
    const columnMap = Object.fromEntries(columns.map((c) => [c.Field.toLowerCase(), c]));

    for (const attribute of Object.values(model.rawAttributes)) {
      if (attribute.type?.key !== 'ENUM') continue;

      const fieldName = attribute.field || attribute.fieldName;
      if (!fieldName) continue;

      const col = columnMap[fieldName.toLowerCase()];
      if (!col || !col.Type.startsWith('enum(')) continue;

      // Parse the existing DB enum values: enum('A','B','C') → ['A','B','C']
      const dbValues = col.Type
        .slice(5, -1)                       // strip "enum(" and ")"
        .split(',')
        .map((v) => v.trim().replace(/^'|'$/g, ''));

      const modelValues = attribute.type.values || attribute.values || [];
      const dbSet = new Set(dbValues);
      const missing = modelValues.filter((v) => !dbSet.has(v));

      if (missing.length === 0) continue;

      const allQuoted = modelValues.map((v) => `'${v}'`).join(',');
      const nullClause = attribute.allowNull === false ? ' NOT NULL' : '';
      const defaultClause = attribute.defaultValue != null
        ? ` DEFAULT '${attribute.defaultValue}'`
        : '';

      await sequelize.query(
        `ALTER TABLE ${quotedTable} MODIFY COLUMN \`${fieldName}\` ENUM(${allQuoted})${nullClause}${defaultClause}`
      );
      console.log(`Updated ENUM ${describedTable}.${fieldName}: added ${missing.join(', ')}`);
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

  // Advanced-mode roles. They exist in Basic mode too but have nothing to do
  // there, since module gating removes their pages — creating them up front
  // means switching to Advanced does not also require inventing a role list.
  for (const name of ['Purchase Manager', 'Warehouse Manager', 'Branch Manager', 'Cashier', 'Inventory Staff', 'Auditor']) {
    await Role.findOrCreate({ where: { name }, defaults: { permissions: {} } });
  }
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
  const adminHash = await bcrypt.hash(adminPassword, Number(process.env.BCRYPT_ROUNDS || 12));
  const [adminUser, adminCreated] = await User.findOrCreate({
    where: { email: adminEmail },
    defaults: {
      name: 'System Admin',
      passwordHash: adminHash,
      roleId: adminRole.id
    }
  });

  const adminUpdates = {};
  if (!adminUser.roleId) adminUpdates.roleId = adminRole.id;
  if (adminUser.isActive === false) adminUpdates.isActive = true;

  // In development the login page advertises the seeded admin account, so keep
  // that account in sync with the configured default credentials.
  if (!adminCreated && process.env.NODE_ENV !== 'production') {
    adminUpdates.passwordHash = adminHash;
  }

  if (Object.keys(adminUpdates).length) {
    await adminUser.update(adminUpdates);
  }
  await Company.findOrCreate({
    where: { id: 1 },
    defaults: {
      name: 'Your Company',
      state: process.env.COMPANY_STATE || 'Tamil Nadu',
      businessType: 'General Store',
      productAttributeDefinitions: [],
    }
  });
  await Category.bulkCreate([{ name: 'General' }, { name: 'Electronics' }, { name: 'Services' }], { ignoreDuplicates: true });

  // Expense heads, matched to ledger accounts by name in chartOfAccounts.js.
  for (const name of ['Rent', 'Electricity', 'Salary', 'Transport', 'Maintenance', 'Internet', 'Marketing', 'Packaging', 'Other']) {
    await ExpenseCategory.findOrCreate({ where: { name }, defaults: { name } });
  }
}

/**
 * Existing warehouse master rows become real stock locations.
 *
 * Warehouses used to be a lookup list with no stock behind them. Mirroring them
 * into `branches` as locationType 'Warehouse' is what makes them usable for
 * transfers, GRNs and counts — matched by code, so re-running changes nothing.
 */
async function migrateWarehousesToLocations() {
  // Everything that predates the type column is a branch.
  try {
    await sequelize.query(
      `UPDATE ${sequelize.getQueryInterface().queryGenerator.quoteTable('branches')} SET location_type = 'Branch' WHERE location_type IS NULL`,
    );
  } catch (error) {
    console.warn(`Location type back-fill skipped: ${error.message}`);
  }

  let migrated = 0;
  const warehouses = await Warehouse.findAll({ where: { detstatus: false } }).catch(() => []);
  for (const warehouse of warehouses) {
    const code = String(warehouse.code || warehouse.name || `WH${warehouse.id}`).slice(0, 20);
    const [, created] = await Branch.findOrCreate({
      where: { branchCode: code },
      defaults: {
        branchName: warehouse.name,
        branchCode: code,
        locationType: 'Warehouse',
        // A warehouse stores; it does not bill.
        canSell: false,
        city: warehouse.city || null,
        isDefault: false,
        isActive: true,
      },
    });
    if (created) migrated += 1;
  }
  if (migrated > 0) console.log(`Promoted ${migrated} warehouse(s) to stock locations.`);
}

/**
 * Starter approval rules, created once and then owned by the business.
 *
 * They are seeded inactive on purpose: a threshold picked by us would be wrong
 * for almost everyone, so these exist as editable examples rather than as
 * policy imposed on a company that never asked for it.
 */
async function seedApprovalRules() {
  const examples = [
    { documentType: 'PurchaseOrder', name: 'Large purchase order', field: 'grandTotal', operator: '>', threshold: 100000, approverRole: 'Admin' },
    { documentType: 'StockTransfer', name: 'Large stock transfer', field: 'quantity', operator: '>', threshold: 500, approverRole: 'Warehouse Manager' },
    { documentType: 'StockAdjustment', name: 'Large stock adjustment', field: 'quantity', operator: '>', threshold: 50, approverRole: 'Warehouse Manager' },
    { documentType: 'Expense', name: 'Large expense', field: 'amount', operator: '>', threshold: 25000, approverRole: 'Admin' },
    { documentType: 'Discount', name: 'Deep discount', field: 'discountPercent', operator: '>', threshold: 10, approverRole: 'Branch Manager' },
  ];

  for (const rule of examples) {
    await ApprovalRule.findOrCreate({
      where: { documentType: rule.documentType, name: rule.name },
      defaults: { ...rule, isActive: false, priority: 100 },
    });
  }
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
      const quotedTable = sequelize.getQueryInterface().queryGenerator.quoteTable(table);
      await sequelize.query(
        `UPDATE ${quotedTable} SET branch_id = :branchId WHERE branch_id IS NULL`,
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

/**
 * Makes room for the stock ownership dimension on a database that predates it.
 *
 * Two things have to happen, in this order and before anything reads stock:
 *
 *   1. The old unique keys have to go. `branch_stock` was unique on
 *      (branch, product) and `bin_stock` on (bin, product, batch). Those are
 *      exactly the rows that must now be allowed to repeat once per owner, so
 *      leaving them in place would not corrupt anything — it would simply make
 *      it impossible to ever store a second owner's goods, and the failure
 *      would surface as a puzzling duplicate-key error months later.
 *
 *   2. Existing rows have to be attributed. Every quantity already in the
 *      database belongs to the company, so it is pointed at the house owner.
 *      Rows pointing at an owner that does not exist are repaired too, which
 *      makes this safe to run more than once.
 *
 * `sync({ alter: { drop: false } })` deliberately never drops anything, so the
 * stale keys are removed explicitly here. SQLite rebuilds tables wholesale on
 * alter and takes its indexes from the model, so it needs none of this.
 */
async function migrateStockOwnership() {
  const dialect = sequelize.getDialect();

  // ---- The owner column itself ----
  //
  // Added by hand, before `sync` gets the chance, because SQLite refuses to
  // ALTER in a column that has both a foreign key and a non-NULL default:
  //
  //   Cannot add a REFERENCES column with non-NULL default value
  //
  // Sequelize generates exactly that, since the model declares `allowNull:
  // false, defaultValue: 1` and an association to `stock_owners`. Adding the
  // column first — same type and default, no REFERENCES clause — means `sync`
  // finds it already present and leaves it alone.
  //
  // Only an existing database ever hits this. A fresh one creates the table
  // whole, where the constraint is legal, which is why it survived every test
  // until somebody upgraded a database that already had stock in it.
  const ownerColumns = ['branch_stock', 'bin_stock', 'stock_movements'];

  for (const table of ownerColumns) {
    try {
      const described = await sequelize.getQueryInterface().describeTable(table);
      if (described.owner_id) continue;

      await sequelize.query(
        dialect === 'mssql'
          ? `ALTER TABLE ${quoteSqlServerName(table)} ADD owner_id INT NOT NULL DEFAULT 1`
          : `ALTER TABLE \`${table}\` ADD COLUMN owner_id INTEGER NOT NULL DEFAULT 1`,
      );
      console.log(`Added ${table}.owner_id — existing rows will be attributed to your own stock.`);
    } catch (error) {
      // A table that does not exist yet is fine: sync is about to create it
      // with the column already in place.
      if (!/no such table|doesn't exist|Invalid object name/i.test(error.message)) {
        console.warn(`Could not pre-add ${table}.owner_id: ${error.message}`);
      }
    }
  }

  // ---- The stale unique keys ----

  const stale = [
    { table: 'branch_stock', columns: ['branch_id', 'product_id'] },
    { table: 'bin_stock', columns: ['bin_id', 'product_id', 'batch_id'] },
  ];

  if (dialect === 'sqlite') {
    for (const { table, columns } of stale) {
      const indexes = await sequelize.query(`PRAGMA index_list(\`${table}\`)`, {
        type: sequelize.QueryTypes.SELECT,
      }).catch(() => []);

      for (const index of indexes || []) {
        if (!index.unique) continue;
        // Auto-indexes belong to the table definition and cannot be dropped;
        // they are replaced when sync rebuilds the table.
        if (String(index.name).startsWith('sqlite_autoindex')) continue;

        const cols = await sequelize.query(`PRAGMA index_info(\`${index.name}\`)`, {
          type: sequelize.QueryTypes.SELECT,
        }).catch(() => []);
        const names = (cols || []).map((c) => c.name).join(',');
        if (names !== columns.join(',')) continue;

        try {
          await sequelize.query(`DROP INDEX \`${index.name}\``);
          console.log(`Dropped stale unique key ${index.name} on ${table} — stock is now keyed by owner too.`);
        } catch (error) {
          console.warn(`Could not drop ${index.name} on ${table}: ${error.message}`);
        }
      }
    }
  }

  if (dialect === 'mysql' || dialect === 'mariadb') {
    const dbName = sequelize.config.database;
    for (const { table, columns } of stale) {
      const [indexes] = await sequelize.query(`
        SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = :dbName AND TABLE_NAME = :table AND NON_UNIQUE = 0
        GROUP BY INDEX_NAME
      `, { replacements: { dbName, table } }).catch(() => [[]]);

      for (const index of indexes || []) {
        if (index.INDEX_NAME === 'PRIMARY') continue;
        // Only the exact old key, never a wider one that already includes owner.
        if (index.cols !== columns.join(',')) continue;
        try {
          await sequelize.query(`ALTER TABLE \`${table}\` DROP INDEX \`${index.INDEX_NAME}\``);
          console.log(`Dropped stale unique key ${index.INDEX_NAME} on ${table} — stock is now keyed by owner too.`);
        } catch (error) {
          console.warn(`Could not drop ${index.INDEX_NAME} on ${table}: ${error.message}`);
        }
      }
    }
  }

  if (dialect === 'mssql') {
    for (const { table, columns } of stale) {
      const [indexes] = await sequelize.query(`
        SELECT i.name AS name,
               STUFF((SELECT ',' + c.name
                      FROM sys.index_columns ic2
                      JOIN sys.columns c ON c.object_id = ic2.object_id AND c.column_id = ic2.column_id
                      WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id
                      ORDER BY ic2.key_ordinal
                      FOR XML PATH('')), 1, 1, '') AS cols
        FROM sys.indexes i
        WHERE i.object_id = OBJECT_ID(:table) AND i.is_unique = 1 AND i.is_primary_key = 0
      `, { replacements: { table } }).catch(() => [[]]);

      for (const index of indexes || []) {
        if (index.cols !== columns.join(',')) continue;
        try {
          await sequelize.query(`DROP INDEX ${quoteSqlServerName(index.name)} ON ${quoteSqlServerName(table)}`);
          console.log(`Dropped stale unique key ${index.name} on ${table} — stock is now keyed by owner too.`);
        } catch (error) {
          console.warn(`Could not drop ${index.name} on ${table}: ${error.message}`);
        }
      }
    }
  }
}

/** Points every pre-ownership stock row at the house. */
async function attributeExistingStockToHouse() {
  const { ensureHouseOwner } = await import('../services/stockOwner.service.js');
  const house = await ensureHouseOwner();

  // `IS NULL OR NOT IN (owners)` rather than a plain null check, so a row left
  // pointing at a deleted owner is repaired rather than orphaned.
  const repair = async (model, label) => {
    const [, affected] = await model.update(
      { ownerId: house.id },
      {
        where: {
          [Op.or]: [
            { ownerId: null },
            { ownerId: { [Op.notIn]: Sequelize.literal('(SELECT id FROM stock_owners)') } },
          ],
        },
      },
    ).catch(() => [null, 0]);
    if (affected) console.log(`Attributed ${affected} ${label} row(s) to ${house.ownerName}.`);
  };

  await repair(BranchStock, 'branch_stock');
  await repair(BinStock, 'bin_stock');
  await repair(StockMovement, 'stock_movements');
}

/**
 * Clears the way for the unique (branch, code) key on warehouse bins.
 *
 * Bin codes were only unique by convention before, so a database that already
 * has two bins answering to the same name in one warehouse would make `sync`
 * fail to create the index — and on some dialects, fail the whole boot.
 *
 * Duplicates are suffixed rather than deleted or merged. A code is a label
 * printed on a shelf, not a key anything joins on (rules and stock reference
 * `bin_id`), so renaming is safe, reversible by hand, and infinitely preferable
 * to a warehouse that will not start. Every change is logged loudly so somebody
 * can go and reprint the label.
 */
async function deduplicateBinCodes() {
  const duplicates = await sequelize.query(`
    SELECT branch_id, code, COUNT(*) AS n
    FROM warehouse_bins
    WHERE detstatus = 0
    GROUP BY branch_id, code
    HAVING COUNT(*) > 1
  `, { type: sequelize.QueryTypes.SELECT }).catch(() => []);

  for (const row of duplicates || []) {
    const bins = await WarehouseBin.findAll({
      where: { branchId: row.branch_id, code: row.code, detstatus: false },
      order: [['id', 'ASC']],
    });
    // The first keeps the code; the rest are suffixed in creation order.
    for (let i = 1; i < bins.length; i += 1) {
      const renamed = `${row.code}-${i + 1}`;
      await bins[i].update({ code: renamed });
      console.warn(
        `Bin code "${row.code}" was used ${row.n} times at location ${row.branch_id}; `
        + `bin #${bins[i].id} renamed to "${renamed}". Update the shelf label to match.`,
      );
    }
  }
}

/**
 * Storage snapshots write 0 — not NULL — for "no bin" and "no batch", because
 * the unique grain key is what stops a re-run billing a client twice, and MySQL
 * and SQL Server both treat NULLs in a unique key as distinct. The sentinel is
 * load-bearing.
 *
 * An older schema also put foreign keys on those two columns, and 0 is not a
 * real bin, so every row the job tried to write died on the constraint. The
 * association was later dropped from the model, but the constraint stayed
 * behind in databases created before that — leaving storage billing capturing
 * nothing at all, quietly, because the scheduler logs the failure and moves on.
 *
 * The constraints go rather than the sentinel: a snapshot is a historical fact
 * about a day that may already have been invoiced, not a live reference. The
 * old keys were ON DELETE SET NULL, so retiring a bin would have rewritten
 * finished billing history — the opposite of what this table exists to do.
 */
async function dropSentinelForeignKeys() {
  const dialect = sequelize.getDialect();
  if (dialect !== 'mysql' && dialect !== 'mariadb') return;

  const targets = [
    { table: 'warehouse_storage_snapshots', columns: ['bin_id', 'batch_id'] },
  ];

  for (const { table, columns } of targets) {
    const [keys] = await sequelize.query(`
      SELECT CONSTRAINT_NAME AS name, COLUMN_NAME AS columnName
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table
        AND COLUMN_NAME IN (:columns)
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `, { replacements: { table, columns } }).catch(() => [[]]);

    for (const key of keys || []) {
      try {
        await sequelize.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${key.name}\``);
        console.warn(
          `Dropped foreign key ${key.name} on ${table}.${key.columnName}: the column uses `
          + '0 to mean "none", which no foreign key can express.',
        );
      } catch (error) {
        console.warn(`Could not drop foreign key ${key.name} on ${table}: ${error.message}`);
      }
    }
  }
}

/**
 * Widens the quantity columns from integer to decimal.
 *
 * Stock is held in a product's base unit, and a base unit is not always
 * countable: seed sold loose by the gram, cable by the metre, oil by the litre.
 * An integer balance rounds every fractional movement — MySQL stores 0.5 as 1
 * and 0.4 as 0 — so a shop selling 100g from a 50kg bucket was either given
 * free stock or billed for stock it still had, silently, with a ledger entry
 * that looked correct.
 *
 * The widening is lossless: every existing integer is representable exactly as
 * a decimal, so this cannot damage the balances already recorded. It is done
 * explicitly here rather than left to `sync({ alter })` because a column type
 * change on live stock is not something to discover in a diff.
 */
async function widenQuantityColumns() {
  const dialect = sequelize.getDialect();
  if (dialect !== 'mysql' && dialect !== 'mariadb') return;

  const targets = [
    { table: 'branch_stock', column: 'stock', nullable: false, fallback: '0' },
    { table: 'branch_stock', column: 'reserved_quantity', nullable: false, fallback: '0' },
    { table: 'products', column: 'stock', nullable: false, fallback: '0' },
    { table: 'stock_movements', column: 'quantity', nullable: false, fallback: null },
    { table: 'stock_movements', column: 'quantity_in', nullable: false, fallback: '0' },
    { table: 'stock_movements', column: 'quantity_out', nullable: false, fallback: '0' },
    { table: 'bin_stock', column: 'quantity', nullable: false, fallback: '0' },
  ];

  for (const target of targets) {
    const [[existing]] = await sequelize.query(`
      SELECT COLUMN_TYPE AS type
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column
    `, { replacements: { table: target.table, column: target.column } }).catch(() => [[]]);

    if (!existing) continue;
    if (String(existing.type).toLowerCase() === 'decimal(18,4)') continue;

    const nullClause = target.nullable ? 'NULL' : 'NOT NULL';
    const defaultClause = target.fallback === null ? '' : ` DEFAULT ${target.fallback}`;

    try {
      await sequelize.query(
        `ALTER TABLE \`${target.table}\` MODIFY COLUMN \`${target.column}\` `
        + `DECIMAL(18,4) ${nullClause}${defaultClause}`,
      );
      console.warn(
        `Widened ${target.table}.${target.column} from ${existing.type} to decimal(18,4) `
        + 'so fractional quantities stop being rounded.',
      );
    } catch (error) {
      console.error(`Could not widen ${target.table}.${target.column}: ${error.message}`);
    }
  }
}

/**
 * Retires the old two-column unique key on `branch_stock`.
 *
 * The balance grain has widened twice: first when stock gained an owner, so a
 * 3PL location could hold the same product for several clients, and now again
 * for variants, so the 100g pouches and the loose bucket are separate balances
 * of one product. A UNIQUE key on (branch_id, product_id) contradicts both — it
 * permits exactly one row per product per location, which is the shape the
 * table had years ago.
 *
 * It survived the earlier ownership migration because MySQL refuses to drop an
 * index a foreign key is relying on, and the `branch_id` foreign key was using
 * this composite as its backing index. The boot log has been reporting that
 * failure on every start. Giving `branch_id` an index of its own first frees
 * the composite to be dropped.
 */
async function widenBranchStockGrain() {
  const dialect = sequelize.getDialect();
  if (dialect !== 'mysql' && dialect !== 'mariadb') return;

  const [indexes] = await sequelize.query(`
    SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique,
           GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'branch_stock'
    GROUP BY INDEX_NAME, NON_UNIQUE
  `).catch(() => [[]]);

  const byName = new Map((indexes || []).map((index) => [index.name, index]));

  // The wider key must already exist, or dropping the narrow one would leave
  // the table with no protection against duplicate balances at all.
  const grain = [...byName.values()].find(
    (index) => index.cols === 'branch_id,product_id,variant_id,owner_id' && Number(index.nonUnique) === 0,
  );
  if (!grain) return;

  const stale = [...byName.values()].find(
    (index) => index.cols === 'branch_id,product_id' && Number(index.nonUnique) === 0,
  );
  if (!stale) return;

  try {
    // Give the foreign key somewhere else to point before taking its index away.
    if (!byName.has('branch_stock_branch_id')) {
      await sequelize.query('CREATE INDEX `branch_stock_branch_id` ON `branch_stock` (`branch_id`)');
    }
    await sequelize.query(`ALTER TABLE \`branch_stock\` DROP INDEX \`${stale.name}\``);
    console.warn(
      `Dropped stale unique index ${stale.name} on branch_stock (branch_id, product_id): `
      + 'a location may hold the same product as several variants and for several owners.',
    );
  } catch (error) {
    console.error(`Could not retire ${stale.name} on branch_stock: ${error.message}`);
  }
}

/**
 * Removes a redundant index left where a column was declared unique twice.
 *
 * A column that is both `unique: true` and separately listed in `indexes` gets
 * two indexes covering it, and sync then tries to create the second one on
 * every boot. Whether that succeeds depends on whether the duplicate sweep
 * happened to drop it first, so the process crashed on some starts and not
 * others — a start-up failure that came and went was the worst part of it.
 *
 * The models no longer declare both. This clears the extra index out of
 * databases created while they did, so sync stops trying to reconcile it.
 * Only plainly redundant ones go: a non-unique index whose column is already
 * covered by a unique index is doing nothing a query planner needs.
 */
async function dropRedundantUniqueIndexes() {
  const dialect = sequelize.getDialect();
  if (dialect !== 'mysql' && dialect !== 'mariadb') return;

  const targets = [
    { table: 'invoices', column: 'invoice_number' },
    { table: 'stock_owners', column: 'owner_code' },
    { table: 'warehouse_tasks', column: 'task_number' },
    { table: 'idempotency_keys', column: 'idempotency_key' },
  ];

  for (const { table, column } of targets) {
    const [indexes] = await sequelize.query(`
      SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique, COUNT(*) AS colCount
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table
      GROUP BY INDEX_NAME, NON_UNIQUE
      HAVING colCount = 1
    `, { replacements: { table } }).catch(() => [[]]);

    const onColumn = [];
    for (const index of indexes || []) {
      const [[first]] = await sequelize.query(`
        SELECT COLUMN_NAME AS col FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND INDEX_NAME = :name
      `, { replacements: { table, name: index.name } }).catch(() => [[]]);
      if (first?.col === column) onColumn.push(index);
    }

    // Only act when the column really is indexed twice and one of them is the
    // unique constraint that must survive.
    const unique = onColumn.find((index) => Number(index.nonUnique) === 0);
    const redundant = onColumn.filter((index) => Number(index.nonUnique) === 1);
    if (!unique || redundant.length === 0) continue;

    for (const index of redundant) {
      try {
        await sequelize.query(`ALTER TABLE \`${table}\` DROP INDEX \`${index.name}\``);
        console.warn(
          `Dropped redundant index ${index.name} on ${table}.${column}; `
          + `the unique index ${unique.name} already covers it.`,
        );
      } catch (error) {
        console.warn(`Could not drop ${index.name} on ${table}: ${error.message}`);
      }
    }
  }
}

export async function migrateDatabase() {
  await ensureDatabase();
  await sequelize.authenticate();

  await dropDuplicateIndexes();
  // Before sync, so sync does not meet an index it will try to create again.
  await dropRedundantUniqueIndexes();
  // Before sync, so the wider owner-aware keys can be created in its place.
  await migrateStockOwnership();
  await deduplicateBinCodes();
  await sequelize.sync({ alter: { drop: false } });
  await ensureMissingColumns();
  await ensureEnumValues();
  // After sync, so a constraint sync has just re-created is still removed.
  await dropSentinelForeignKeys();
  // After sync too: sync may recreate an integer column from an older model
  // cache, and this is the authority on quantity precision.
  await widenQuantityColumns();
  // After sync has created the wider unique key, so the narrow one is only
  // dropped once its replacement is in place.
  await widenBranchStockGrain();

  // Seeding is the system setting itself up, not a user acting, so it is not
  // audited — see withoutAudit for why that also matters mechanically.
  await withoutAudit(async () => {
    await seedDefaults();
    // Runs before anything else touches stock, so the id that `branch_stock`,
    // `bin_stock` and the ledger all default to is guaranteed to exist.
    await attributeExistingStockToHouse();
    await migrateToDefaultBranch();
    await migrateWarehousesToLocations();
    await seedApprovalRules();
    await seedInvoiceTemplates();
    await migrateImagesToDatabase();

    // Accounts are only seeded for a company already running in Advanced mode;
    // switching mode seeds them too, so a Basic shop never grows a chart it has
    // no use for.
    const company = await Company.findOne();
    if (company?.businessMode === 'Advanced') {
      const { seedChartOfAccounts } = await import('../services/accounting.service.js');
      await seedChartOfAccounts();
    }
  });
}
