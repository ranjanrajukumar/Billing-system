import { Router } from 'express';
import {
  decideBulk, decideRecommendation, effectivePolicy, listPolicies,
  listRecommendations, removePolicy, replenishmentSummary, runReplenishment, savePolicy,
} from './replenishment.controller.js';
import { authorize, requirePermission } from '../../middleware/authMiddleware.js';

// Authentication and branch context are applied by the parent router.
const router = Router();

router.use(requirePermission('replenishment'));

const BUYERS = ['Admin', 'Accountant', 'Purchase Manager', 'Branch Manager', 'Warehouse Manager'];

// ---- Policies. Declared first so 'policies' is never matched as an id. ----
router.get('/policies/effective', effectivePolicy);
router.get('/policies', listPolicies);
router.post('/policies', authorize(...BUYERS), savePolicy);
router.delete('/policies/:id', authorize('Admin', 'Accountant'), removePolicy);

// ---- Recommendations ----
router.get('/summary', replenishmentSummary);
router.get('/', listRecommendations);
router.post('/run', authorize(...BUYERS), runReplenishment);
router.post('/bulk-decide', authorize(...BUYERS), decideBulk);
router.put('/:id/decide', authorize(...BUYERS), decideRecommendation);

export default router;
