import { Router } from 'express';
import { body } from 'express-validator';
import {
  createBranch, getBranch, listBranches, productStock, removeBranch, transfer, updateBranch,
} from '../controllers/branch.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const branchRules = [
  body('branchName').trim().isLength({ min: 2, max: 160 }),
  body('branchCode').trim().isLength({ min: 1, max: 20 }),
  body('gstNumber').optional({ checkFalsy: true }).trim(),
  body('isDefault').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
];

router.get('/', listBranches);
router.get('/stock/:productId', productStock);
router.get('/:id', getBranch);
router.post('/', authorize('Admin', 'Accountant'), branchRules, validate, createBranch);
router.put('/:id', authorize('Admin', 'Accountant'), updateBranch);
// Deleting a location stays with Admins.
router.delete('/:id', authorize('Admin'), removeBranch);
router.post('/transfer', authorize('Admin', 'Accountant'), [
  body('productId').isInt(),
  body('fromBranchId').isInt(),
  body('toBranchId').isInt(),
  body('quantity').isFloat({ gt: 0 }),
], validate, transfer);

export default router;
