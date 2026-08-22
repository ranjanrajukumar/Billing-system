import { Router } from 'express';
import * as controller from './webhook.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { requireModule } from './config.service.js';

const router = Router();

/**
 * Outbound integrations.
 *
 * Admin-only throughout, and not because the data is sensitive. An endpoint is
 * a standing instruction to send this company's trading activity to an address
 * somebody typed — whoever can add one can quietly forward every invoice and
 * stock movement off-site. That is an ownership decision, not an operational
 * one, so it does not belong to warehouse or accounts roles.
 */
router.use(requireModule('webhooks'));
router.use(authorize('Admin'));

router.get('/vocabulary', controller.vocabulary);
router.get('/endpoints', controller.listEndpoints);
router.post('/endpoints', controller.createEndpoint);
router.put('/endpoints/:id', controller.updateEndpoint);
router.delete('/endpoints/:id', controller.removeEndpoint);

// Returns a new secret, once. The old one stops working immediately.
router.post('/endpoints/:id/rotate-secret', controller.rotateSecret);
router.post('/endpoints/:id/test', controller.testEndpoint);

router.get('/deliveries', controller.listDeliveries);
router.post('/dispatch', controller.dispatchNow);

export default router;
