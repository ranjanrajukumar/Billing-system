import { Router } from 'express';
import * as controller from './cashflow.controller.js';
import { requireModule } from '../platform/config.service.js';

// Available in Basic mode too: knowing whether more money came in than went
// out is not an advanced question, and answering it must not require
// double-entry bookkeeping.
const router = Router();
router.use(requireModule('cashFlow'));

router.get('/', controller.overview);
router.get('/summary', controller.summary);
router.get('/position', controller.position);
router.get('/daily', controller.daily);

export default router;
