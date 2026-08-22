import { Company, Product, User } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

// Image bytes are excluded by each model's default scope, so these lookups
// deliberately go through .unscoped().
function sendImage(res, data, mimeType) {
  if (!data) return res.status(404).json({ message: 'Image not found' });
  res.setHeader('Content-Type', mimeType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=300');
  return res.send(data);
}

export const productImage = asyncHandler(async (req, res) => {
  const product = await Product.unscoped().findOne({
    where: { id: req.params.id, detstatus: false },
    attributes: ['imageData', 'imageMimeType']
  });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  return sendImage(res, product.imageData, product.imageMimeType);
});

export const companyLogo = asyncHandler(async (_req, res) => {
  const company = await Company.unscoped().findOne({ attributes: ['logoData', 'logoMimeType'] });
  if (!company) return res.status(404).json({ message: 'Company not found' });
  return sendImage(res, company.logoData, company.logoMimeType);
});

export const userAvatar = asyncHandler(async (req, res) => {
  const user = await User.unscoped().findOne({
    where: { id: req.params.id, detstatus: false },
    attributes: ['profileImageData', 'profileImageMimeType']
  });
  if (!user) return res.status(404).json({ message: 'User not found' });
  return sendImage(res, user.profileImageData, user.profileImageMimeType);
});
