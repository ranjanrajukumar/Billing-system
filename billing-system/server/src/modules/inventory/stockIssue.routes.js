import { Router } from 'express';
import { body } from 'express-validator';
import * as controller from './stockIssue.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validate.js';
import { requireModule } from '../platform/config.service.js';

/**
 * Store issues and material returns.
 *
 * Gated on its own module rather than on warehouses: a single-branch workshop
 * with no bins still issues material to a fitter and still wants it back.
 */
const router = Router();
router.use(requireModule('stockIssues'));

// Issuing is a storekeeper's job, and so is receiving the material back.
const STORE = ['Admin', 'Accountant', 'Warehouse Manager', 'Branch Manager', 'Inventory Staff'];

const issueRules = [
  body('issueDate').isISO8601().toDate(),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').isInt().withMessage('Valid product ID required'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Quantity must be greater than 0'),
  body('purpose').optional().isString(),
  body('returnable').optional().isBoolean(),
];

const returnRules = [
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.issueItemId').isInt().withMessage('Which issue line is coming back?'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Quantity must be greater than 0'),
  body('items.*.condition').optional().isIn(['Good', 'Damaged']),
];

// Returns are mounted before `/:id` so "returns" is never read as an issue id.
router.get('/returns', controller.listReturns);
router.get('/returns/:id', controller.getReturn);
router.post('/returns/:id/post', authorize(...STORE), controller.postReturn);
router.delete('/returns/:id', authorize(...STORE), controller.removeReturn);

// Likewise for the outstanding report.
router.get('/outstanding', controller.outstandingIssues);

router.get('/', controller.listIssues);
router.get('/:id', controller.getIssue);
router.post('/', authorize(...STORE), issueRules, validate, controller.createIssue);
router.put('/:id', authorize(...STORE), issueRules, validate, controller.updateIssue);
// The deliberate act that moves stock. A saved Draft has moved nothing.
router.post('/:id/issue', authorize(...STORE), controller.postIssue);
router.post('/:id/close', authorize(...STORE), controller.closeIssue);
router.post('/:id/returns', authorize(...STORE), returnRules, validate, controller.createReturn);
router.delete('/:id', authorize(...STORE), controller.removeIssue);

export default router;
