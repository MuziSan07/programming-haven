"use client";

import { useAuth } from "./auth";
import { useApi } from "./useApi";

/** The signed-in user's chosen AI interviewer persona (falls back to the first one). */
export function usePersona() {
  const { user } = useAuth();
  const { data: personas } = useApi("/api/personas");
  const persona = personas?.find((p) => p.id === user?.persona_id) || personas?.[0] || null;
  return { persona, personas: personas || [] };
}
