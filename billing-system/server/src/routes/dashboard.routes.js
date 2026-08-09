import { Router } from 'express';
import { dashboard, productPerformance } from '../controllers/dashboard.controller.js';

const router = Router();
router.get('/', dashboard);
router.get('/product-performance', productPerformance);
export default router;
