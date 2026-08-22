import express from 'express';
import * as controller from './inventory.controller.js';
// Authentication and branch context are applied by the parent router.

const router = express.Router();

router.get('/summary', controller.getSummary);
router.get('/movements', controller.getMovements);
router.get('/ledger', controller.getLedger);
router.get('/valuation', controller.getValuation);
router.get('/wms-stock', controller.getWmsStock);
router.post('/adjust', controller.adjustStock);

export default router;
