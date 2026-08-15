import { Router } from 'express';
import * as controller from '../controllers/warehouseFoundation.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { idempotent } from '../middleware/idempotencyMiddleware.js';
import { requireModule } from '../services/config.service.js';

const router = Router();

const FLOOR = ['Admin', 'Accountant', 'Warehouse Manager', 'Inventory Staff'];
const MANAGERS = ['Admin', 'Accountant', 'Warehouse Manager'];

/**
 * The foundation layer's API.
 *
 * Everything here belongs to the warehouses module — a shop with no godown has
 * no bins to sequence, no floor to raise exceptions on and no client storage to
 * charge for.
 *
 * The routes a handheld posts to carry `idempotent(...)`, which is what makes a
 * retry after a dropped connection safe. It is applied at the route rather than
 * inside each handler so the guarantee cannot be lost by a handler forgetting.
 */
router.use(requireModule('warehouses'));

// ---- 1. Bin coordinates and pick sequence ----
router.get('/layout/walk-order', controller.walkOrder);
router.get('/layout/route-health', controller.routeHealth);
router.get('/layout/bins/:binId/path', controller.binPath);
router.post('/layout/generate-route', authorize(...MANAGERS), controller.generateRoute);
router.put('/layout/sequences', authorize(...MANAGERS), controller.setSequences);
router.put('/layout/bins/:binId', authorize(...MANAGERS), controller.updateBinLayout);

// ---- 3. Exception queue ----
router.get('/exceptions/vocabulary', controller.exceptionVocabulary);
router.get('/exceptions/summary', controller.exceptionSummary);
router.get('/exceptions', controller.listExceptions);
router.get('/exceptions/:id', controller.getException);
// Raised from a handheld the moment a discrepancy is found, so it is one of the
// operations a flaky connection can duplicate.
router.post('/exceptions', authorize(...FLOOR), idempotent('EXCEPTION_RAISE'), controller.createException);
router.put('/exceptions/:id/assign', authorize(...MANAGERS), controller.assignException);
router.put('/exceptions/:id/start', authorize(...FLOOR), controller.startException);
router.put('/exceptions/:id/resolve', authorize(...FLOOR), controller.resolveException);

// ---- 4. Warehouse tasks ----
router.get('/tasks/vocabulary', controller.taskVocabulary);
router.get('/tasks/summary', controller.taskSummary);
router.get('/tasks/mine', controller.myTasks);
router.get('/tasks/productivity', authorize(...MANAGERS), controller.taskProductivity);
router.get('/tasks', controller.listTasks);
router.get('/tasks/:id', controller.getTask);
router.post('/tasks', authorize(...MANAGERS), idempotent('TASK_CREATE'), controller.createTask);
router.put('/tasks/:id/assign', authorize(...MANAGERS), controller.assignTask);
router.put('/tasks/:id/start', authorize(...FLOOR), controller.startTask);
// The one that must never happen twice: a duplicate completion is a duplicate
// stock movement. Guarded twice over — the idempotency key stops the request
// repeating, and `completedAt IS NULL` stops the work repeating even if it does.
router.put('/tasks/:id/complete', authorize(...FLOOR), idempotent('TASK_COMPLETE'), controller.completeTask);
router.put('/tasks/:id/fail', authorize(...FLOOR), controller.failTask);
router.delete('/tasks/:id', authorize(...MANAGERS), controller.cancelTask);

// ---- 5. Storage snapshots ----
router.get('/storage/snapshots', authorize(...MANAGERS), controller.listSnapshots);
router.get('/storage/gaps', authorize(...MANAGERS), controller.snapshotGaps);
router.get('/storage/bill/:ownerId', authorize(...MANAGERS), controller.storageBill);
router.post('/storage/capture', authorize('Admin', 'Accountant'), controller.captureSnapshot);

export default router;
