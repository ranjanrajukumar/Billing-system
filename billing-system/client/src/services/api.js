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

// Sign-in and password-recovery calls answer 401 as a normal part of their job.
// Treating those as an expired session would log the user out of a session they
// have not started yet, and reload the page out from under the error message.
const CREDENTIAL_PATHS = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password'];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isCredentialCall = CREDENTIAL_PATHS.some((path) => url.includes(path));

    if (error.response?.status === 401 && !isCredentialCall) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      // Clearing storage alone leaves React holding the old token in state, so
      // the dead screen stays up and every action on it fails again. Sending
      // the browser to the login page ends the session properly and drops any
      // stale data still in memory.
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
