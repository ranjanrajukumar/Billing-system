import { Router } from 'express';
import * as controller from './purchaseReturn.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { requireModule } from '../platform/config.service.js';

const router = Router();
router.use(requireModule('purchaseReturns'));

const BUYERS = ['Admin', 'Accountant', 'Purchase Manager', 'Warehouse Manager'];

import { validate } from '../../middleware/validate.js';
import { purchaseReturnRules } from './purchase.validator.js';

router.get('/', controller.list);
router.get('/returnable/:purchaseId', controller.returnableItems);
router.get('/:id', controller.getOne);
router.post('/', authorize(...BUYERS), purchaseReturnRules, validate, controller.create);
router.post('/:id/confirm', authorize(...BUYERS), controller.confirm);
router.post('/:id/cancel', authorize('Admin', 'Accountant'), controller.cancel);

export default router;
