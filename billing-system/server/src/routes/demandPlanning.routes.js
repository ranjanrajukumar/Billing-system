import { Router } from 'express';
import {
  forecastSummary, forecastTrend, listForecasts, overrideForecast, runForecast,
} from '../controllers/demandPlanning.controller.js';
import { authorize, requirePermission } from '../middleware/authMiddleware.js';

// Authentication and branch context are applied by the parent router.
const router = Router();

router.use(requirePermission('demandPlanning'));

router.get('/summary', forecastSummary);
// Declared before '/:id' so "summary" and "trend" are never read as ids.
router.get('/trend/:productId', forecastTrend);
router.get('/', listForecasts);

// Regenerating rewrites a location's forecasts, so it is not something a
// counter role should be able to trigger.
router.post('/run', authorize('Admin', 'Accountant', 'Purchase Manager', 'Branch Manager'), runForecast);
router.put('/:id/override', authorize('Admin', 'Accountant', 'Purchase Manager', 'Branch Manager'), overrideForecast);

export default router;
