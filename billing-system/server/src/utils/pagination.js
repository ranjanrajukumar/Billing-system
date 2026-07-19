export function getPagination(query) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 10), 1), 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function paged(rows, count, page, limit) {
  return { data: rows, meta: { total: count, page, limit, pages: Math.ceil(count / limit) || 1 } };
}
