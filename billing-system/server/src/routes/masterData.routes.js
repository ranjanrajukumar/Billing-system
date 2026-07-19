import { Router } from 'express';
import { body } from 'express-validator';
import { createMasterData, deleteMasterData, getMasterData, listMasterData, updateMasterData } from '../controllers/masterData.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const rules = [
  body().custom((value) => value && typeof value === 'object' && !Array.isArray(value))
];

router.get('/:masterKey', listMasterData);
router.get('/:masterKey/:id', getMasterData);
router.post('/:masterKey', authorize('Admin', 'Accountant'), rules, validate, createMasterData);
router.put('/:masterKey/:id', authorize('Admin', 'Accountant'), rules, validate, updateMasterData);
router.delete('/:masterKey/:id', authorize('Admin'), deleteMasterData);

export default router;
