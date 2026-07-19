import dotenv from 'dotenv';
import { sequelize } from './models/index.js';
import { migrateDatabase } from './config/migration.js';

dotenv.config();

migrateDatabase()
  .then(async () => {
    await sequelize.close();
    console.log(`Database "${process.env.DB_NAME || 'billing_system'}" synced successfully.`);
    console.log(`Default admin: ${process.env.ADMIN_EMAIL || 'admin@example.com'} / ${process.env.ADMIN_PASSWORD || 'Admin@123'}`);
  })
  .catch(async (error) => {
    console.error('Database sync failed:', error);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
