import { Company, Setting } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getSettings = asyncHandler(async (_req, res) => {
  const [company, settings] = await Promise.all([Company.findOne(), Setting.findAll()]);
  res.json({ company, settings });
});

export const saveCompany = asyncHandler(async (req, res) => {
  const payload = { ...req.body };
  if (req.file) payload.logoPath = `/uploads/${req.file.filename}`;
  const existing = await Company.findOne();
  const company = existing ? await existing.update(payload) : await Company.create(payload);
  res.json(company);
});
