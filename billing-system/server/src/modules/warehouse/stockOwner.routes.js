import { Router } from 'express';
import * as controller from './stockOwner.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { requireModule } from '../platform/config.service.js';

const router = Router();

const MANAGERS = ['Admin', 'Accountant', 'Warehouse Manager'];

/**
 * Deliberately outside the module gate: anything that displays stock needs to
 * know which owner is the house, including a shop that has never heard of 3PL
 * and has exactly one owner. Gating it would make ordinary screens fail.
 */
router.get('/house', controller.house);

router.use(requireModule('thirdParty'));

router.get('/', controller.list);
router.get('/:id', controller.get);
router.get('/:id/holdings', controller.holdings);
router.post('/', authorize(...MANAGERS), controller.create);
router.put('/:id', authorize(...MANAGERS), controller.update);
router.delete('/:id', authorize('Admin'), controller.remove);

export default router;
