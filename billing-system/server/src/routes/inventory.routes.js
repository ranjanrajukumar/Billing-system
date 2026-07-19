import express from 'express';
import * as controller from '../controllers/inventory.controller.js';
import { authenticate as protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/movements', controller.getMovements);
router.post('/adjust', controller.adjustStock);

export default router;
