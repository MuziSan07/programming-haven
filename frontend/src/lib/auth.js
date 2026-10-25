"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "./api";
import { clearApiCache } from "./useApi";

const AuthContext = createContext(null);

async function fetchMe() {
  if (!getToken()) return null;
  try {
    return await api("/api/auth/me");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const me = await fetchMe();
    setUser(me);
    setLoading(false);
    return me;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((me) => {
      if (cancelled) return;
      setUser(me);
      setLoading(false);
    });
    const onUnauthorized = () => setUser(null);
    window.addEventListener("haven:unauthorized", onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener("haven:unauthorized", onUnauthorized);
    };
  }, []);

  const signIn = useCallback(async (path, payload) => {
    const data = await api(path, { body: payload });
    clearApiCache();
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      setUser,
      refresh,
      login: (email, password) => signIn("/api/auth/login", { email, password }),
      register: (payload) => signIn("/api/auth/register", payload),
      logout: () => {
        clearApiCache();
        setToken(null);
        setUser(null);
      },
    }),
    [user, loading, refresh, signIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
