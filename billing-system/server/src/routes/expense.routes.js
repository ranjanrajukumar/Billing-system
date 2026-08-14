import { Router } from 'express';
import * as controller from '../controllers/expense.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { requireModule } from '../services/config.service.js';

const router = Router();
router.use(requireModule('expenses'));

const APPROVERS = ['Admin', 'Accountant', 'Branch Manager'];

router.get('/', controller.list);
router.get('/summary', controller.summary);
router.get('/:id', controller.getOne);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.post('/:id/approve', authorize(...APPROVERS), controller.approve);
router.post('/:id/reject', authorize(...APPROVERS), controller.reject);
// Paying moves cash or bank, so it stays with the people who hold them.
router.post('/:id/pay', authorize('Admin', 'Accountant', 'Branch Manager', 'Cashier'), controller.pay);
router.post('/:id/cancel', authorize(...APPROVERS), controller.cancel);

export default router;
