import { Company, FeatureFlag, Setting } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { imageColumns } from '../utils/imageUpload.js';
import { clearBranchCache } from '../middleware/branchContext.js';
import { getConfig, invalidateConfig, moduleStatus } from '../services/config.service.js';
import { BUSINESS_MODES, CORE_MODULE_KEYS, MODULE_BY_KEY } from '../config/modules.js';
import { catalogueForModules } from '../config/menu.js';
import { seedChartOfAccounts } from '../services/accounting.service.js';

// Only these are client-editable. The form posts back every column it read,
// including audit fields that must never be overwritten from a request.
const EDITABLE_FIELDS = [
  'name', 'gstNumber', 'email', 'mobile', 'address',
  'city', 'state', 'pincode', 'signatureUrl', 'defaultInvoiceTemplate', 'creditDays',
  'multiBranchEnabled', 'businessMode', 'allowNegativeStock',
  'loyaltyEnabled', 'loyaltyPointsPer100', 'loyaltyRedeemValue', 'loyaltyMinRedeem',
  'panNumber', 'licenseNo', 'cin', 'msmeReg'
];

const BOOLEAN_FIELDS = ['multiBranchEnabled', 'loyaltyEnabled', 'allowNegativeStock'];

export const getSettings = asyncHandler(async (_req, res) => {
  const [company, settings] = await Promise.all([Company.findOne(), Setting.findAll()]);
  res.json({ company, settings });
});

/**
 * What this installation currently offers: the mode, the module list with each
 * one's state, and the menu catalogue trimmed to match. The client renders its
 * navigation and its settings screen from this one response.
 */
export const getModules = asyncHandler(async (_req, res) => {
  const [config, modules] = await Promise.all([getConfig(), moduleStatus()]);
  res.json({
    mode: config.mode,
    modes: BUSINESS_MODES,
    allowNegativeStock: config.allowNegativeStock,
    multiBranch: config.multiBranch,
    modules,
    menuCatalogue: catalogueForModules(config.modules),
  });
});

/**
 * Switches the business mode.
 *
 * Going Advanced makes the ERP modules available and seeds the chart of
 * accounts so the accounting screens are usable straight away. Going back to
 * Basic only hides them — no data is touched, so the switch is reversible and a
 * business can try Advanced without risking what it already has.
 */
export const setBusinessMode = asyncHandler(async (req, res) => {
  const mode = req.body.mode;
  if (!BUSINESS_MODES.includes(mode)) {
    return res.status(400).json({ message: `Mode must be one of: ${BUSINESS_MODES.join(', ')}` });
  }

  const company = await Company.findOne();
  if (!company) return res.status(404).json({ message: 'Company not set up yet' });

  await company.update({ businessMode: mode, authlstedit: req.user?.id });
  invalidateConfig();

  if (mode === 'Advanced') await seedChartOfAccounts();

  const [config, modules] = await Promise.all([getConfig(), moduleStatus()]);
  res.json({
    message: `Switched to ${mode} mode.`,
    mode: config.mode,
    modules,
    menuCatalogue: catalogueForModules(config.modules),
  });
});

/** Turns one optional module on or off. Core modules are refused. */
export const setModule = asyncHandler(async (req, res) => {
  const { key } = req.params;
  const module = MODULE_BY_KEY[key];
  if (!module) return res.status(404).json({ message: `There is no module called "${key}"` });
  if (CORE_MODULE_KEYS.includes(key)) {
    return res.status(400).json({ message: `${module.label} is part of the core application and cannot be switched off` });
  }

  const { mode } = await getConfig();
  if (module.mode === 'Advanced' && mode !== 'Advanced') {
    return res.status(400).json({
      message: `${module.label} is only available in Advanced mode. Switch mode first.`,
    });
  }

  const enabled = req.body.enabled !== false;
  const [flag] = await FeatureFlag.findOrCreate({
    where: { moduleKey: key },
    defaults: { moduleKey: key, enabled, authadd: req.user?.id },
  });
  await flag.update({ enabled, detstatus: false, authlstedit: req.user?.id });
  invalidateConfig();

  if (enabled && key === 'accounting') await seedChartOfAccounts();

  const [config, modules] = await Promise.all([getConfig(), moduleStatus()]);
  res.json({
    message: `${module.label} ${enabled ? 'enabled' : 'disabled'}.`,
    modules,
    menuCatalogue: catalogueForModules(config.modules),
  });
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
  for (const flag of BOOLEAN_FIELDS) {
    if (payload[flag] === '' || payload[flag] === null) delete payload[flag];
    else if (payload[flag] !== undefined) payload[flag] = asBoolean(payload[flag]);
  }
  // The mode has its own endpoint because switching it seeds accounts; ignore
  // it here so a stray form field cannot flip the whole application.
  delete payload.businessMode;
  for (const num of ['creditDays', 'loyaltyPointsPer100', 'loyaltyRedeemValue', 'loyaltyMinRedeem']) {
    if (payload[num] !== undefined) payload[num] = Number(payload[num]) || 0;
  }

  const existing = await Company.findOne();
  const company = existing
    ? await existing.update(payload)
    : await Company.create({ ...payload, authadd: req.user?.id });

  // Switching modes changes how every request resolves its branch, and the
  // stock policy is read on every movement.
  clearBranchCache();
  invalidateConfig();

  // Re-read through the default scope so the logo bytes stay out of the response.
  res.json(await Company.findByPk(company.id));
});
