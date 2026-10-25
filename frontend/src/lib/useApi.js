"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

// Stale-while-revalidate cache: revisiting a page renders the last response instantly while a fresh
// request runs in the background. Cleared on sign-in/out so accounts never see each other's data.
const cache = new Map();
const MAX_ENTRIES = 200;

export function clearApiCache() {
  cache.clear();
}

function remember(path, data) {
  cache.delete(path);
  cache.set(path, data);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

/** Fetch `path` on mount (and when it changes). Pass null to skip. */
export function useApi(path) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ key: null, data: null, error: null });
  const key = path ? `${path}#${version}` : null;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    api(path).then(
      (data) => {
        if (cancelled) return;
        remember(path, data);
        setState({ key, data, error: null });
      },
      (error) => !cancelled && setState({ key, data: null, error }),
    );
    return () => { cancelled = true; };
  }, [key, path]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((updater) => {
    setState((s) => {
      const data = typeof updater === "function" ? updater(s.data) : updater;
      if (path) remember(path, data);
      return { ...s, data };
    });
  }, [path]);

  const fresh = Boolean(key) && state.key === key;
  // Before the current request returns, show the cached copy (if any) instead of a spinner
  const cached = !fresh && path && version === 0 ? cache.get(path) : undefined;
  const loading = Boolean(key) && !fresh && cached === undefined;
  return {
    data: fresh ? state.data : cached ?? null,
    error: fresh ? state.error : null,
    loading,
    reload,
    setData,
  };
}
