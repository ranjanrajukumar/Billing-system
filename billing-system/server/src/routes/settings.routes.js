import { Router } from 'express';
import { getSettings, saveCompany } from '../controllers/settings.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/upload.js';

const router = Router();
router.get('/', getSettings);
router.put('/company', authorize('Admin'), upload.single('logo'), saveCompany);
export default router;
