/**
 * The extension points platform offers and the domains fill in.
 *
 * Four imports used to run the wrong way — platform reaching up into inventory,
 * sales and accounting. Turning them around removed the dependency, and
 * replaced a direct function call with a registration that has to happen at
 * start-up. That trade has one failure mode, and it is a bad one: a hook that
 * is never loaded does not throw, it just quietly contributes nothing, and the
 * feature looks like it was switched off on purpose.
 *
 * So this checks the mechanism *and* that the real hooks actually arrive. A
 * green suite that never loaded them would be proving nothing.
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
import test, { before, after, describe } from 'node:test';

const models = await import('../src/models/index.js');
const ext = await import('../src/modules/platform/extensions.service.js');
const stock = await import('../src/modules/inventory/stock.service.js');

const { sequelize, Branch, Company, Product, StockOwner, User } = models;

const USER = { id: 1, name: 'Operator' };
let branch;

function run(handler, { params = {}, body = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      status(code) { status = code; return res; },
      json(payload) { resolve({ status, body: payload }); return res; },
    };
    handler({
      params, body, query, branchId: branch.id,
      user: { id: USER.id, name: USER.name, role: 'Admin', menus: [] },
    }, res, reject);
  });
}

before(async () => {
  await sequelize.sync({ force: true });
  await StockOwner.create({ id: 1, ownerName: 'House', ownerCode: 'HOUSE', isHouse: true });
  await Company.create({ name: 'Ext Co', state: 'Maharashtra', businessMode: 'Advanced' });
  await User.create({
    id: USER.id, name: USER.name, email: 'ext@example.test', passwordHash: 'not-a-real-hash',
  });
  branch = await Branch.create({ branchName: 'Main', branchCode: 'MAIN', locationType: 'Branch' });
});

after(async () => {
  await sequelize.close();
});

describe('the mechanism', () => {
  test('every listener is asked, and all the answers come back', async () => {
    ext.reset();
    ext.on('t', () => 'a');
    ext.on('t', () => 'b');
    assert.deepEqual((await ext.emit('t')).sort(), ['a', 'b']);
  });

  test('a listener that returns nothing contributes nothing', async () => {
    ext.reset();
    ext.on('t', () => undefined);
    ext.on('t', () => 'kept');
    assert.deepEqual(await ext.emit('t'), ['kept']);
  });

  test('one contributor throwing does not lose the others', async () => {
    // The bell showing five alerts instead of six is a worse day. The bell
    // showing an error because one query failed is a broken feature.
    ext.reset();
    ext.on('t', () => { throw new Error('boom'); });
    ext.on('t', () => 'survived');
    assert.deepEqual(await ext.emit('t'), ['survived']);
  });

  test('arguments reach the listeners', async () => {
    ext.reset();
    ext.on('t', ({ branchId }) => branchId);
    assert.deepEqual(await ext.emit('t', { branchId: 7 }), [7]);
  });

  test('unsubscribing actually unsubscribes', async () => {
    ext.reset();
    const off = ext.on('t', () => 'x');
    off();
    assert.deepEqual(await ext.emit('t'), []);
  });

  test('a provider is a single answer, and absent until registered', async () => {
    ext.reset();
    assert.equal(ext.resolve('p'), null);
    ext.provide('p', { render: () => 'html' });
    assert.equal(ext.resolve('p').render(), 'html');
  });

  test('emitting a point nobody listens to is not an error', async () => {
    ext.reset();
    assert.deepEqual(await ext.emit('nobody-home'), []);
  });
});

describe('the real hooks arrive', () => {
  before(async () => {
    // Exactly what app.js does. Registration is a side effect of the import,
    // so this line is the thing under test as much as anything below it.
    ext.reset();
    await import('../src/modules/hooks.js');
  });

  test('every point a domain is meant to fill is filled', async () => {
    // Named against POINTS rather than raw strings: a typo in a contributor
    // would otherwise register a listener nobody ever calls, which looks
    // exactly like the feature being switched off.
    assert.equal((await ext.emit(ext.POINTS.BRANCH_SUMMARY, [])).length, 1, 'branch summary');
    assert.ok(ext.resolve(ext.POINTS.DOCUMENT_HTML), 'document renderer');
    assert.ok(ext.resolve(ext.POINTS.DOCUMENT_HTML).renderInvoiceHtml, 'renderer is complete');
  });

  test('inventory puts a stock total on the branch list', async () => {
    const widget = await Product.create({
      productName: `Widget ${Date.now()}`, primaryUnit: 'PCS', purchasePrice: 5, sellingPrice: 9,
    });
    await stock.setBranchStock({
      productId: widget.id, branchId: branch.id, quantity: 42, transaction: null, userId: USER.id,
    });

    const branches = await import('../src/modules/platform/branch.controller.js');
    const { body } = await run(branches.listBranches);
    const row = body.data.find((b) => b.id === branch.id);

    assert.ok(row, 'the branch is listed');
    assert.equal(Number(row.totalStock), 42, 'contributed by inventory, not read by platform');
  });

  test('inventory contributes the stock-drift alert', async () => {
    const alerts = await ext.emit(ext.POINTS.ALERTS, { branchId: branch.id });
    const drift = alerts.find((a) => a?.key === 'stock-drift');

    assert.ok(drift, 'the alert is offered');
    // Offered whatever the count — the bell decides whether an empty one is
    // worth showing, because that gating is platform's job and stays there.
    assert.equal(typeof drift.count, 'number');
    assert.equal(drift.link, '/stock-audit', 'an alert without a destination is just anxiety');
  });

  test('accounting reacts to the mode change rather than being called', async () => {
    const { ChartOfAccount } = models;
    await ChartOfAccount.destroy({ where: {}, force: true });

    await ext.emit(ext.POINTS.MODE_CHANGED, { mode: 'Advanced' });
    assert.ok(await ChartOfAccount.count() > 0, 'the chart was seeded by the listener');
  });

  test('switching back to Basic seeds nothing', async () => {
    const { ChartOfAccount } = models;
    await ChartOfAccount.destroy({ where: {}, force: true });

    await ext.emit(ext.POINTS.MODE_CHANGED, { mode: 'Basic' });
    assert.equal(await ChartOfAccount.count(), 0, 'a Basic shop never grows a chart it has no use for');
  });
});

describe('platform stands on nothing', () => {
  test('no file in platform imports a domain', async () => {
    // The rule the whole exercise was about, asserted rather than trusted:
    // platform is the floor, and a floor that depends on the building cannot
    // be reasoned about or switched off independently.
    const fs = await import('node:fs');
    const dir = 'C:/Delta/Billing-system/billing-system/server/src/modules';
    const domains = fs.readdirSync(dir)
      .filter((d) => fs.statSync(`${dir}/${d}`).isDirectory() && d !== 'platform');

    const offenders = [];
    for (const file of fs.readdirSync(`${dir}/platform`)) {
      if (!file.endsWith('.js')) continue;
      const code = fs.readFileSync(`${dir}/platform/${file}`, 'utf8');
      for (const match of code.matchAll(/from\s+['"]\.\.\/([a-z]+)\//g)) {
        if (domains.includes(match[1])) offenders.push(`platform/${file} -> ${match[1]}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});
