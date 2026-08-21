const SERVER_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

// The API returns image locations as server-relative paths (/media/... for
// database-backed images).
export const mediaUrl = (relativePath) => (relativePath ? SERVER_ORIGIN + relativePath : '');

export const currency = (value) => {
  const code = localStorage.getItem('currency') || 'INR';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: code }).format(Number(value || 0));
};
export const date = (value) => value ? new Intl.DateTimeFormat('en-IN').format(new Date(value)) : '-';
