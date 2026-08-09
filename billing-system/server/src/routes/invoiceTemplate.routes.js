import express from 'express';
import * as controller from '../controllers/invoiceTemplate.controller.js';
import { authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', authorize('Admin', 'Accountant', 'Sales'), controller.getAll);
router.get('/blocks', authorize('Admin', 'Accountant', 'Sales'), controller.listBlockTypes);
router.post('/html-preview', authorize('Admin', 'Accountant', 'Sales'), controller.htmlPreview);
router.post('/sample', authorize('Admin', 'Accountant', 'Sales'), controller.generateSample);
router.post('/', authorize('Admin', 'Accountant'), controller.create);
router.get('/:id', authorize('Admin', 'Accountant', 'Sales'), controller.getOne);
router.get('/:id/preview', authorize('Admin', 'Accountant', 'Sales'), controller.previewTemplate);
router.put('/:id', authorize('Admin', 'Accountant'), controller.update);
router.delete('/:id', authorize('Admin'), controller.remove);
router.post('/:id/duplicate', authorize('Admin', 'Accountant'), controller.duplicate);
router.put('/:id/set-default', authorize('Admin', 'Accountant'), controller.setDefault);

export default router;
