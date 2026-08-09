import { Router } from 'express';
import { forgotPassword, login, me, register, resetPassword, updateProfile } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import { upload } from '../middleware/upload.js';
import { forgotRules, loginRules, registerRules, resetRules } from '../validators/auth.validator.js';
import { authLimiter } from '../middleware/rateLimiters.js';

const router = Router();
router.post('/register', authLimiter, registerRules, validate, register);
router.post('/login', authLimiter, loginRules, validate, login);
router.get('/me', authenticate, me);
router.put('/profile', authenticate, upload.single('profileImage'), updateProfile);
router.post('/forgot-password', authLimiter, forgotRules, validate, forgotPassword);
router.post('/reset-password', authLimiter, resetRules, validate, resetPassword);
export default router;
