import { Op } from 'sequelize';
import { Category } from '../../models/index.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination, paged } from '../../utils/pagination.js';

export const listCategories = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPagination(req.query);
  const where = req.query.search ? { ...({ name: { [Op.like]: `%${req.query.search}%` } }), detstatus: false } : { detstatus: false };
  const { rows, count } = await Category.findAndCountAll({ where, limit, offset, order: [['name', 'ASC']] });
  res.json(paged(rows, count, page, limit));
});

export const getCategory = asyncHandler(async (req, res) => {
  const category = await Category.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!category) return res.status(404).json({ message: 'Category not found' });
  res.json(category);
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create({ ...req.body, authadd: req.user?.id });
  res.status(201).json(category);
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!category) return res.status(404).json({ message: 'Category not found' });
  await category.update({ ...req.body, authlstedit: req.user?.id });
  res.json(category);
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const itemToDelete = await Category.findOne({ where: { id: req.params.id, detstatus: false } });
  if (!itemToDelete) return res.status(404).json({ message: 'Category not found' });
  await itemToDelete.update({ detstatus: true, authdel: req.user?.id, delondt: new Date() });
  res.status(204).send();
});
