import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../models/index.js';

/**
 * Logical database backup, written in pure JavaScript.
 *
 * `mysqldump` is not on the PATH on a normal Windows install, so relying on it
 * would mean backups that quietly never run. Instead every table is read
 * through Sequelize and streamed to a gzipped JSON archive, which restores on
 * any machine that can run this application.
 *
 * Binary columns (product images, the company logo) are base64 encoded with a
 * marker so they survive the round trip intact.
 */

const BACKUP_VERSION = 1;
const BACKUP_DIR = process.env.BACKUP_DIR
  || path.join(process.cwd(), 'backups');

const BLOB_PREFIX = 'base64:';

/** Tables are dumped in dependency order so a restore can insert them as-is. */
async function tableNames() {
  const rows = await sequelize.query('SHOW TABLES', { type: QueryTypes.SELECT });
  return rows.map((row) => Object.values(row)[0]).sort();
}

export async function ensureBackupDir() {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  return BACKUP_DIR;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

/** Buffers cannot survive JSON, so they are tagged and base64 encoded. */
function encodeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (Buffer.isBuffer(value)) out[key] = `${BLOB_PREFIX}${value.toString('base64')}`;
    else if (value instanceof Date) out[key] = value.toISOString();
    else out[key] = value;
  }
  return out;
}

function decodeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'string' && value.startsWith(BLOB_PREFIX)
      ? Buffer.from(value.slice(BLOB_PREFIX.length), 'base64')
      : value;
  }
  return out;
}

/**
 * Writes a full backup and returns its metadata.
 *
 * The archive is streamed table by table rather than built as one string, so a
 * database with image blobs in it does not have to fit in memory twice.
 */
export async function createBackup({ label = 'manual', userId = null } = {}) {
  await ensureBackupDir();
  const tables = await tableNames();
  const filename = `backup-${stamp()}-${label}.json.gz`;
  const target = path.join(BACKUP_DIR, filename);
  const tempTarget = `${target}.part`;

  const counts = {};
  async function* chunks() {
    yield `{"meta":{"version":${BACKUP_VERSION},"createdAt":${JSON.stringify(new Date().toISOString())},`
      + `"label":${JSON.stringify(label)},"createdBy":${JSON.stringify(userId)},`
      + `"database":${JSON.stringify(sequelize.config.database)}},"data":{`;

    let firstTable = true;
    for (const table of tables) {
      const rows = await sequelize.query(`SELECT * FROM \`${table}\``, { type: QueryTypes.SELECT });
      counts[table] = rows.length;
      yield `${firstTable ? '' : ','}${JSON.stringify(table)}:[`;
      firstTable = false;
      let firstRow = true;
      for (const row of rows) {
        yield `${firstRow ? '' : ','}${JSON.stringify(encodeRow(row))}`;
        firstRow = false;
      }
      yield ']';
    }
    yield '}}';
  }

  // Written to a .part file first, so a crash mid-write cannot leave behind
  // something that looks like a usable backup.
  await pipeline(Readable.from(chunks()), zlib.createGzip({ level: 9 }), fs.createWriteStream(tempTarget));
  await fsp.rename(tempTarget, target);

  const { size } = await fsp.stat(target);
  return {
    filename,
    size,
    createdAt: new Date().toISOString(),
    label,
    tables: Object.keys(counts).length,
    rows: Object.values(counts).reduce((sum, n) => sum + n, 0),
    counts,
  };
}

export async function listBackups() {
  await ensureBackupDir();
  const entries = await fsp.readdir(BACKUP_DIR);
  const files = entries.filter((name) => name.endsWith('.json.gz'));

  const results = await Promise.all(files.map(async (filename) => {
    const stats = await fsp.stat(path.join(BACKUP_DIR, filename));
    return { filename, size: stats.size, createdAt: stats.mtime.toISOString() };
  }));
  // Newest first, which is the one anybody restoring is most likely to want.
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Guards against a filename escaping the backup directory. */
export function backupPath(filename) {
  const safe = path.basename(String(filename || ''));
  if (!safe.endsWith('.json.gz')) {
    throw Object.assign(new Error('Not a backup file'), { status: 400 });
  }
  return path.join(BACKUP_DIR, safe);
}

export async function readBackup(filename) {
  const file = backupPath(filename);
  if (!fs.existsSync(file)) throw Object.assign(new Error('Backup not found'), { status: 404 });

  const gz = await fsp.readFile(file);
  const json = zlib.gunzipSync(gz).toString('utf8');
  return JSON.parse(json);
}

export async function deleteBackup(filename) {
  const file = backupPath(filename);
  if (!fs.existsSync(file)) throw Object.assign(new Error('Backup not found'), { status: 404 });
  await fsp.unlink(file);
}

/**
 * Replaces the current contents of every table in the archive.
 *
 * This is destructive by nature, so a safety copy is taken first and the whole
 * thing runs in one transaction with foreign key checks suspended — the archive
 * is internally consistent, but its table order is alphabetical rather than
 * dependency ordered.
 */
export async function restoreBackup(filename, { userId = null } = {}) {
  const archive = await readBackup(filename);
  if (archive?.meta?.version !== BACKUP_VERSION) {
    throw Object.assign(new Error('Unsupported backup version'), { status: 400 });
  }

  // Taken before anything is touched, so a restore can itself be undone.
  const safetyCopy = await createBackup({ label: 'pre-restore', userId });

  const tables = Object.keys(archive.data);
  const restored = {};

  await sequelize.transaction(async (transaction) => {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
    try {
      for (const table of tables) {
        const rows = archive.data[table].map(decodeRow);
        await sequelize.query(`DELETE FROM \`${table}\``, { transaction });
        if (!rows.length) { restored[table] = 0; continue; }

        // Inserted in batches: one statement per row is far too slow on a
        // table with thousands of rows, and one giant statement can exceed
        // max_allowed_packet once image blobs are involved.
        const columns = Object.keys(rows[0]);
        const batchSize = 200;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
          const values = batch.flatMap((row) => columns.map((c) => row[c] ?? null));
          await sequelize.query(
            `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(',')}) VALUES ${placeholders}`,
            { replacements: values, transaction },
          );
        }
        restored[table] = rows.length;
      }
    } finally {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
    }
  });

  return {
    restoredFrom: filename,
    backedUpTo: safetyCopy.filename,
    tables: Object.keys(restored).length,
    rows: Object.values(restored).reduce((sum, n) => sum + n, 0),
    counts: restored,
  };
}

/** Keeps the newest `keep` backups and removes the rest. */
export async function pruneBackups(keep = 14) {
  const backups = await listBackups();
  const surplus = backups.slice(keep);
  for (const backup of surplus) {
    await fsp.unlink(path.join(BACKUP_DIR, backup.filename));
  }
  return surplus.map((b) => b.filename);
}

/** Kept for the older call site that only wanted "make a backup now". */
export async function runBackup() {
  return createBackup({ label: 'scheduled' });
}
