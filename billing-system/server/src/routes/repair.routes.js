import { Router } from 'express';
import { body } from 'express-validator';
import { list, getOne, create, update, remove } from '../controllers/repair.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const repairRules = [
  body('repairNumber').optional({ checkFalsy: true }).isLength({ max: 50 }),
  body('productId').isInt({ min: 1 }).withMessage('Product ID is required'),
  body('branchId').isInt({ min: 1 }).withMessage('Branch ID is required'),
  body('qcInspectionId').optional({ nullable: true }).isInt({ min: 1 }),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be greater than 0'),
  body('issueDescription').optional({ nullable: true, checkFalsy: true }).isString(),
  body('repairCost').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('status').optional().isIn(['Pending', 'In Repair', 'Repaired', 'Scrapped']).default('Pending')
];

router.use(authorize('repairOrders'));

router.get('/', list);
router.get('/:id', getOne);
router.post('/', repairRules, validate, create);
router.put('/:id', repairRules, validate, update);
router.delete('/:id', remove);

export default router;
