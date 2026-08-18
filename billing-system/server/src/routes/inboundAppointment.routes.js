import { Router } from 'express';
import { list, getOne, create, update, remove } from '../controllers/inboundAppointment.controller.js';
import { authorize } from '../middleware/authMiddleware.js';

import { validate } from '../middleware/validate.js';
import { appointmentRules } from '../validators/logistics.validator.js';

const router = Router();

router.use(authorize('Admin', 'Warehouse', 'Purchase'));

router.get('/', list);
router.get('/:id', getOne);
router.post('/', appointmentRules, validate, create);
router.put('/:id', appointmentRules, validate, update);
router.delete('/:id', remove);

export default router;
