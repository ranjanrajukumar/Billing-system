import express from 'express';
import * as controller from './gatepass.controller.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { resolveBranch } from '../../middleware/branchContext.js';

const router = express.Router();

// Apply auth and branch context to all routes
router.use(authenticate, resolveBranch);

import { validate } from '../../middleware/validate.js';
import { gatepassRules } from './logistics.validator.js';

router.get('/', controller.getAll);
router.get('/:id', controller.getOne);
router.post('/', gatepassRules, validate, controller.create);
router.put('/:id', gatepassRules, validate, controller.update);
router.delete('/:id', controller.remove);

export default router;
