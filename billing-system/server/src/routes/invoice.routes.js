import { Router } from 'express';
import { createInvoice, downloadInvoicePdf, getInvoice, invoiceHtml, listInvoices, removeInvoice } from '../controllers/invoice.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { invoiceRules } from '../validators/invoice.validator.js';

const router = Router();
router.get('/', listInvoices);
router.get('/:id', getInvoice);
router.post('/', authorize('Admin', 'Sales', 'Accountant'), invoiceRules, validate, createInvoice);
router.delete('/:id', authorize('Admin', 'Sales'), removeInvoice);
router.get('/:id/pdf', downloadInvoicePdf);
router.get('/:id/html', invoiceHtml);
export default router;
