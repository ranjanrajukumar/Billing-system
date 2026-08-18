import express from 'express';
import * as controller from '../controllers/salesOrder.controller.js';
// Authentication and branch context are applied by the parent router.

const router = express.Router();


import { validate } from '../middleware/validate.js';
import { salesOrderRules } from '../validators/sales.validator.js';

router.get('/', controller.getAll);
router.get('/:id', controller.getOne);
router.post('/', salesOrderRules, validate, controller.create);
router.put('/:id', salesOrderRules, validate, controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/confirm', controller.confirm);
router.post('/:id/cancel', controller.cancel);
router.get('/:id/pdf', controller.downloadPdf);
router.get('/:id/html', controller.html);

export default router;
