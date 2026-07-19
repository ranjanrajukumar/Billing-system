import express from 'express';
import * as controller from '../controllers/invoiceTemplate.controller.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('Admin', 'SuperAdmin')); // Assuming only admins manage templates

router.get('/', controller.getAll);
router.post('/sample', controller.generateSample);
router.post('/', controller.create);
router.get('/:id', controller.getOne);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/duplicate', controller.duplicate);
router.put('/:id/set-default', controller.setDefault);

export default router;
