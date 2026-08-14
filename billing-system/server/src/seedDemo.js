import dotenv from 'dotenv';
import { sequelize } from './models/index.js';
import { hasTradingData, seedDemoShop } from './config/demoSeed.js';

dotenv.config();

/**
 * Loads the worked example — a seeds and agri-input shop.
 *
 *   npm run db:seed-demo              basic mode: catalogue, purchases, sales
 *   npm run db:seed-demo -- advanced  adds godown, PO/GRN, till and accounts
 *
 * It only ever creates. Nothing is deleted or overwritten, and it refuses to
 * run on a database that already has bills on it unless you say --force —
 * demo data mixed into real trading is very hard to unpick afterwards.
 */
const args = process.argv.slice(2);
const mode = args.find((a) => a === 'advanced' || a === 'basic') || 'basic';
const force = args.includes('--force');

async function main() {
  await sequelize.authenticate();

  const existing = await hasTradingData();
  if (existing.any && !force) {
    console.error('');
    console.error('  This database already has trading data:');
    console.error(`    ${existing.invoices} invoice(s), ${existing.purchases} purchase(s)`);
    console.error('');
    console.error('  Demo records mixed into real books are hard to separate later.');
    console.error('  If you are sure, re-run with --force:');
    console.error(`    npm run db:seed-demo -- ${mode} --force`);
    console.error('');
    process.exitCode = 1;
    return;
  }

  await seedDemoShop({ mode });
}

main()
  .then(async () => { await sequelize.close(); })
  .catch(async (error) => {
    console.error('Demo seeding failed:', error.message);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
