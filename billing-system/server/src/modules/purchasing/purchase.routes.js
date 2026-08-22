import { Router } from 'express';
import { createPurchase, getPurchase, listPurchases, removePurchase, importPurchases, uploadAttachment, getPurchaseAttachment } from './purchase.controller.js';
import { authorize, requirePermission } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validate.js';
import { purchaseRules } from './purchase.validator.js';

import { uploadDoc } from '../../middleware/uploadDoc.js';
import { uploadSheet } from '../../middleware/uploadSheet.js';

const router = Router();

router.use(requirePermission('purchases'));
router.get('/', listPurchases);
router.get('/:id', getPurchase);
router.get('/:id/attachment', authorize('Admin', 'Accountant', 'Purchase Manager'), getPurchaseAttachment);
// A spreadsheet, not a scan of one — uploadDoc only lets images and PDFs past.
router.post('/import', authorize('Admin', 'Accountant'), uploadSheet.single('file'), importPurchases);
router.post('/', authorize('Admin', 'Accountant'), purchaseRules, validate, createPurchase);
router.post('/:id/attachment', authorize('Admin', 'Accountant'), uploadDoc.single('file'), uploadAttachment);
router.delete('/:id', authorize('Admin'), removePurchase);

export default router;
