import { Router } from 'express';
import { forgotPassword, login, me, register, resetPassword, updateProfile } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { upload } from '../middleware/upload.js';
import { forgotRules, loginRules, registerRules, resetRules } from '../validators/auth.validator.js';

const router = Router();
router.post('/register', registerRules, validate, register);
router.post('/login', loginRules, validate, login);
router.get('/me', authenticate, me);
router.put('/profile', authenticate, upload.single('profileImage'), updateProfile);
router.post('/forgot-password', forgotRules, validate, forgotPassword);
router.post('/reset-password', resetRules, validate, resetPassword);
export default router;
