import { Router } from 'express';
import * as controller from '../controllers/grn.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { requireModule } from '../services/config.service.js';

const router = Router();
router.use(requireModule('purchaseOrders'));

const RECEIVERS = ['Admin', 'Accountant', 'Purchase Manager', 'Warehouse Manager', 'Inventory Staff'];

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', authorize(...RECEIVERS), controller.create);
// Posting moves stock and cannot be undone, so it is a deliberate second step.
router.post('/:id/post', authorize(...RECEIVERS), controller.post);
router.post('/:id/invoice', authorize('Admin', 'Accountant', 'Purchase Manager'), controller.createInvoice);
router.post('/:id/cancel', authorize(...RECEIVERS), controller.cancel);

export default router;
