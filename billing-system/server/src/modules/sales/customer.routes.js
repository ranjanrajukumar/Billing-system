import { Router } from 'express';
import { createCustomer, deleteCustomer, getCustomer, listCustomers, updateCustomer } from './customer.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validate.js';
import { customerRules } from './customer.validator.js';

const router = Router();
router.get('/', listCustomers);
router.get('/:id', getCustomer);
router.post('/', authorize('Admin', 'Sales', 'Accountant'), customerRules, validate, createCustomer);
router.put('/:id', authorize('Admin', 'Sales', 'Accountant'), customerRules, validate, updateCustomer);
router.delete('/:id', authorize('Admin'), deleteCustomer);
export default router;
