import { Router } from 'express';
import { body } from 'express-validator';
import { createPurchase, getPurchase, listPurchases, removePurchase } from '../controllers/purchase.controller.js';
import { authorize, requirePermission } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const purchaseRules = [
  body('purchaseDate').isISO8601().toDate(),
  body('supplierId').isInt(),
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isInt(),
  body('items.*.quantity').isFloat({ gt: 0 }),
  body('items.*.rate').isFloat({ min: 0 }),
  body('items.*.gstPercent').optional().isFloat({ min: 0, max: 100 }),
  body('paidAmount').optional().isFloat({ min: 0 }),
  body('status').optional().isIn(['Draft', 'Received'])
];

router.use(requirePermission('purchases'));
router.get('/', listPurchases);
router.get('/:id', getPurchase);
router.post('/', authorize('Admin', 'Accountant'), purchaseRules, validate, createPurchase);
router.delete('/:id', authorize('Admin'), removePurchase);

export default router;
