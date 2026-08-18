import { Router } from 'express';
import { list, getOne, create, update, remove } from '../controllers/qc.controller.js';
import { authorize } from '../middleware/authMiddleware.js';

import { validate } from '../middleware/validate.js';
import { qcRules } from '../validators/logistics.validator.js';

const router = Router();

router.use(authorize('Admin', 'Warehouse', 'QC'));

router.get('/', list);
router.get('/:id', getOne);
router.post('/', qcRules, validate, create);
router.put('/:id', qcRules, validate, update);
router.delete('/:id', remove);

export default router;
