import express from 'express';
import * as controller from '../controllers/quotation.controller.js';
import { authenticate as protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', controller.getAll);
router.get('/:id', controller.getOne);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

export default router;
