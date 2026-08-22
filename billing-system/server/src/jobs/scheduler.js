import { catchUp } from '../modules/warehouse/storageSnapshot.service.js';
import { sweep } from '../modules/platform/idempotency.service.js';
import { dispatchDue } from '../modules/platform/webhook.service.js';

/**
 * The background jobs this application runs on its own.
 *
 * Deliberately in-process and dependency-free rather than cron or a queue.
 * A single-tenant warehouse system running one server does not need a broker,
 * and adding one would mean the daily storage capture silently stops working
 * the moment somebody deploys without it — which is the failure that costs
 * real money here, since an uncaptured day cannot be recovered later.
 *
 * The design assumption that makes this safe: **every job must be idempotent.**
 * They are re-run on every boot and re-checked hourly, so a job that is not safe
 * to run twice would corrupt data rather than merely waste time. The storage
 * capture earns this through the unique key on its grain.
 *
 * If this ever runs on more than one server, two instances will fire the same
 * job at the same time. That is survivable for exactly the same reason — one
 * wins the unique constraint and the other counts duplicates — but it is worth
 * knowing rather than discovering.
 */

/** How often to check whether the day's work is due. */
const TICK_MS = 60 * 60 * 1000;

/** Wait after boot before the first run, so start-up is not competing with it. */
const BOOT_DELAY_MS = 30 * 1000;

const timers = [];
let running = false;

/**
 * Runs a job, never letting it take the process down.
 *
 * A background job that throws on an unhandled promise would kill the server on
 * modern Node. The warehouse losing its API because a snapshot failed is far
 * worse than the snapshot failing, and the missed day can be backfilled.
 */
async function safely(name, work) {
  try {
    const started = Date.now();
    const result = await work();
    console.log(`Job "${name}" finished in ${Date.now() - started}ms`);
    return result;
  } catch (error) {
    console.error(`Job "${name}" failed: ${error.message}`);
    if (error.stack) console.error(error.stack);
    return null;
  }
}

/**
 * One pass over everything that might be due.
 *
 * Both jobs decide for themselves whether there is anything to do — the tick
 * only asks. That keeps the schedule out of the jobs and means a server that
 * was off for three days catches up on the next tick rather than needing to be
 * told what it missed.
 */
async function tick() {
  if (running) {
    // An overrunning job must not have a second copy started on top of it.
    console.warn('Scheduler tick skipped — the previous run has not finished yet.');
    return;
  }
  running = true;
  try {
    await safely('storage snapshot', () => catchUp());
    await safely('idempotency sweep', () => sweep());
    // Retries anything a receiver was not reachable for, and picks up rows a
    // server that died mid-send left PENDING. Bounded per tick so a large
    // backlog cannot hold the scheduler open past the next one.
    await safely('webhook dispatch', () => dispatchDue({ limit: 100 }));
  } finally {
    running = false;
  }
}

/** Starts the background jobs. Safe to call once, at boot. */
export function startScheduler() {
  if (process.env.DISABLE_JOBS === 'true') {
    console.log('Background jobs disabled by DISABLE_JOBS.');
    return;
  }

  timers.push(setTimeout(() => {
    tick();
    timers.push(setInterval(tick, TICK_MS));
  }, BOOT_DELAY_MS));

  console.log('Background jobs scheduled: daily storage snapshot, idempotency sweep, webhook dispatch.');
}

/** Stops them. Used by tests, and by a clean shutdown. */
function stopScheduler() {
  for (const timer of timers) {
    clearTimeout(timer);
    clearInterval(timer);
  }
  timers.length = 0;
}

/** Runs a tick immediately. Exposed so the job can be triggered by hand. */
async function runJobsNow() {
  await tick();
}
