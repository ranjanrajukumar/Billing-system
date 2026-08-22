import { Router } from 'express';
import {
  createUser, deleteUser, listRoles, createRole, updateRole, deleteRole,
  listUsers, updateUser, menuRights, saveMenuRights, userLocations, saveUserLocations,
} from './user.controller.js';
import { authorize } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validate.js';
import { roleRules, userCreateRules, userUpdateRules } from './user.validator.js';

const router = Router();

router.get('/roles', listRoles);
router.get('/menu-rights', authorize('Admin'), menuRights);
router.put('/menu-rights/:id', authorize('Admin'), saveMenuRights);
router.post('/roles', authorize('Admin'), roleRules, validate, createRole);
router.put('/roles/:id', authorize('Admin'), roleRules, validate, updateRole);
router.delete('/roles/:id', authorize('Admin'), deleteRole);

// Per-location rights. Read is open to the user themselves so a location
// switcher can be built from it; only an Admin may change a grant.
router.get('/:id/locations', authorize('Admin'), userLocations);
router.put('/:id/locations', authorize('Admin'), saveUserLocations);

router.get('/', authorize('Admin'), listUsers);
router.post('/', authorize('Admin'), userCreateRules, validate, createUser);
router.put('/:id', authorize('Admin'), userUpdateRules, validate, updateUser);
router.delete('/:id', authorize('Admin'), deleteUser);

export default router;
