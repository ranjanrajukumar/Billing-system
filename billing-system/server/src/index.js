import dotenv from 'dotenv';
import app from './app.js';
import { sequelize } from './models/index.js';
import { migrateDatabase } from './config/migration.js';
import { startScheduler } from './jobs/scheduler.js';
import { initBackupSchedule } from './services/backupScheduler.js';
import { startBillingCron } from './services/billing.cron.js';

dotenv.config();

const port = process.env.PORT || 5000;
const maxPortAttempts = Number(process.env.PORT_RETRY_ATTEMPTS || 10);

function listen(portToUse, attemptsLeft = maxPortAttempts) {
  const server = app.listen(portToUse, () => {
    const mode = app.locals.database?.status === 'connected' ? 'database connected' : 'database unavailable';
    console.log(`Billing API running on port ${portToUse} (${mode})`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`Port ${portToUse} is in use. Retrying in 1 second...`);
      setTimeout(() => listen(portToUse, attemptsLeft - 1), 1000);
      return;
    }

    console.error('Unable to start HTTP server:', error);
    process.exit(1);
  });
}

async function start() {
  let databaseReady = false;

  try {
    if (process.env.AUTO_MIGRATE !== 'false') {
      await migrateDatabase();
      startScheduler();
    } else {
      await sequelize.authenticate();
    }

    databaseReady = true;
    app.locals.database = { status: 'connected' };

    // Only worth arming once there is a database to back up.
    const schedule = await initBackupSchedule();
    if (schedule.enabled) console.log(`Nightly backup armed for ${schedule.nextRun}`);
    
    startBillingCron();
  } catch (error) {
    if (process.env.START_WITHOUT_DB === 'false') {
      console.error('Unable to start server:', error);
      process.exit(1);
    }

    app.locals.database = {
      status: 'unavailable',
      message: error.message
    };
    console.warn('Database unavailable. Starting API in limited mode.');
    console.warn(error.message);
  }

  listen(port);
}

start();
// trigger nodemon
