import fs from 'node:fs';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  backupPath, createBackup, deleteBackup, listBackups, pruneBackups, restoreBackup,
} from './backup.service.js';
import {
  getScheduleStatus, runScheduledNow, startBackupSchedule, stopBackupSchedule,
} from './backupScheduler.js';

export const listBackupFiles = asyncHandler(async (_req, res) => {
  const backups = await listBackups();
  res.json({
    backups,
    schedule: getScheduleStatus(),
    totalSize: backups.reduce((sum, b) => sum + b.size, 0),
  });
});

export const makeBackup = asyncHandler(async (req, res) => {
  const result = await createBackup({
    label: String(req.body?.label || 'manual').replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'manual',
    userId: req.user?.id,
  });
  res.status(201).json(result);
});

export const downloadBackup = asyncHandler(async (req, res) => {
  const file = backupPath(req.params.filename);
  if (!fs.existsSync(file)) return res.status(404).json({ message: 'Backup not found' });

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
  fs.createReadStream(file).pipe(res);
});

export const removeBackup = asyncHandler(async (req, res) => {
  await deleteBackup(req.params.filename);
  res.status(204).send();
});

/**
 * Replaces the whole database with the contents of an archive.
 *
 * Nothing this destructive should be reachable by a stray click, so the caller
 * has to name the file it means to restore in the body as well as the URL.
 */
export const restore = asyncHandler(async (req, res) => {
  const { filename } = req.params;
  if (req.body?.confirm !== filename) {
    return res.status(400).json({
      message: 'To restore, send { "confirm": "<filename>" } matching the backup being restored.',
    });
  }
  const result = await restoreBackup(filename, { userId: req.user?.id });
  res.json({
    ...result,
    message: `Restored from ${filename}. The database as it was beforehand was saved to ${result.backedUpTo}.`,
  });
});

export const prune = asyncHandler(async (req, res) => {
  const keep = Math.max(Number(req.body?.keep) || 14, 1);
  const removed = await pruneBackups(keep);
  res.json({ keep, removed });
});

export const scheduleStatus = asyncHandler(async (_req, res) => {
  res.json(getScheduleStatus());
});

export const updateSchedule = asyncHandler(async (req, res) => {
  if (req.body?.enabled === false) return res.json(stopBackupSchedule());

  const hour = Math.min(Math.max(Number(req.body?.hour ?? 2), 0), 23);
  const keep = Math.max(Number(req.body?.keep) || 14, 1);
  res.json(startBackupSchedule({ hour, keep }));
});

export const runScheduleNow = asyncHandler(async (_req, res) => {
  res.json(await runScheduledNow());
});
