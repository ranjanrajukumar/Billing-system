import { Router } from 'express';
import { createProduct, deleteProduct, getProduct, listCategories, listProducts, updateProduct } from '../controllers/product.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { productRules } from '../validators/product.validator.js';
import { upload } from '../middleware/upload.js';

const router = Router();
router.get('/categories', listCategories);
router.get('/', listProducts);
router.get('/:id', getProduct);
router.post('/', authorize('Admin', 'Accountant'), upload.single('image'), productRules, validate, createProduct);
router.put('/:id', authorize('Admin', 'Accountant'), upload.single('image'), productRules, validate, updateProduct);
router.delete('/:id', authorize('Admin'), deleteProduct);
export default router;
