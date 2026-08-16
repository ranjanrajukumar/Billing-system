import express from 'express';
import * as controller from '../controllers/gatepass.controller.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { resolveBranch } from '../middleware/branchContext.js';

const router = express.Router();

// Apply auth and branch context to all routes
router.use(authenticate, resolveBranch);

router.get('/', controller.getAll);
router.get('/:id', controller.getOne);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

export default router;
