import express from 'express';
import * as controller from './srv.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validate.js';
import { body } from 'express-validator';

const router = express.Router();

const srvRules = [
  body('srvDate').isISO8601().toDate(),
  body('supplierId').optional({ nullable: true }).isInt(),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').isInt().withMessage('Valid product ID required'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Quantity must be greater than 0'),
];

const PURCHASERS = ['Admin', 'Manager', 'Staff'];

router.get('/', authorize(...PURCHASERS), controller.listSrvs);
router.get('/:id', authorize(...PURCHASERS), controller.getSrv);
router.post('/', authorize(...PURCHASERS), srvRules, validate, controller.createSrv);
router.put('/:id', authorize(...PURCHASERS), srvRules, validate, controller.updateSrv);
router.post('/:id/confirm', authorize(...PURCHASERS), controller.confirmSrv);
router.delete('/:id', authorize(...PURCHASERS), controller.removeSrv);

export default router;
