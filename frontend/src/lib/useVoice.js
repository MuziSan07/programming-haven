"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

const PREFERRED_VOICES = {
  female: [/aria.*natural/i, /jenny/i, /natural.*female/i, /google us english/i, /samantha/i, /zira/i, /female/i],
  male: [/guy.*natural/i, /davis/i, /natural.*male/i, /google uk english male/i, /david/i, /mark/i, /daniel/i, /male/i],
};

function pickVoice(gender = "female") {
  const voices = window.speechSynthesis?.getVoices() || [];
  const english = voices.filter((v) => v.lang?.startsWith("en"));
  for (const pattern of PREFERRED_VOICES[gender] || PREFERRED_VOICES.female) {
    const v = english.find((voice) => pattern.test(voice.name));
    if (v) return v;
  }
  return english[0] || voices[0] || null;
}

/**
 * Interviewer voice. Tries Groq's neural TTS first, falls back to the browser's speech synthesis.
 * `level` (0–1) drives the avatar's lip-sync.
 */
export function useSpeaker({ voice, gender } = {}) {
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const neuralRef = useRef(true);
  const audioRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(0);
  const resolveRef = useRef(null);

  const finish = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setSpeaking(false);
    setLevel(0);
    resolveRef.current?.();
    resolveRef.current = null;
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    finish();
  }, [finish]);

  const speakBrowser = useCallback((text) => {
    const synth = window.speechSynthesis;
    if (!synth) return finish();
    const utterance = new SpeechSynthesisUtterance(text);
    const picked = pickVoice(gender);
    if (picked) utterance.voice = picked;
    utterance.rate = 1.02;
    utterance.pitch = gender === "male" ? 0.95 : 1.05;
    let boost = 0;
    utterance.onboundary = () => { boost = 1; };
    utterance.onend = finish;
    utterance.onerror = finish;
    const animate = (t) => {
      boost *= 0.9;
      setLevel(Math.min(1, 0.25 + 0.35 * Math.abs(Math.sin(t / 90)) + 0.4 * boost));
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    synth.cancel();
    synth.speak(utterance);
  }, [finish, gender]);

  const speakNeural = useCallback(async (text) => {
    const res = await api("/api/ai/speak", { body: { text, voice }, raw: true });
    const url = URL.createObjectURL(await res.blob());
    const audio = new Audio(url);
    audioRef.current = audio;
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    await ctx.resume().catch(() => {});
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    const data = new Uint8Array(analyser.fftSize);
    const animate = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      rafRef.current = requestAnimationFrame(animate);
    };
    audio.onended = () => { URL.revokeObjectURL(url); finish(); };
    audio.onerror = finish;
    await audio.play();
    animate();
  }, [finish, voice]);

  const speak = useCallback((text) => {
    stop();
    if (muted || !text) return Promise.resolve();
    setSpeaking(true);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      const run = async () => {
        if (neuralRef.current) {
          try {
            await speakNeural(text);
            return;
          } catch {
            neuralRef.current = false; // don't retry the neural voice this session
          }
        }
        speakBrowser(text);
      };
      run();
    });
  }, [muted, stop, speakNeural, speakBrowser]);

  useEffect(() => {
    // Some browsers load voices asynchronously
    window.speechSynthesis?.getVoices();
    return () => {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { speak, stop, speaking, level, muted, setMuted };
}

/** Microphone recorder with a live input level. `stop()` resolves to the recorded Blob. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const ctxRef = useRef(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    streamRef.current = stream;
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m));
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    recorder.start();
    recorderRef.current = recorder;

    ctxRef.current = new AudioContext();
    const analyser = ctxRef.current.createAnalyser();
    ctxRef.current.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 5));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    setRecording(true);
  }, []);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    setRecording(false);
    setLevel(0);
  }, []);

  const stop = useCallback(() => new Promise((resolve) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanup();
      return resolve(null);
    }
    recorder.onstop = () => {
      cleanup();
      resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
    };
    recorder.stop();
  }), [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  return { start, stop, recording, level };
}
