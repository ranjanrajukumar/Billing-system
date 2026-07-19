import { Router } from 'express';
import { body } from 'express-validator';
import { createSupplier, deleteSupplier, getSupplier, listSuppliers, updateSupplier } from '../controllers/supplier.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const rules = [
  body('supplierName').trim().isLength({ min: 2, max: 160 }),
  body('contactPerson').optional({ checkFalsy: true }).trim().isLength({ max: 120 }),
  body('mobileNumber').trim().isLength({ min: 7, max: 20 }),
  body('email').optional({ checkFalsy: true }).isEmail(),
  body('gstNumber').optional({ checkFalsy: true }).isLength({ min: 5, max: 20 }),
  body('address').optional({ checkFalsy: true }).trim(),
  body('city').optional({ checkFalsy: true }).trim(),
  body('state').optional({ checkFalsy: true }).trim(),
  body('pincode').optional({ checkFalsy: true }).trim().isLength({ min: 4, max: 10 }),
  body('isActive').optional().isBoolean()
];

router.get('/', listSuppliers);
router.get('/:id', getSupplier);
router.post('/', authorize('Admin', 'Accountant'), rules, validate, createSupplier);
router.put('/:id', authorize('Admin', 'Accountant'), rules, validate, updateSupplier);
router.delete('/:id', authorize('Admin'), deleteSupplier);

export default router;
