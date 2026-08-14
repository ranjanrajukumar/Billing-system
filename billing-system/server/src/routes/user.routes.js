import { Router } from 'express';
import { body } from 'express-validator';
import {
  createUser, deleteUser, listRoles, createRole, updateRole, deleteRole,
  listUsers, updateUser, menuRights, saveMenuRights, userLocations, saveUserLocations,
} from '../controllers/user.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const userRules = [
  body('name').trim().isLength({ min: 2, max: 120 }),
  body('email').isEmail(),
  body('mobile').optional({ checkFalsy: true }).trim().isLength({ max: 20 }),
  body('roleId').isInt({ min: 1 }),
  body('isActive').optional().isBoolean()
];
const createRules = [...userRules, body('password').isLength({ min: 6 })];
const updateRules = [...userRules, body('password').optional({ checkFalsy: true }).isLength({ min: 6 })];

router.get('/roles', listRoles);
router.get('/menu-rights', authorize('Admin'), menuRights);
router.put('/menu-rights/:id', authorize('Admin'), saveMenuRights);
router.post('/roles', authorize('Admin'), body('name').trim().isLength({ min: 2 }), validate, createRole);
router.put('/roles/:id', authorize('Admin'), body('name').trim().isLength({ min: 2 }), validate, updateRole);
router.delete('/roles/:id', authorize('Admin'), deleteRole);

// Per-location rights. Read is open to the user themselves so a location
// switcher can be built from it; only an Admin may change a grant.
router.get('/:id/locations', authorize('Admin'), userLocations);
router.put('/:id/locations', authorize('Admin'), saveUserLocations);

router.get('/', authorize('Admin'), listUsers);
router.post('/', authorize('Admin'), createRules, validate, createUser);
router.put('/:id', authorize('Admin'), updateRules, validate, updateUser);
router.delete('/:id', authorize('Admin'), deleteUser);

export default router;
