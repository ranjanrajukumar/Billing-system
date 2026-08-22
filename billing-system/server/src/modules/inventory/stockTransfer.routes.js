import { Router } from 'express';
import * as controller from './stockTransfer.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { requireModule } from '../platform/config.service.js';

// Every route is gated on the module, so a disabled feature is genuinely
// unreachable rather than merely hidden from the sidebar.
const router = Router();
router.use(requireModule('stockTransfers'));

import { validate } from '../../middleware/validate.js';
import { stockTransferRules } from './inventory.validator.js';

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', stockTransferRules, validate, controller.create);

// Approving, dispatching and receiving each move real stock or release it, so
// they are narrower than the right to request a transfer.
const MANAGERS = ['Admin', 'Accountant', 'Warehouse Manager', 'Branch Manager'];
router.post('/:id/approve', authorize(...MANAGERS), controller.approve);
router.post('/:id/reject', authorize(...MANAGERS), controller.reject);
router.post('/:id/pick', controller.pick);
router.post('/:id/dispatch', authorize(...MANAGERS, 'Inventory Staff'), controller.dispatch);
router.post('/:id/receive', authorize(...MANAGERS, 'Inventory Staff'), controller.receive);
router.post('/:id/cancel', authorize(...MANAGERS), controller.cancel);

export default router;
