import { Router } from 'express';
import { createPurchase, getPurchase, listPurchases, removePurchase } from '../controllers/purchase.controller.js';
import { authorize, requirePermission } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { purchaseRules } from '../validators/purchase.validator.js';

const router = Router();

router.use(requirePermission('purchases'));
router.get('/', listPurchases);
router.get('/:id', getPurchase);
router.post('/', authorize('Admin', 'Accountant'), purchaseRules, validate, createPurchase);
router.delete('/:id', authorize('Admin'), removePurchase);

export default router;
