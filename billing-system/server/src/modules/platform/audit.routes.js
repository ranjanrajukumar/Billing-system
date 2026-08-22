import { Router } from 'express';
import { auditFilters, entityHistory, listAuditLogs } from './audit.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';

// Audit trails record who did what, so only Admins may read them.
const router = Router();
router.use(authorize('Admin'));

router.get('/', listAuditLogs);
router.get('/filters', auditFilters);
router.get('/:entity/:entityId', entityHistory);

export default router;
