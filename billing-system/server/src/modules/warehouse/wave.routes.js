import { Router } from 'express';
import { list, getOne, create, update, remove } from './wave.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';

import { validate } from '../../middleware/validate.js';
import { waveRules } from './logistics.validator.js';

const router = Router();

router.use(authorize('Admin', 'Warehouse', 'Fulfilment'));

router.get('/', list);
router.get('/:id', getOne);
router.post('/', waveRules, validate, create);
router.put('/:id', waveRules, validate, update);
router.delete('/:id', remove);

export default router;
