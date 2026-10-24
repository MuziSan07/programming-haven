"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/** Fetch `path` on mount (and when it changes). Pass null to skip. */
export function useApi(path) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ key: null, data: null, error: null });
  const key = path ? `${path}#${version}` : null;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    api(path).then(
      (data) => !cancelled && setState({ key, data, error: null }),
      (error) => !cancelled && setState({ key, data: null, error }),
    );
    return () => { cancelled = true; };
  }, [key, path]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === "function" ? updater(s.data) : updater }));
  }, []);

  // Still loading until the response for the current key arrives
  const loading = Boolean(key) && state.key !== key;
  return { data: loading ? null : state.data, error: loading ? null : state.error, loading, reload, setData };
}
