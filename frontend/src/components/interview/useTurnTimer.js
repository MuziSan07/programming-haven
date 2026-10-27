"use client";

import { useCallback, useRef } from "react";

const MAX_MS = 3_600_000;
const MAX_SPEAKING_MS = 1_800_000;
const clamp = (ms, max = MAX_MS) => Math.max(0, Math.min(max, Math.round(ms)));

function ensure(ref) {
  if (!ref.current) ref.current = { questionAt: Date.now(), firstAt: null, recAt: null, speakingMs: 0, input: null };
  return ref.current;
}

/**
 * Timing for each answer, sent to the backend as reply `meta` for speech analytics:
 * answer_ms (question ready -> submitted), think_ms (question ready -> first word or keystroke),
 * speaking_ms (time recording), input ("voice" | "text"). Everything lives in a ref: no re-renders.
 */
export function useTurnTimer() {
  const turnRef = useRef(null);

  /** A new question appeared. Returns a token for questionReady(). */
  const questionShown = useCallback(() => {
    const turn = { questionAt: Date.now(), firstAt: null, recAt: null, speakingMs: 0, input: null };
    turnRef.current = turn;
    return turn;
  }, []);

  /** The interviewer finished speaking: the clock starts now, unless the candidate already started. */
  const questionReady = useCallback((turn) => {
    if (turn && turnRef.current === turn && turn.firstAt == null) turn.questionAt = Date.now();
  }, []);

  const recordingStarted = useCallback(() => {
    const turn = ensure(turnRef);
    const now = Date.now();
    if (turn.firstAt == null) turn.firstAt = now;
    turn.recAt = now;
    turn.input = "voice";
  }, []);

  const recordingStopped = useCallback(() => {
    const turn = turnRef.current;
    if (turn?.recAt) {
      turn.speakingMs += Date.now() - turn.recAt;
      turn.recAt = null;
    }
  }, []);

  const typed = useCallback(() => {
    const turn = ensure(turnRef);
    if (turn.firstAt == null) turn.firstAt = Date.now();
    if (!turn.input) turn.input = "text";
  }, []);

  /** Metrics for the answer being submitted now. */
  const collect = useCallback((via) => {
    const turn = turnRef.current;
    if (!turn) return undefined;
    const now = Date.now();
    const input = via || turn.input || "text";
    const meta = {
      answer_ms: clamp(now - turn.questionAt),
      think_ms: clamp((turn.firstAt ?? now) - turn.questionAt),
      input,
    };
    if (input === "voice" && turn.speakingMs > 0) meta.speaking_ms = clamp(turn.speakingMs, MAX_SPEAKING_MS);
    turnRef.current = null;
    return meta;
  }, []);

  return { questionShown, questionReady, recordingStarted, recordingStopped, typed, collect };
}
