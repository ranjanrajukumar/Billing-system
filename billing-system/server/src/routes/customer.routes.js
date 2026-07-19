import { Router } from 'express';
import { createCustomer, deleteCustomer, getCustomer, listCustomers, updateCustomer } from '../controllers/customer.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { customerRules } from '../validators/customer.validator.js';

const router = Router();
router.get('/', listCustomers);
router.get('/:id', getCustomer);
router.post('/', authorize('Admin', 'Sales'), customerRules, validate, createCustomer);
router.put('/:id', authorize('Admin', 'Sales'), customerRules, validate, updateCustomer);
router.delete('/:id', authorize('Admin'), deleteCustomer);
export default router;
