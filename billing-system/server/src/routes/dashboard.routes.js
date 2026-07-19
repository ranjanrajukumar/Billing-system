import { Router } from 'express';
import { dashboard } from '../controllers/dashboard.controller.js';

const router = Router();
router.get('/', dashboard);
export default router;
