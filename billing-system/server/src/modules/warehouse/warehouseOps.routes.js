import { Router } from 'express';
import * as controller from './warehouseOps.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { requireModule } from '../platform/config.service.js';

/**
 * Floor operations: put-away, picking and packing.
 *
 * Gated on the warehouses module, since bins are what these act on. A business
 * without bins never reaches these routes and loses nothing — receiving,
 * transfers, counting and valuation all work at location level regardless.
 */
const router = Router();
router.use(requireModule('warehouses'));

const FLOOR = ['Admin', 'Accountant', 'Warehouse Manager', 'Branch Manager', 'Inventory Staff'];

// ---- The floor at a glance ----
router.get('/', controller.overview);
router.get('/occupancy', controller.occupancy);
router.get('/replenishment', controller.replenishment);

// ---- Put-away rules: where each kind of product should be stored ----
router.get('/rules', controller.listRules);
router.get('/where-to-put/:productId', controller.whereToPut);
router.post('/rules', authorize('Admin', 'Accountant', 'Warehouse Manager'), controller.createRule);
router.put('/rules/:ruleId', authorize('Admin', 'Accountant', 'Warehouse Manager'), controller.updateRule);
router.delete('/rules/:ruleId', authorize('Admin', 'Warehouse Manager'), controller.removeRule);

// ---- Put-away ----
router.get('/put-away/queue', controller.queue);
router.get('/put-away/grn/:grnId', controller.putAwayForGrn);
router.post('/put-away', authorize(...FLOOR), controller.putAwayStock);

// ---- Picking ----
router.get('/transfers/:id/pick-list', controller.pickList);
router.post('/transfers/:id/pick', authorize(...FLOOR), controller.confirmPick);

// ---- Packing ----
router.get('/transfers/:id/packages', controller.packages);
router.post('/transfers/:id/packages', authorize(...FLOOR), controller.packCarton);
router.post('/packages/:packageId/cancel', authorize(...FLOOR), controller.cancelPackage);

// ---- Bins ----
router.get('/bins/:binId/contents', controller.contents);
router.get('/locate/:productId', controller.locate);
router.get('/reconcile', controller.reconcile);
router.post('/move', authorize(...FLOOR), controller.move);

export default router;
