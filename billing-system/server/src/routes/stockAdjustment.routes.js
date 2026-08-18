import { Router } from 'express';
import * as controller from '../controllers/stockAdjustment.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { requireModule } from '../services/config.service.js';

const router = Router();
router.use(requireModule('stockAdjustments'));

import { validate } from '../middleware/validate.js';
import { stockAdjustmentRules } from '../validators/inventory.validator.js';

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', stockAdjustmentRules, validate, controller.create);
// Applying an adjustment writes stock off; that is a manager's signature.
router.post('/:id/approve', authorize('Admin', 'Accountant', 'Warehouse Manager', 'Branch Manager'), controller.approve);
router.post('/:id/reject', authorize('Admin', 'Accountant', 'Warehouse Manager', 'Branch Manager'), controller.reject);

export default router;
