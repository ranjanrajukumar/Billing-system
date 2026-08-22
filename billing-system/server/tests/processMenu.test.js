/**
 * Process menus and the overviews behind them.
 *
 * The nesting introduces one rule that did not exist while the menu was flat,
 * and it is the kind that fails silently:
 *
 *   A process is visible exactly when one of its documents is.
 *
 * It is not a right anybody is granted and not a module anybody switches on. Get
 * that wrong in the permissive direction and a role sees a flow it cannot open a
 * single screen in; get it wrong the other way and switching a module off leaves
 * a parent pointing at nothing. Neither throws — both just render.
 *
 * The overviews are checked against real documents rather than mocked counts,
 * because the numbers are the whole point of the page and a stage that counts
 * the wrong thing looks exactly like a quiet week.
 *
 * Runs against a throwaway in-memory SQLite database.
 *
 *   node --test tests/
 */
process.env.NODE_ENV = 'test';
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.AUTO_MIGRATE = 'false';
process.env.DISABLE_JOBS = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-for-anything-real-0000';

import assert from 'node:assert/strict';
import test, { before, after, beforeEach, describe } from 'node:test';

const models = await import('../src/models/index.js');
const menu = await import('../src/config/menu.js');
const modules = await import('../src/config/modules.js');
const processController = await import('../src/modules/reporting/process.controller.js');
const invoices = await import('../src/modules/sales/invoice.controller.js');
const orders = await import('../src/modules/sales/salesOrder.controller.js');
const fulfilment = await import('../src/modules/warehouse/fulfilment.controller.js');
const stock = await import('../src/modules/inventory/stock.service.js');

const {
  sequelize, Branch, Company, Customer, Product, SalesOrder, SalesOrderItem,
  StockOwner, User,
} = models;

let branch;
let customer;
let widget;

const USER = { id: 1, name: 'Operator' };

/** Every menu key an enabled-module set produces, flattened past the nesting. */
const allModuleKeys = () => modules.MODULES.map((m) => m.key);

function run(handler, { params = {}, body = {}, query = {}, user = {} } = {}) {
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code) { status = code; return res; },
      json(payload) { resolve({ status, body: payload }); return res; },
    };
    handler({
      params, body, query, branchId: branch.id,
      user: { id: USER.id, name: USER.name, role: 'Admin', menus: menu.ALL_MENU_KEYS, ...user },
    }, res, reject);
  });
}

/** A sales order taken all the way out of the door but never billed. */
async function dispatchedOrder(quantity = 5) {
  const { body: created } = await run(orders.create, {
    body: {
      customerId: customer.id,
      orderDate: '2026-08-22',
      items: [{ productId: widget.id, quantity, rate: 100, gstPercent: 18 }],
    },
  });
  await run(orders.confirm, { params: { id: created.id } });
  await run(fulfilment.allocate, { params: { id: created.id }, body: { branchId: branch.id } });
  const line = await SalesOrderItem.findOne({ where: { orderId: created.id } });
  await line.update({ pickedQty: line.allocatedQty, packedQty: line.allocatedQty });
  await run(fulfilment.dispatch, { params: { id: created.id }, body: {} });
  return SalesOrder.findByPk(created.id);
}

before(async () => {
  await sequelize.sync({ force: true });
  await StockOwner.create({ id: 1, ownerName: 'House', ownerCode: 'HOUSE', isHouse: true });
  await Company.create({ name: 'Test Co', state: 'Maharashtra', businessMode: 'Advanced' });
  await User.create({
    id: USER.id, name: USER.name, email: 'op@example.test', passwordHash: 'not-a-real-hash',
  });
  branch = await Branch.create({ branchName: 'Main', branchCode: 'MAIN', locationType: 'Branch' });
  customer = await Customer.create({
    customerName: 'Acme', state: 'Maharashtra', mobileNumber: '9000000001',
  });
});

after(async () => {
  await sequelize.close();
});

beforeEach(async () => {
  widget = await Product.create({
    productName: `Widget ${Date.now()}${Math.random()}`,
    primaryUnit: 'PCS', purchasePrice: 60, sellingPrice: 100, gstPercent: 18,
  });
  await stock.setBranchStock({
    productId: widget.id, branchId: branch.id, quantity: 100, transaction: null, userId: USER.id,
  });
});

describe('the menu tree', () => {
  test('a process parent is not a grantable key', async () => {
    // It has a page, but rights are held on documents. Listing it would let a
    // role be granted the overview of a flow it cannot open anything in.
    for (const process of menu.PROCESSES) {
      assert.equal(
        menu.ALL_MENU_KEYS.includes(process.key), false,
        `${process.key} should not be a grantable menu key`,
      );
    }
  });

  test('every leaf is still reachable from the flat key list', async () => {
    const nested = menu.MENU_CATALOGUE
      .flatMap((g) => g.items)
      .filter((i) => i.children)
      .flatMap((i) => i.children.map((c) => c.key));

    assert.equal(nested.length > 0, true, 'the tree actually has nesting in it');
    for (const key of nested) {
      assert.equal(menu.ALL_MENU_KEYS.includes(key), true, `${key} is missing from ALL_MENU_KEYS`);
    }
  });

  test('no screen sits in two processes at once', async () => {
    // A leaf listed twice would appear twice in ALL_MENU_KEYS, and every count
    // and every "select all" built from it would then be quietly wrong.
    const keys = menu.ALL_MENU_KEYS;
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    assert.deepEqual(duplicates, []);
  });

  test('every process child belongs to some module', async () => {
    // A child no module claims is unreachable: menusForModules would never
    // return it, so the parent would render with a hole in it.
    for (const process of menu.PROCESSES) {
      for (const child of process.children) {
        assert.ok(
          modules.MODULE_BY_MENU[child.key],
          `${child.key} is in the menu but no module puts it there`,
        );
      }
    }
  });
});

describe('a process is visible exactly when one of its documents is', () => {
  const adminRole = { name: 'Admin' };

  test('an admin with everything on sees every process', async () => {
    const navigation = menu.navigationFor(adminRole, allModuleKeys());
    const parents = navigation.flatMap((g) => g.items).filter((i) => i.children);
    assert.equal(parents.length, menu.PROCESSES.length);
  });

  test('a role with none of the documents does not see the parent', async () => {
    const role = { name: 'Cashier', permissions: { menus: ['dashboard', 'profile'] } };
    const navigation = menu.navigationFor(role, allModuleKeys());
    const parents = navigation.flatMap((g) => g.items).filter((i) => i.children);
    assert.deepEqual(parents, []);
  });

  test('a role with one document sees the parent, holding only that one', async () => {
    const role = { name: 'Limited', permissions: { menus: ['dashboard', 'profile', 'invoices'] } };
    const navigation = menu.navigationFor(role, allModuleKeys());
    const parent = navigation.flatMap((g) => g.items).find((i) => i.key === 'orderToCash');

    assert.ok(parent, 'the flow is visible because one of its documents is');
    assert.deepEqual(parent.children.map((c) => c.key), ['invoices'],
      'and it holds only what the role can actually open');
  });

  test('switching a module off empties the parent rather than orphaning it', async () => {
    // Store issue and material return are one module. With it off, the flow has
    // no documents left, so the parent must go too rather than sit there
    // pointing at nothing.
    const without = allModuleKeys().filter((key) => key !== 'stockIssues');
    const navigation = menu.navigationFor({ name: 'Admin' }, without);
    const parent = navigation.flatMap((g) => g.items).find((i) => i.key === 'issueToReturn');
    assert.equal(parent, undefined);
  });

  test('the rights screen sees the same tree the sidebar does', async () => {
    const catalogue = menu.catalogueForModules(allModuleKeys());
    const parents = catalogue.flatMap((g) => g.items).filter((i) => i.children);
    assert.equal(parents.length, menu.PROCESSES.length);
    for (const parent of parents) {
      assert.equal(parent.children.length > 0, true, `${parent.key} rendered with no children`);
    }
  });
});

describe('the overview behind a process', () => {
  test('an unknown process is a 404, not an empty page', async () => {
    const { status } = await run(processController.getProcess, { params: { key: 'not-a-process' } });
    assert.equal(status, 404);
  });

  test('a user who can open none of the documents is refused', async () => {
    const { status } = await run(processController.getProcess, {
      params: { key: 'order-to-cash' },
      user: { menus: ['dashboard', 'profile'] },
    });
    assert.equal(status, 403);
  });

  test('the slug in the URL resolves to the process', async () => {
    const { status, body } = await run(processController.getProcess, {
      params: { key: 'order-to-cash' },
    });
    assert.equal(status, 200);
    assert.equal(body.key, 'orderToCash');
    assert.equal(body.stages.length > 0, true);
    assert.equal(body.documents.some((d) => d.key === 'invoices'), true);
  });

  test('stages the user cannot open are reported but not linked', async () => {
    // The flow is still the flow — hiding the stage would leave a chain with a
    // gap in it and no explanation. The link is what is withheld.
    const { body } = await run(processController.getProcess, {
      params: { key: 'order-to-cash' },
      user: { menus: ['dashboard', 'profile', 'invoices'] },
    });

    const invoiceStage = body.stages.find((s) => s.path === '/invoices');
    const orderStage = body.stages.find((s) => s.path === '/sales-orders');

    assert.equal(invoiceStage.linked, true);
    assert.equal(orderStage.linked, false, 'reported, but not a door');
    assert.deepEqual(body.documents.map((d) => d.key), ['invoices']);
  });
});

describe('the counts are of work waiting', () => {
  test('a dispatched, unbilled order shows up in exactly that stage', async () => {
    const before = await run(processController.getProcess, { params: { key: 'order-to-cash' } });
    const was = before.body.stages.find((s) => s.key === 'unbilled').count;

    await dispatchedOrder(5);

    const after = await run(processController.getProcess, { params: { key: 'order-to-cash' } });
    assert.equal(
      after.body.stages.find((s) => s.key === 'unbilled').count, was + 1,
      'the goods have gone and nobody has raised an invoice',
    );
  });

  test('billing the order clears it from that stage', async () => {
    const order = await dispatchedOrder(5);
    const before = await run(processController.getProcess, { params: { key: 'order-to-cash' } });
    const was = before.body.stages.find((s) => s.key === 'unbilled').count;

    await run(invoices.invoiceFromSalesOrder, { params: { id: order.id } });

    const after = await run(processController.getProcess, { params: { key: 'order-to-cash' } });
    assert.equal(after.body.stages.find((s) => s.key === 'unbilled').count, was - 1);
  });

  test('cancelling the bill puts the order back on the stage', async () => {
    // A cancelled invoice releases the order to be billed again, so the stage
    // has to agree — otherwise the work becomes invisible at the exact moment
    // somebody needs reminding to redo it.
    const order = await dispatchedOrder(5);
    const { body: invoice } = await run(invoices.invoiceFromSalesOrder, { params: { id: order.id } });

    const billed = await run(processController.getProcess, { params: { key: 'order-to-cash' } });
    const was = billed.body.stages.find((s) => s.key === 'unbilled').count;

    await run(invoices.removeInvoice, { params: { id: invoice.id } });

    const after = await run(processController.getProcess, { params: { key: 'order-to-cash' } });
    assert.equal(after.body.stages.find((s) => s.key === 'unbilled').count, was + 1);
  });

  test('every process in the menu reports a whole chain of stages', async () => {
    // Derived from the catalogue rather than listed here, so adding a process
    // parent without a builder behind it fails instead of rendering an empty
    // page. That is the whole failure mode of a menu and a service that have
    // to be kept in step by hand.
    const slugs = Object.keys(menu.PROCESS_BY_SLUG);
    assert.equal(slugs.length, menu.PROCESSES.length);

    for (const slug of slugs) {
      const { status, body } = await run(processController.getProcess, { params: { key: slug } });
      assert.equal(status, 200, `${slug} failed to build`);
      assert.equal(body.stages.length >= 3, true, `${slug} has too few stages to be a chain`);

      for (const stage of body.stages) {
        assert.equal(typeof stage.count, 'number', `${slug}/${stage.key} did not produce a number`);
        assert.equal(Number.isNaN(stage.count), false, `${slug}/${stage.key} counted NaN`);
        assert.ok(stage.label && stage.path, `${slug}/${stage.key} is missing its label or link`);
        // A stage pointing at a path no menu entry owns can never be a link,
        // however many rights the reader holds.
        assert.ok(
          menu.KEY_BY_PATH[stage.path],
          `${slug}/${stage.key} points at ${stage.path}, which is not a screen`,
        );
      }
    }
  });

  test('a stage may link out to another flow', async () => {
    // Goods in transit belong to Pick to Ship but live on the transfers screen,
    // which is outside it. If `linked` were decided from the process's own
    // children that stage would read as locked for everybody.
    const { body } = await run(processController.getProcess, { params: { key: 'pick-to-ship' } });
    const transit = body.stages.find((s) => s.path === '/stock-transfers');

    assert.ok(transit, 'the stage is on the chain');
    assert.equal(transit.linked, true, 'and openable by somebody who holds that screen');
    assert.equal(
      body.documents.some((d) => d.path === '/stock-transfers'), false,
      'even though it is not one of this process’s own documents',
    );
  });
});
