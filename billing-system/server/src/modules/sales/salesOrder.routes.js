import express from 'express';
import * as controller from './salesOrder.controller.js';
import { invoiceFromSalesOrder } from './invoice.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
// Authentication and branch context are applied by the parent router.

const router = express.Router();


import { validate } from '../../middleware/validate.js';
import { salesOrderRules } from './sales.validator.js';

router.get('/', controller.getAll);
router.get('/:id', controller.getOne);
router.post('/', salesOrderRules, validate, controller.create);
router.put('/:id', salesOrderRules, validate, controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/confirm', controller.confirm);
router.post('/:id/cancel', controller.cancel);
// Billing an order. Lives with the sales order because that is where the work
// starts, but the handler is the invoice controller's — an invoice is made in
// exactly one place, whichever screen asked for it.
router.post('/:id/invoice', authorize('Admin', 'Sales', 'Accountant'), invoiceFromSalesOrder);
router.get('/:id/pdf', controller.downloadPdf);
router.get('/:id/html', controller.html);

export default router;
