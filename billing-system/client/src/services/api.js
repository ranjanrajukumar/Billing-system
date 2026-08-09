import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 20000
});

export const ACTIVE_BRANCH_KEY = 'activeBranchId';

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Admins can act on another branch; the server ignores this for other roles.
  const branch = localStorage.getItem(ACTIVE_BRANCH_KEY);
  if (branch) config.headers['X-Branch-Id'] = branch;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    return Promise.reject(error);
  }
);

export default api;
