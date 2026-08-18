import { Router } from 'express';
import * as controller from '../controllers/cash.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { requireModule } from '../services/config.service.js';

const router = Router();
router.use(requireModule('cashBank'));

// ---- Cash registers ----
router.get('/registers', controller.listRegisters);
router.get('/registers/reconciliation', controller.dailyReconciliation);
router.get('/registers/:id', controller.getRegister);
router.get('/registers/:id/transactions', controller.registerTransactions);
router.post('/registers/open', controller.openRegister);
router.post('/registers/:id/close', controller.closeRegister);
router.post('/registers/:id/entries', controller.addCashEntry);

import { validate } from '../middleware/validate.js';
import { bankRules, bankEntryRules } from '../validators/cash.validator.js';

// ---- Bank accounts ----
const TREASURY = ['Admin', 'Accountant'];
router.get('/banks', controller.listBankAccounts);
router.get('/banks/:id/transactions', controller.bankTransactions);
router.post('/banks', authorize(...TREASURY), bankRules, validate, controller.createBankAccount);
router.put('/banks/:id', authorize(...TREASURY), bankRules, validate, controller.updateBankAccount);
router.delete('/banks/:id', authorize('Admin'), controller.removeBankAccount);
router.post('/banks/:id/entries', authorize(...TREASURY), bankEntryRules, validate, controller.addBankEntry);
router.patch('/banks/entries/:entryId/reconcile', authorize(...TREASURY), controller.reconcileBankEntry);

export default router;
