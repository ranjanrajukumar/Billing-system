import { Router } from 'express';
import * as controller from '../controllers/warehouse.controller.js';
import { authorize } from '../middleware/authMiddleware.js';
import { requireModule } from '../services/config.service.js';

import { validate } from '../middleware/validate.js';
import { warehouseRules, binRules } from '../validators/warehouse.validator.js';

const router = Router();

const MANAGERS = ['Admin', 'Accountant', 'Warehouse Manager'];

// ---- Serial numbers: their own module, so they work without warehouses ----
router.get('/serials', requireModule('serials'), controller.listSerials);
router.get('/serials/:serialNumber', requireModule('serials'), controller.serialHistory);
router.post('/serials', requireModule('serials'), authorize(...MANAGERS, 'Inventory Staff'), controller.createSerials);

// ---- Locations ----
router.use(requireModule('warehouses'));
router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.get('/:id/contents', controller.contents);
router.get('/:id/valuation', controller.valuation);
router.post('/', authorize(...MANAGERS), warehouseRules, validate, controller.create);
router.put('/:id', authorize(...MANAGERS), warehouseRules, validate, controller.update);
router.delete('/:id', authorize('Admin'), controller.remove);

// ---- Zone / rack / shelf / bin ----
router.get('/:id/bins', controller.listBins);
router.post('/:id/bins', authorize(...MANAGERS), binRules, validate, controller.createBin);
router.put('/:id/bins/:binId', authorize(...MANAGERS), binRules, validate, controller.updateBin);
router.delete('/:id/bins/:binId', authorize(...MANAGERS), controller.removeBin);

export default router;
