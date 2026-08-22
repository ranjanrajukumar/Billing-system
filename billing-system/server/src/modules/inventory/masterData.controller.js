import * as models from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';

const masterKeys = [
  'brand',
  'unit',
  'warehouse',
  'gstTax',
  'hsnSac',
  'paymentMode',
  'expenseCategory',
  'department',
  'financialYear',
  'invoiceSettings'
];

const getModel = (key) => {
  const map = {
    brand: models.Brand,
    unit: models.Unit,
    warehouse: models.Warehouse,
    gstTax: models.GstTax,
    hsnSac: models.HsnSac,
    paymentMode: models.PaymentMode,
    expenseCategory: models.ExpenseCategory,
    department: models.Department,
    financialYear: models.FinancialYear,
    invoiceSettings: models.InvoiceSetting
  };
  return map[key];
};

function ensureMasterKey(req, res) {
  if (!masterKeys.includes(req.params.masterKey)) {
    res.status(404).json({ message: 'Master data type not found' });
    return false;
  }
  return true;
}

export const listMasterData = asyncHandler(async (req, res) => {
  if (!ensureMasterKey(req, res)) return;

  const Model = getModel(req.params.masterKey);
  const { page, limit, offset } = getPagination(req.query);
  const search = String(req.query.search || '').toLowerCase();
  
  const rows = await Model.findAll({ where: { detstatus: false } });
  
  const filtered = search
    ? rows.filter((row) => Object.values(row.toJSON()).join(' ').toLowerCase().includes(search))
    : rows;

  res.json(paged(filtered.slice(offset, offset + limit), filtered.length, page, limit));
});

export const getMasterData = asyncHandler(async (req, res) => {
  if (!ensureMasterKey(req, res)) return;

  const Model = getModel(req.params.masterKey);
  const row = await Model.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!row) return res.status(404).json({ message: 'Master data record not found' });
  return res.json(row);
});

export const createMasterData = asyncHandler(async (req, res) => {
  if (!ensureMasterKey(req, res)) return;

  const Model = getModel(req.params.masterKey);
  const row = await Model.create({ ...req.body, authadd: req.user?.id });
  res.status(201).json(row);
});

export const updateMasterData = asyncHandler(async (req, res) => {
  if (!ensureMasterKey(req, res)) return;

  const Model = getModel(req.params.masterKey);
  const row = await Model.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!row) return res.status(404).json({ message: 'Master data record not found' });

  await row.update({ ...req.body, authlstedit: req.user?.id });
  return res.json(row);
});

export const deleteMasterData = asyncHandler(async (req, res) => {
  if (!ensureMasterKey(req, res)) return;

  const Model = getModel(req.params.masterKey);
  const row = await Model.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!row) return res.status(404).json({ message: 'Master data record not found' });

  await row.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() });
  return res.status(204).send();
});

