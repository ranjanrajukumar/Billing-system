import { Router } from 'express';
import { body } from 'express-validator';
import {
  adjustPoints, customerPoints, loyaltyMembers, loyaltySettings,
} from './loyalty.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validate.js';

const router = Router();
router.get('/settings', loyaltySettings);
router.get('/members', loyaltyMembers);
router.get('/customer/:customerId', customerPoints);
router.post('/adjust', authorize('Admin', 'Accountant'), [
  body('customerId').isInt(),
  body('points').isInt(),
], validate, adjustPoints);

export default router;
