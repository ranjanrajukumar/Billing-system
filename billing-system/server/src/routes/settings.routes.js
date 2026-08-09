import { Router } from 'express';
import { getSettings, saveCompany } from '../controllers/settings.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/upload.js';

const router = Router();
router.get('/', getSettings);
// Accountants maintain company details and operating settings; Users, Roles
// and Audit logs remain Admin-only.
router.put('/company', authorize('Admin', 'Accountant'), upload.single('logo'), saveCompany);
export default router;
