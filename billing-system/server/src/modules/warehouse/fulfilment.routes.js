import { Router } from 'express';
import * as controller from './fulfilment.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { idempotent } from '../../middleware/idempotencyMiddleware.js';
import { requireModule } from '../platform/config.service.js';

/**
 * Fulfilling sales orders from the warehouse.
 *
 * Gated on the sales-orders module rather than on warehouses: an order still
 * needs allocating, packing and dispatching at a shop with no bins at all —
 * the picking step simply has nothing to walk to.
 */
const router = Router();
router.use(requireModule('salesOrders'));

const FLOOR = ['Admin', 'Accountant', 'Warehouse Manager', 'Branch Manager', 'Inventory Staff'];

router.get('/queue', controller.queue);
router.get('/:id/pick-list', controller.pickList);
// Committing the route to somebody's task list. Idempotent, because a handheld
// releasing a pick over a flaky link would otherwise create the round twice.
router.post('/:id/release-picks', authorize(...FLOOR), idempotent('PICK_RELEASE'), controller.releasePickTasks);
router.get('/:id/packages', controller.packages);

router.post('/:id/allocate', authorize(...FLOOR), controller.allocate);
router.post('/:id/pick', authorize(...FLOOR), controller.confirmPick);
router.post('/:id/packages', authorize(...FLOOR), controller.packCarton);
router.post('/:id/dispatch', authorize(...FLOOR), controller.dispatch);
router.put('/:id/shipping', authorize(...FLOOR), controller.updateShipping);
router.post('/:id/cancel', authorize('Admin', 'Accountant', 'Warehouse Manager'), controller.cancelFulfilment);

export default router;
