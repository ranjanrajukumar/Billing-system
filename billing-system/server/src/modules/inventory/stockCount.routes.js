import { Router } from 'express';
import * as controller from './stockCount.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { requireModule } from '../platform/config.service.js';

const router = Router();
router.use(requireModule('stockAdjustments'));

import { validate } from '../../middleware/validate.js';
import { stockCountRules } from './inventory.validator.js';

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', stockCountRules, validate, controller.create);
router.put('/:id/counts', controller.saveCounts);
router.post('/:id/approve', authorize('Admin', 'Accountant', 'Warehouse Manager', 'Branch Manager'), controller.approve);
router.post('/:id/cancel', controller.cancel);

export default router;
