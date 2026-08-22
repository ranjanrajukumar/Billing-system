import { Router } from 'express';
import { dashboard, operations, productPerformance } from './dashboard.controller.js';

const router = Router();
router.get('/', dashboard);
// The operations bands: what happened today, what is waiting, where each area
// stands. Separate from `/` because it is read on a different rhythm — the
// summary is glanced at repeatedly through a shift, the charts once.
router.get('/operations', operations);
router.get('/product-performance', productPerformance);
export default router;
