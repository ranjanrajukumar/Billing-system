import { Router } from 'express';
import { companyLogo, productImage, userAvatar } from '../controllers/media.controller.js';

// Mounted outside /api and left unauthenticated so plain <img src> works,
// matching how /uploads was served before images moved into the database.
const router = Router();
router.get('/products/:id', productImage);
router.get('/company/logo', companyLogo);
router.get('/users/:id', userAvatar);
// Khata bill photos are private, so they are served from the authenticated
// /api/khata routes instead of here.

export default router;
