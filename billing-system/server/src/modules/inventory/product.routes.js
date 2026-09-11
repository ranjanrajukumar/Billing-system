import { Router } from 'express';
import {
  assignBarcode, createProduct, deleteProduct, getProduct, listCategories,
  listProducts, lookupByBarcode, updateProduct, importProducts, getProductImportJob,
} from './product.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validate.js';
import { productRules } from './product.validator.js';
import { upload } from '../../middleware/upload.js';
import { uploadLargeSheet } from '../../middleware/uploadSheet.js';

const router = Router();
router.get('/categories', listCategories);
// Declared before '/:id' so a scanned code is never read as an id.
router.get('/barcode/:code', lookupByBarcode);
router.get('/import/:jobId', authorize('Admin', 'Accountant'), getProductImportJob);
router.get('/', listProducts);
router.get('/:id', getProduct);
router.post('/:id/barcode', authorize('Admin', 'Accountant'), assignBarcode);
// A spreadsheet, not an image — `upload` would reject every file sent here.
router.post('/import', authorize('Admin', 'Accountant'), uploadLargeSheet.single('file'), importProducts);
router.post('/', authorize('Admin', 'Accountant'), upload.single('image'), productRules, validate, createProduct);
router.put('/:id', authorize('Admin', 'Accountant'), upload.single('image'), productRules, validate, updateProduct);
router.delete('/:id', authorize('Admin'), deleteProduct);
export default router;
