import { createBackup, listBackups, pruneBackups } from './backup.service.js';

/**
 * Nightly backups on a plain timer.
 *
 * No cron package is installed, and adding one for a single daily job is not
 * worth the dependency. The timer is re-armed after each run against the wall
 * clock rather than repeating on a fixed interval, so it does not drift and
 * still fires at the right hour after a clock change.
 */

const DEFAULT_HOUR = Number(process.env.BACKUP_HOUR ?? 2); // 2am local
const KEEP = Number(process.env.BACKUP_KEEP ?? 14);

let timer = null;
let state = {
  enabled: false,
  hour: DEFAULT_HOUR,
  keep: KEEP,
  lastRun: null,
  lastResult: null,
  lastError: null,
  nextRun: null,
};

function nextOccurrence(hour) {
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next;
}

async function runOnce() {
  try {
    const result = await createBackup({ label: 'scheduled' });
    const pruned = await pruneBackups(state.keep);
    state.lastRun = new Date().toISOString();
    state.lastResult = { ...result, pruned: pruned.length };
    state.lastError = null;
    console.log(`[backup] wrote ${result.filename} (${result.rows} rows), pruned ${pruned.length}`);
  } catch (err) {
    // A failed backup must never take the server down with it.
    state.lastError = err.message;
    state.lastRun = new Date().toISOString();
    console.error('[backup] scheduled backup failed:', err.message);
  }
}

function arm() {
  clearTimeout(timer);
  const next = nextOccurrence(state.hour);
  state.nextRun = next.toISOString();
  timer = setTimeout(async () => {
    await runOnce();
    if (state.enabled) arm();
  }, next - new Date());
  // Do not hold the process open purely for a backup timer.
  timer.unref?.();
}

export function startBackupSchedule({ hour = DEFAULT_HOUR, keep = KEEP } = {}) {
  state = { ...state, enabled: true, hour, keep };
  arm();
  return getScheduleStatus();
}

export function stopBackupSchedule() {
  clearTimeout(timer);
  timer = null;
  state = { ...state, enabled: false, nextRun: null };
  return getScheduleStatus();
}

export function getScheduleStatus() {
  return { ...state };
}

/** Runs the nightly job right now, without disturbing the schedule. */
export async function runScheduledNow() {
  await runOnce();
  return getScheduleStatus();
}

/** Called at boot; off unless BACKUP_SCHEDULE is switched on. */
export async function initBackupSchedule() {
  if (String(process.env.BACKUP_SCHEDULE || '').toLowerCase() !== 'true') {
    return getScheduleStatus();
  }
  startBackupSchedule();
  // A first backup on a fresh install gives something to restore from
  // immediately rather than waiting until the small hours.
  const existing = await listBackups();
  if (!existing.length) await runOnce();
  return getScheduleStatus();
}
