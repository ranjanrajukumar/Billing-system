import { Router } from 'express';
import * as controller from './expense.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { requireModule } from '../platform/config.service.js';

const router = Router();
router.use(requireModule('expenses'));

const APPROVERS = ['Admin', 'Accountant', 'Branch Manager'];

import { validate } from '../../middleware/validate.js';
import { expenseRules } from './expense.validator.js';

router.get('/', controller.list);
router.get('/summary', controller.summary);
router.get('/:id', controller.getOne);
router.post('/', expenseRules, validate, controller.create);
router.put('/:id', expenseRules, validate, controller.update);
router.post('/:id/approve', authorize(...APPROVERS), controller.approve);
router.post('/:id/reject', authorize(...APPROVERS), controller.reject);
// Paying moves cash or bank, so it stays with the people who hold them.
router.post('/:id/pay', authorize('Admin', 'Accountant', 'Branch Manager', 'Cashier'), controller.pay);
router.post('/:id/cancel', authorize(...APPROVERS), controller.cancel);

export default router;
