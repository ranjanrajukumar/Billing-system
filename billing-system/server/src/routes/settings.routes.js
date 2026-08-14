import { Router } from 'express';
import { getModules, getSettings, saveCompany, setBusinessMode, setModule } from '../controllers/settings.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/upload.js';

const router = Router();
router.get('/', getSettings);
// Accountants maintain company details and operating settings; Users, Roles
// and Audit logs remain Admin-only.
router.put('/company', authorize('Admin', 'Accountant'), upload.single('logo'), saveCompany);

// Every signed-in user reads the module list — the sidebar is built from it.
router.get('/modules', getModules);
// Changing what the application *is* stays with the people who own it.
router.put('/mode', authorize('Admin'), setBusinessMode);
router.put('/modules/:key', authorize('Admin'), setModule);

export default router;
