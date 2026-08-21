import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '../services/auth.service.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  // The stored user is a snapshot from whenever the session began. Role changes
  // and newly added menu keys would otherwise stay invisible until a manual
  // re-login, so refresh it on load.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    authService.me()
      .then((data) => {
        if (cancelled || !data?.user) return;
        localStorage.setItem('user', JSON.stringify(data.user));
        if (data.user?.currency) localStorage.setItem('currency', data.user.currency);
        setUser(data.user);
      })
      // A failure here just leaves the cached user in place; the API rejects
      // anything the session is not entitled to anyway.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  const login = async (payload) => {
    const data = await authService.login(payload);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    if (data.user?.currency) localStorage.setItem('currency', data.user.currency);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (payload) => {
    const data = await authService.register(payload);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    if (data.user?.currency) localStorage.setItem('currency', data.user.currency);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  const updateUser = (updatedUser) => {
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  const value = useMemo(() => ({ user, token, login, register, logout, updateUser, isAuthenticated: Boolean(token) }), [user, token]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
