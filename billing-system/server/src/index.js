import dotenv from 'dotenv';
import app from './app.js';
import { sequelize } from './models/index.js';
import { migrateDatabase } from './config/migration.js';
import { assertEnvironment } from './config/env.js';
import { startScheduler } from './jobs/scheduler.js';
import { initBackupSchedule } from './modules/platform/backupScheduler.js';
import { startBillingCron } from './modules/platform/billing.cron.js';

dotenv.config();

const port = process.env.PORT || 5000;
const maxPortAttempts = Number(process.env.PORT_RETRY_ATTEMPTS || 10);
// How long a shutdown waits for requests in flight before giving up on them.
const shutdownGraceMs = Number(process.env.SHUTDOWN_GRACE_MS || 10_000);

let httpServer = null;
let shuttingDown = false;

/**
 * Stops accepting new connections, lets requests already running finish, then
 * closes the database pool.
 *
 * A billing write is rarely a single statement — an invoice moves stock, posts
 * a ledger entry and bumps a counter. A process killed mid-transaction on
 * deploy or restart leaves the database to roll it back on connection loss,
 * which usually works and occasionally does not. Draining first makes the
 * ordinary case ordinary.
 */
async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Shutting down (${reason})...`);

  const forced = setTimeout(() => {
    console.error(`Shutdown took longer than ${shutdownGraceMs}ms. Exiting anyway.`);
    process.exit(exitCode || 1);
  }, shutdownGraceMs);
  // Never let the timer itself hold the process open once everything is closed.
  forced.unref();

  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      console.log('HTTP server closed.');
    }
    await sequelize.close();
    console.log('Database connections closed.');
  } catch (error) {
    console.error('Error during shutdown:', error.message);
    exitCode = exitCode || 1;
  }

  clearTimeout(forced);
  process.exit(exitCode);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal));
}

// An unhandled rejection means a promise failed with nobody to catch it. Node
// terminates the process for these by default, and doing so silently is worse
// than saying why first.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  shutdown('unhandled rejection', 1);
});

// After an uncaught exception the process is in an unknown state, so it is
// drained and replaced rather than kept limping along.
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaught exception', 1);
});

function listen(portToUse, attemptsLeft = maxPortAttempts) {
  const server = app.listen(portToUse, () => {
    const mode = app.locals.database?.status === 'connected' ? 'database connected' : 'database unavailable';
    console.log(`Billing API running on port ${portToUse} (${mode})`);
  });
  httpServer = server;

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
  // Before anything opens a socket or a connection pool: a process that cannot
  // sign a token has nothing useful to offer.
  assertEnvironment();

  try {
    if (process.env.AUTO_MIGRATE !== 'false') {
      await migrateDatabase();
      startScheduler();
    } else {
      await sequelize.authenticate();
    }

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
