import express from 'express';
import * as controller from '../controllers/salesReturn.controller.js';
// Authentication and branch context are applied by the parent router.

const router = express.Router();


router.get('/', controller.getAll);
router.get('/:id', controller.getOne);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
router.get('/:id/pdf', controller.downloadPdf);
router.get('/:id/html', controller.html);

export default router;
