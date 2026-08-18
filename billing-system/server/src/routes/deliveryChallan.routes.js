import express from 'express';
import * as controller from '../controllers/deliveryChallan.controller.js';
// Authentication and branch context are applied by the parent router.

const router = express.Router();


import { validate } from '../middleware/validate.js';
import { deliveryChallanRules } from '../validators/logistics.validator.js';

router.get('/', controller.getAll);
router.get('/:id', controller.getOne);
router.post('/', deliveryChallanRules, validate, controller.create);
router.put('/:id', deliveryChallanRules, validate, controller.update);
router.delete('/:id', controller.remove);
router.get('/:id/pdf', controller.downloadPdf);
router.get('/:id/html', controller.html);

export default router;
