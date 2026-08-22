import { Router } from 'express';
import { createSupplier, deleteSupplier, getSupplier, listSuppliers, updateSupplier } from './supplier.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validate.js';
import { supplierRules } from './supplier.validator.js';

const router = Router();


router.get('/', listSuppliers);
router.get('/:id', getSupplier);
router.post('/', authorize('Admin', 'Accountant'), supplierRules, validate, createSupplier);
router.put('/:id', authorize('Admin', 'Accountant'), supplierRules, validate, updateSupplier);
router.delete('/:id', authorize('Admin'), deleteSupplier);

export default router;
