import express from 'express';
import * as controller from '../controllers/inventory.controller.js';
// Authentication and branch context are applied by the parent router.

const router = express.Router();


router.get('/summary', controller.getSummary);
router.get('/movements', controller.getMovements);
router.post('/adjust', controller.adjustStock);

export default router;
