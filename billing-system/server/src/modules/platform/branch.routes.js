import { Router } from 'express';
import { body } from 'express-validator';
import {
  createBranch, getBranch, listBranches, myLocations, removeBranch, updateBranch,
} from './branch.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validate.js';

const router = Router();
const branchRules = [
  body('branchName').trim().isLength({ min: 2, max: 160 }),
  body('branchCode').trim().isLength({ min: 1, max: 20 }),
  body('gstNumber').optional({ checkFalsy: true }).trim(),
  body('isDefault').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
];

router.get('/', listBranches);
// Where the signed-in user may work — drives the location switcher.
router.get('/my-locations', myLocations);
// `/stock/:productId` and `/transfer` are inventory's, mounted at this prefix
// by the composition root — see modules/inventory/branchStock.routes.js.
router.get('/:id', getBranch);
router.post('/', authorize('Admin', 'Accountant'), branchRules, validate, createBranch);
router.put('/:id', authorize('Admin', 'Accountant'), updateBranch);
// Deleting a location stays with Admins.
router.delete('/:id', authorize('Admin'), removeBranch);

export default router;
