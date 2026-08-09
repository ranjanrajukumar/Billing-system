import { Router } from 'express';
import {
  downloadBackup, listBackupFiles, makeBackup, prune, removeBackup,
  restore, runScheduleNow, scheduleStatus, updateSchedule,
} from '../controllers/backup.controller.js';
import { authorize } from '../middleware/authMiddleware.js';

const router = Router();

// Backups contain every row in the database, including password hashes and
// customer records, so the whole area is Admin only.
router.use(authorize('Admin'));

router.get('/', listBackupFiles);
router.post('/', makeBackup);
router.get('/schedule', scheduleStatus);
router.put('/schedule', updateSchedule);
router.post('/schedule/run', runScheduleNow);
router.post('/prune', prune);
router.get('/:filename/download', downloadBackup);
router.post('/:filename/restore', restore);
router.delete('/:filename', removeBackup);

export default router;
