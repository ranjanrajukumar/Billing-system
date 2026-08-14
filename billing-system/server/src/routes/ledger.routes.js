import { Router } from 'express';
import * as controller from '../controllers/ledger.controller.js';

// Party ledgers are derived from the documents themselves, so these are all
// read-only: there is nothing here to write.
const router = Router();

router.get('/receivables', controller.receivables);
router.get('/payables', controller.payables);
router.get('/customer/:id', controller.customerLedger);
router.get('/supplier/:id', controller.supplierLedger);

export default router;
