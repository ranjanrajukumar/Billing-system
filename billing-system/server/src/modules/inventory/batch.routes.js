import { Router } from 'express';
import { body } from 'express-validator';
import {
  availableBatches, batchReconciliation, createBatch, expiryAlerts,
  getBatch, listBatches, removeBatch, updateBatch,
} from './batch.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validate.js';

const router = Router();

const batchRules = [
  body('productId').isInt({ min: 1 }),
  body('batchNumber').trim().isLength({ min: 1, max: 60 }),
  body('quantity').isInt({ min: 0 }),
  body('germinationPercent').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }),
  body('purity').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }),
  body('packingDate').optional({ checkFalsy: true }).isISO8601(),
  body('testDate').optional({ checkFalsy: true }).isISO8601(),
  body('expiryDate').optional({ checkFalsy: true }).isISO8601(),
  body('purchaseRate').optional({ checkFalsy: true }).isFloat({ min: 0 }),
];

router.get('/', listBatches);
router.get('/alerts', expiryAlerts);
router.get('/reconciliation', authorize('Admin', 'Accountant'), batchReconciliation);
// Anyone billing needs to see which lots they can sell from.
router.get('/available/:productId', availableBatches);
router.get('/:id', getBatch);
router.post('/', authorize('Admin', 'Accountant'), batchRules, validate, createBatch);
router.put('/:id', authorize('Admin', 'Accountant'), updateBatch);
router.delete('/:id', authorize('Admin'), removeBatch);

export default router;
