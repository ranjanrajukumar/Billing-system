import { Router } from 'express';
import { alertCount, alerts, dailyBriefing } from './notification.controller.js';

// No module guard: the feed gates itself per alert, so a user always gets the
// alerts for the modules they actually have rather than an empty list or a 403.
const router = Router();

router.get('/', alerts);
router.get('/count', alertCount);
router.get('/daily', dailyBriefing);

export default router;
