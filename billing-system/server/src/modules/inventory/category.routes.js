import { Router } from 'express';
import { body } from 'express-validator';
import { createCategory, deleteCategory, getCategory, listCategories, updateCategory } from './category.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validate.js';

const router = Router();
const rules = [
  body('name').trim().isLength({ min: 2, max: 120 }),
  body('description').optional({ checkFalsy: true }).trim()
];

router.get('/', listCategories);
router.get('/:id', getCategory);
router.post('/', authorize('Admin', 'Accountant'), rules, validate, createCategory);
router.put('/:id', authorize('Admin', 'Accountant'), rules, validate, updateCategory);
router.delete('/:id', authorize('Admin'), deleteCategory);

export default router;
