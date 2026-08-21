import { Router } from 'express';
import {
  assignBarcode, createProduct, deleteProduct, getProduct, listCategories,
  listProducts, lookupByBarcode, updateProduct, importProducts,
} from '../controllers/product.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { productRules } from '../validators/product.validator.js';
import { upload } from '../middleware/upload.js';
import { uploadSheet } from '../middleware/uploadSheet.js';

const router = Router();
router.get('/categories', listCategories);
// Declared before '/:id' so a scanned code is never read as an id.
router.get('/barcode/:code', lookupByBarcode);
router.get('/', listProducts);
router.get('/:id', getProduct);
router.post('/:id/barcode', authorize('Admin', 'Accountant'), assignBarcode);
// A spreadsheet, not an image — `upload` would reject every file sent here.
router.post('/import', authorize('Admin', 'Accountant'), uploadSheet.single('file'), importProducts);
router.post('/', authorize('Admin', 'Accountant'), upload.single('image'), productRules, validate, createProduct);
router.put('/:id', authorize('Admin', 'Accountant'), upload.single('image'), productRules, validate, updateProduct);
router.delete('/:id', authorize('Admin'), deleteProduct);
export default router;
