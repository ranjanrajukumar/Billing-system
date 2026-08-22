import { Router } from 'express';
import * as controller from './stockAudit.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { requireModule } from '../platform/config.service.js';

// Every route here is read-only, so it is opened to the roles that answer for
// stock rather than restricted to Admin — a warehouse manager who cannot see
// the discrepancies cannot be expected to explain them.
const router = Router();
router.use(requireModule('stockAudit'));
router.use(authorize('Admin', 'Accountant', 'Auditor', 'Warehouse Manager', 'Branch Manager'));

router.get('/', controller.overview);
router.get('/reconciliation', controller.reconciliation);
router.get('/exceptions', controller.exceptions);
router.get('/location/:branchId', controller.location);

export default router;
