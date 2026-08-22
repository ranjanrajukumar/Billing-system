import { Router } from 'express';
import * as controller from './purchaseOrder.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { requireModule } from '../platform/config.service.js';

const router = Router();
router.use(requireModule('purchaseOrders'));

const BUYERS = ['Admin', 'Accountant', 'Purchase Manager'];

import { validate } from '../../middleware/validate.js';
import { purchaseOrderRules } from './purchase.validator.js';

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.get('/:id/pending-items', controller.pendingItems);
router.post('/', authorize(...BUYERS), purchaseOrderRules, validate, controller.create);
router.put('/:id', authorize(...BUYERS), purchaseOrderRules, validate, controller.update);
router.post('/:id/submit', authorize(...BUYERS), controller.submit);
router.post('/:id/approve', authorize('Admin', 'Accountant'), controller.approve);
router.post('/:id/reject', authorize('Admin', 'Accountant'), controller.reject);
router.post('/:id/cancel', authorize(...BUYERS), controller.cancel);
router.post('/:id/close', authorize(...BUYERS), controller.close);

export default router;
