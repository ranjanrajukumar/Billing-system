import { Router } from 'express';
import { dailyBriefing } from '../controllers/notification.controller.js';

const router = Router();
router.get('/daily', dailyBriefing);

export default router;
