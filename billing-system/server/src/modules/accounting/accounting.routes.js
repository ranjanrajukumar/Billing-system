import { Router } from 'express';
import * as controller from './accounting.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { requireModule } from '../platform/config.service.js';

const router = Router();
router.use(requireModule('accounting'));
// The books are readable by those who answer for them, not by the whole shop.
router.use(authorize('Admin', 'Accountant', 'Auditor'));

import { validate } from '../../middleware/validate.js';
import { accountRules, entryRules } from './accounting.validator.js';

// ---- Chart of accounts ----
router.get('/accounts', controller.listAccounts);
router.get('/accounts/tree', controller.accountTree);
router.post('/accounts', authorize('Admin', 'Accountant'), accountRules, validate, controller.createAccount);
router.put('/accounts/:id', authorize('Admin', 'Accountant'), accountRules, validate, controller.updateAccount);
router.delete('/accounts/:id', authorize('Admin'), controller.removeAccount);
router.post('/accounts/seed', authorize('Admin', 'Accountant'), controller.seedAccounts);

// ---- Journal ----
router.get('/entries', controller.listEntries);
router.get('/entries/:id', controller.getEntry);
router.post('/entries', authorize('Admin', 'Accountant'), entryRules, validate, controller.createEntry);
// A posted entry is corrected by reversal, never by edit or delete.
router.post('/entries/:id/reverse', authorize('Admin', 'Accountant'), controller.reverse);

// ---- Statements ----
router.get('/ledger/:accountId', controller.getGeneralLedger);
router.get('/trial-balance', controller.getTrialBalance);
router.get('/profit-loss', controller.getProfitAndLoss);
router.get('/balance-sheet', controller.getBalanceSheet);
router.post('/rebuild-balances', authorize('Admin'), controller.rebuild);

export default router;
