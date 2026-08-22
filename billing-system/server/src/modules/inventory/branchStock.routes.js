import { Router } from 'express';
import { body } from 'express-validator';
import { productStock, transfer } from './branchStock.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validate.js';

/**
 * The stock endpoints addressed under `/branches`.
 *
 * Mounted at the same prefix as the branch router and ahead of it, so
 * `/branches/stock/:productId` and `/branches/transfer` keep working exactly as
 * they did while belonging to the module that owns what they do.
 */
const router = Router();

router.get('/stock/:productId', productStock);
router.post('/transfer', authorize('Admin', 'Accountant'), [
  body('productId').isInt(),
  body('fromBranchId').isInt(),
  body('toBranchId').isInt(),
  body('quantity').isFloat({ gt: 0 }),
], validate, transfer);

export default router;
