import { Company, Setting } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { imageColumns } from '../utils/imageUpload.js';
import { clearBranchCache } from '../middleware/branchContext.js';

// Only these are client-editable. The form posts back every column it read,
// including audit fields that must never be overwritten from a request.
const EDITABLE_FIELDS = [
  'name', 'gstNumber', 'email', 'mobile', 'address',
  'city', 'state', 'pincode', 'signatureUrl', 'defaultInvoiceTemplate', 'creditDays',
  'multiBranchEnabled',
  'loyaltyEnabled', 'loyaltyPointsPer100', 'loyaltyRedeemValue', 'loyaltyMinRedeem',
  'panNumber', 'licenseNo', 'cin', 'msmeReg'
];

export const getSettings = asyncHandler(async (_req, res) => {
  const [company, settings] = await Promise.all([Company.findOne(), Setting.findAll()]);
  res.json({ company, settings });
});

// Multipart form fields arrive as strings, so "false" would otherwise be stored
// as a truthy value.
const asBoolean = (value) => [true, 1, '1', 'true', 'on', 'yes'].includes(
  typeof value === 'string' ? value.toLowerCase() : value,
);

export const saveCompany = asyncHandler(async (req, res) => {
  const payload = { authlstedit: req.user?.id, ...imageColumns(req.file, 'logo') };
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) payload[field] = req.body[field];
  }
  // An empty value means the form did not send the field, not "turn it off" —
  // otherwise a partial save silently disables a mode.
  for (const flag of ['multiBranchEnabled', 'loyaltyEnabled']) {
    if (payload[flag] === '' || payload[flag] === null) delete payload[flag];
    else if (payload[flag] !== undefined) payload[flag] = asBoolean(payload[flag]);
  }
  for (const num of ['creditDays', 'loyaltyPointsPer100', 'loyaltyRedeemValue', 'loyaltyMinRedeem']) {
    if (payload[num] !== undefined) payload[num] = Number(payload[num]) || 0;
  }

  const existing = await Company.findOne();
  const company = existing
    ? await existing.update(payload)
    : await Company.create({ ...payload, authadd: req.user?.id });

  // Switching modes changes how every request resolves its branch.
  clearBranchCache();

  // Re-read through the default scope so the logo bytes stay out of the response.
  res.json(await Company.findByPk(company.id));
});
