import { Router } from 'express';
import { list, getOne, create, update, remove } from '../controllers/shipment.controller.js';
import { authorize } from '../middleware/authMiddleware.js';

import { validate } from '../middleware/validate.js';
import { shipmentRules } from '../validators/logistics.validator.js';

const router = Router();

router.use(authorize('Admin', 'Warehouse', 'Fulfilment'));

router.get('/', list);
router.get('/:id', getOne);
router.post('/', shipmentRules, validate, create);
router.put('/:id', shipmentRules, validate, update);
router.delete('/:id', remove);

export default router;
