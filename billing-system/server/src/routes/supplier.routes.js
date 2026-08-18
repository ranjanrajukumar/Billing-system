import { Router } from 'express';
import { body } from 'express-validator';
import { createSupplier, deleteSupplier, getSupplier, listSuppliers, updateSupplier } from '../controllers/supplier.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { supplierRules } from '../validators/supplier.validator.js';

const router = Router();


router.get('/', listSuppliers);
router.get('/:id', getSupplier);
router.post('/', authorize('Admin', 'Accountant'), supplierRules, validate, createSupplier);
router.put('/:id', authorize('Admin', 'Accountant'), supplierRules, validate, updateSupplier);
router.delete('/:id', authorize('Admin'), deleteSupplier);

export default router;
