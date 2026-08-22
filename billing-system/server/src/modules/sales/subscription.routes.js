import { Router } from 'express';
import {
  listSubscriptions,
  getSubscription,
  createSubscription,
  updateSubscription,
  removeSubscription
} from './subscription.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';

const router = Router();

router.use(authorize('Admin', 'Sales'));

router.get('/', listSubscriptions);
router.get('/:id', getSubscription);
router.post('/', createSubscription);
router.put('/:id', updateSubscription);
router.delete('/:id', removeSubscription);

export default router;
