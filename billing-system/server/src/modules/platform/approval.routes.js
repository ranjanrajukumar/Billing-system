import { Router } from 'express';
import * as controller from './approval.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { requireModule } from './config.service.js';

const router = Router();
router.use(requireModule('approvals'));

router.get('/', controller.listRequests);
router.get('/pending-count', controller.pendingCount);
// Whether this particular user may decide a request is checked per-request
// against the rule's approver role, so the route stays open to any signed-in
// user and the service does the real gatekeeping.
router.post('/:id/approve', controller.approveRequest);
router.post('/:id/reject', controller.rejectRequest);

// ---- Rules ----
router.get('/rules/options', controller.ruleOptions);
router.get('/rules', controller.listRules);
router.post('/rules', authorize('Admin', 'Accountant'), controller.createRule);
router.put('/rules/:id', authorize('Admin', 'Accountant'), controller.updateRule);
router.delete('/rules/:id', authorize('Admin'), controller.removeRule);

export default router;
