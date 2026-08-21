import { Router } from 'express';
import {
  checkContainers, listContainers, listUnits, listVariants, openContainerAlerts,
  openOneContainer, postContainer, postMovement, postRepackage, postTransfer,
  productInventory, removeUnit, removeVariant, saveUnit, saveVariant, sellOptions,
} from '../controllers/productInventory.controller.js';
import { authorize } from '../middleware/authMiddleware.js';

// Authentication and branch context are applied by the parent router.
const router = Router();

const STOCK_ROLES = ['Admin', 'Accountant', 'Warehouse Manager', 'Branch Manager', 'Purchase Manager'];
// Selling is the one movement a counter role must be able to make.
const SELLING_ROLES = [...STOCK_ROLES, 'Sales', 'Cashier'];

// ---- Product configuration ----
router.get('/products/:id/units', listUnits);
router.post('/products/:id/units', authorize(...STOCK_ROLES), saveUnit);
router.delete('/products/:id/units/:unitId', authorize('Admin', 'Accountant'), removeUnit);

router.get('/products/:id/variants', listVariants);
router.post('/products/:id/variants', authorize(...STOCK_ROLES), saveVariant);
router.put('/products/:id/variants/:variantId', authorize(...STOCK_ROLES), saveVariant);
router.delete('/products/:id/variants/:variantId', authorize('Admin', 'Accountant'), removeVariant);

// ---- What the till offers, and what is held ----
router.get('/products/:id/sell-options', sellOptions);
router.get('/products/:id/inventory', productInventory);

// ---- The engine ----
router.post('/movements', authorize(...SELLING_ROLES), postMovement);
router.post('/transfers', authorize(...STOCK_ROLES), postTransfer);
router.post('/repackage', authorize(...STOCK_ROLES), postRepackage);

// ---- Containers ----
// Declared before '/containers/:containerId/open' can be mistaken for them.
router.get('/containers/alerts', openContainerAlerts);
router.get('/containers/reconcile', checkContainers);
router.get('/containers', listContainers);
router.post('/containers', authorize(...STOCK_ROLES), postContainer);
router.post('/containers/:containerId/open', authorize(...SELLING_ROLES), openOneContainer);

export default router;
