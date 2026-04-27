'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { User, AuthTokens } from '@/types/auth';
import { api } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const TOKEN_REFRESH_THRESHOLD = 2 * 60 * 1000; // Refresh 2 minutes before expiry

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);

  const getAccessToken = useCallback(() => {
    return tokens?.accessToken || null;
  }, [tokens]);

  // Update API client token getter when tokens change
  useEffect(() => {
    api.setTokenGetter(getAccessToken);
  }, [getAccessToken]);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('tokenExpiry');
    setUser(null);
    setTokens(null);
  }, []);

  const refreshAccessToken = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        await logout();
        return null;
      }

      const data = await response.json();
      const expiryTime = Date.now() + (data.expiresIn * 1000);

      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('tokenExpiry', expiryTime.toString());

      setTokens({
        accessToken: data.accessToken,
        refreshToken,
        expiresIn: data.expiresIn,
      });

      return data.accessToken;
    } catch (error) {
      console.error('Token refresh error:', error);
      await logout();
      return null;
    }
  }, [logout]);

  const fetchUser = useCallback(async (accessToken: string) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user');
      }

      const userData = await response.json();
      setUser(userData);
      return userData;
    } catch (error) {
      console.error('Fetch user error:', error);
      return null;
    }
  }, []);

  const login = useCallback(() => {
    // Redirect to Google OAuth
    window.location.href = `${API_URL}/api/auth/google`;
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const accessToken = params.get('accessToken');
      const refreshToken = params.get('refreshToken');
      const error = params.get('error');

      if (error) {
        console.error('OAuth error:', error);
        setIsLoading(false);
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }

      if (accessToken && refreshToken) {
        // Store tokens
        const expiryTime = Date.now() + (15 * 60 * 1000); // 15 minutes
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('tokenExpiry', expiryTime.toString());

        setTokens({ accessToken, refreshToken });

        // Fetch user info
        await fetchUser(accessToken);

        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
      }

      setIsLoading(false);
    };

    handleCallback();
  }, [fetchUser]);

  // Initialize from localStorage
  useEffect(() => {
    const initAuth = async () => {
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');
      const tokenExpiry = localStorage.getItem('tokenExpiry');

      if (!accessToken || !refreshToken) {
        setIsLoading(false);
        return;
      }

      const expiry = tokenExpiry ? parseInt(tokenExpiry, 10) : 0;
      const now = Date.now();

      // Token expired or about to expire
      if (now >= expiry - TOKEN_REFRESH_THRESHOLD) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          await fetchUser(newToken);
        }
      } else {
        setTokens({ accessToken, refreshToken });
        await fetchUser(accessToken);
      }

      setIsLoading(false);
    };

    initAuth();
  }, [fetchUser, refreshAccessToken]);

  // Setup token refresh interval
  useEffect(() => {
    if (!tokens?.accessToken) return;

    const checkAndRefresh = async () => {
      const tokenExpiry = localStorage.getItem('tokenExpiry');
      const expiry = tokenExpiry ? parseInt(tokenExpiry, 10) : 0;
      const now = Date.now();

      if (now >= expiry - TOKEN_REFRESH_THRESHOLD) {
        await refreshAccessToken();
      }
    };

    const interval = setInterval(checkAndRefresh, 60 * 1000); // Check every minute

    return () => clearInterval(interval);
  }, [tokens?.accessToken, refreshAccessToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
