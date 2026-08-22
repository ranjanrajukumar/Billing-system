import { Router } from 'express';
import {
  ageingExport, ageingReport, customerReport, exportReport, gstr1Export, gstr1Report,
  gstReport, inventoryReport, productReport, salesReport,
} from './report.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';

const router = Router();
router.use(authorize('Admin', 'Accountant'));
router.get('/sales', salesReport);
router.get('/customers', customerReport);
router.get('/gst', gstReport);
router.get('/gstr1', gstr1Report);
router.get('/gstr1/export', gstr1Export);
router.get('/ageing', ageingReport);
router.get('/ageing/export', ageingExport);
router.get('/products', productReport);
router.get('/inventory', inventoryReport);
router.get('/export/:type', exportReport);
export default router;
