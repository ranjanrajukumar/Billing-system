import { Router } from 'express';
import { body } from 'express-validator';
import {
  attachment, createEntry, parties, partyLedger, removeEntry, summary, updateEntry,
} from './khata.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { upload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';

const router = Router();
const entryRules = [
  body('partyType').isIn(['Customer', 'Supplier']),
  body('partyId').isInt(),
  body('entryType').isIn(['Gave', 'Got']),
  body('amount').isFloat({ gt: 0 }),
  body('entryDate').optional({ checkFalsy: true }).isISO8601(),
  body('dueDate').optional({ checkFalsy: true }).isISO8601(),
  body('note').optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
];

router.get('/summary', summary);
router.get('/parties', parties);
router.get('/party/:partyType/:partyId', partyLedger);
router.get('/entries/:id/attachment', attachment);
router.post('/entries', authorize('Admin', 'Accountant', 'Sales'), upload.single('attachment'), entryRules, validate, createEntry);
router.put('/entries/:id', authorize('Admin', 'Accountant', 'Sales'), upload.single('attachment'), updateEntry);
router.delete('/entries/:id', authorize('Admin', 'Accountant'), removeEntry);

export default router;
