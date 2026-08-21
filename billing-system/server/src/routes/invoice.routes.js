import { Router } from 'express';
import {
  confirmInvoice, createInvoice, downloadInvoicePdf, emailInvoice, getInvoice, invoiceHtml,
  listInvoices, removeInvoice, updateInvoice,
} from '../controllers/invoice.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { invoiceRules } from '../validators/invoice.validator.js';

const router = Router();
router.get('/', listInvoices);
router.get('/:id', getInvoice);
router.post('/', authorize('Admin', 'Sales', 'Accountant'), invoiceRules, validate, createInvoice);
// Editing an issued invoice rewrites stock, lots, coupon use and points, so it
// is held to a tighter set of roles than raising one.
router.put('/:id', authorize('Admin', 'Accountant'), invoiceRules, validate, updateInvoice);
router.delete('/:id', authorize('Admin', 'Sales'), removeInvoice);
// Confirm a Draft invoice → validates stock availability and deducts it atomically.
router.post('/:id/confirm', authorize('Admin', 'Sales', 'Accountant'), confirmInvoice);
router.post('/:id/email', authorize('Admin', 'Sales', 'Accountant'), emailInvoice);
router.get('/:id/pdf', downloadInvoicePdf);
router.get('/:id/html', invoiceHtml);
export default router;

