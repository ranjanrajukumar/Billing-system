import { Router } from 'express';
import * as controller from './deviceOps.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { idempotent } from '../../middleware/idempotencyMiddleware.js';
import { requireModule } from '../platform/config.service.js';

const router = Router();

const FLOOR = ['Admin', 'Accountant', 'Warehouse Manager', 'Inventory Staff'];
const MANAGERS = ['Admin', 'Accountant', 'Warehouse Manager'];

/**
 * The connected-hardware API: handhelds, sensor gateways and RFID readers.
 *
 * Every route a device *writes* through carries `idempotent(..., { required:
 * true })`. Required, not optional, and that is the difference between this
 * router and the rest of the application: a person who does not see a reply
 * clicks again and looks at the result, whereas a scanner that does not see a
 * reply retries by itself, immediately, and has no idea whether the first
 * attempt landed. Without a key on the request there is nothing to arbitrate
 * with, so the request is refused rather than risked.
 *
 * Reads are exempt — asking twice costs nothing.
 */
router.use(requireModule('devices'));

// ---- Device register ----
router.get('/devices/vocabulary', controller.deviceVocabulary);
router.get('/devices/health', controller.deviceHealth);
router.get('/devices', controller.listDevices);
router.get('/devices/:id', controller.getDevice);
router.post('/devices', authorize(...MANAGERS), controller.registerDevice);
router.put('/devices/:id', authorize(...MANAGERS), controller.updateDevice);
router.delete('/devices/:id', authorize(...MANAGERS), controller.retireDevice);

// Deliberately unauthorised beyond a valid session, and deliberately not
// idempotent: saying "I am alive" twice is saying it once.
router.post('/devices/heartbeat', controller.heartbeat);

// ---- Scanning ----
router.get('/scan/vocabulary', controller.scanVocabulary);
// GET, because resolving a code changes nothing and a handheld does it on
// every trigger pull — several times a minute, all shift.
router.get('/scan/resolve/:code', controller.resolveScan);

router.post('/scan/put-away', authorize(...FLOOR), idempotent('SCAN_PUTAWAY', { required: true }), controller.scanPutAway);
router.post('/scan/move', authorize(...FLOOR), idempotent('SCAN_MOVE', { required: true }), controller.scanMove);
router.post('/scan/pick', authorize(...FLOOR), idempotent('SCAN_PICK', { required: true }), controller.scanPick);
// A count writes no stock — it raises an exception when it disagrees. Still
// keyed, because a duplicate would raise a second exception for one discrepancy.
router.post('/scan/count', authorize(...FLOOR), idempotent('SCAN_COUNT', { required: true }), controller.scanCount);
router.put('/scan/tasks/:taskId/complete', authorize(...FLOOR), idempotent('SCAN_TASK_COMPLETE', { required: true }), controller.scanCompleteTask);

// The offline queue coming back. One key for the batch; each operation inside
// it succeeds or fails on its own and is reported separately.
router.post('/scan/sync', authorize(...FLOOR), idempotent('SCAN_SYNC', { required: true }), controller.syncScans);

// ---- Temperature and humidity ----
router.get('/sensors/status', controller.sensorStatus);
router.get('/sensors/readings', controller.readingHistory);
router.get('/sensors/thresholds', controller.listThresholds);
router.post('/sensors/thresholds', authorize(...MANAGERS), controller.saveThreshold);
router.put('/sensors/thresholds/:id', authorize(...MANAGERS), controller.saveThreshold);
router.delete('/sensors/thresholds/:id', authorize(...MANAGERS), controller.removeThreshold);

// Ingest. A gateway that buffered through an outage posts the batch to
// /readings and the whole batch is arbitrated by one key.
router.post('/sensors/readings', authorize(...FLOOR), idempotent('SENSOR_READING', { required: true }), controller.recordReading);
router.post('/sensors/readings/batch', authorize(...FLOOR), idempotent('SENSOR_READING_BATCH', { required: true }), controller.recordReadings);

// ---- RFID ----
router.get('/rfid/vocabulary', controller.rfidVocabulary);
router.get('/rfid/summary', controller.tagSummary);
router.get('/rfid/tags', controller.listTags);
router.post('/rfid/tags', authorize(...MANAGERS), idempotent('RFID_TAG_REGISTER', { required: true }), controller.registerTag);
router.post('/rfid/tags/batch', authorize(...MANAGERS), idempotent('RFID_TAG_REGISTER_BATCH', { required: true }), controller.registerTags);
router.delete('/rfid/tags/:id', authorize(...MANAGERS), controller.retireTag);

// A sweep. Records where tags were seen; never moves stock — see rfid.service.js.
router.post('/rfid/reads', authorize(...FLOOR), idempotent('RFID_READ', { required: true }), controller.recordTagRead);
router.post('/rfid/reconcile', authorize(...FLOOR), idempotent('RFID_RECONCILE', { required: true }), controller.reconcileBin);

export default router;
