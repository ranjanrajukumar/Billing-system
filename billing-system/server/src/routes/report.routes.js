import { Router } from 'express';
import { customerReport, exportReport, gstReport, inventoryReport, productReport, salesReport } from '../controllers/report.controller.js';
import { authorize } from '../middleware/authMiddleware.js';

const router = Router();
router.use(authorize('Admin', 'Accountant'));
router.get('/sales', salesReport);
router.get('/customers', customerReport);
router.get('/gst', gstReport);
router.get('/products', productReport);
router.get('/inventory', inventoryReport);
router.get('/export/:type', exportReport);
export default router;
