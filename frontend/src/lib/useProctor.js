"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const LOCAL_WASM = "/mediapipe/wasm";
const LOCAL_MODEL = "/mediapipe/blaze_face_short_range.tflite";
const CDN_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const CDN_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

const CHECK_MS = 1000;
const NO_FACE_CHECKS = 3; // consecutive misses before flagging

export const VIOLATION_TEXT = {
  tab_switch: "You left the test tab",
  window_blur: "The test window lost focus",
  fullscreen_exit: "You exited fullscreen",
  paste: "Pasting is monitored",
  copy: "Copying is monitored",
  no_face: "We can't see your face",
  multiple_faces: "More than one person detected",
  camera_off: "Your camera turned off",
  right_click: "Right-click is disabled",
};

async function createDetector() {
  const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const attempts = [[LOCAL_WASM, LOCAL_MODEL], [CDN_WASM, CDN_MODEL]];
  for (const [wasm, model] of attempts) {
    for (const delegate of ["GPU", "CPU"]) {
      try {
        const fileset = await FilesetResolver.forVisionTasks(wasm);
        return await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: model, delegate },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5,
        });
      } catch {
        // try the next delegate / source
      }
    }
  }
  throw new Error("Face detection could not start");
}

/**
 * Browser proctoring: webcam face detection + focus, fullscreen and clipboard monitoring.
 * Camera starts with `startCamera()`; events are only recorded while `active` is true.
 */
export function useProctor({ active }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const startRef = useRef(0);
  const activeRef = useRef(active);
  const missesRef = useRef(0);
  const episodeRef = useRef({ no_face: false, multiple_faces: false });
  const lastEventRef = useRef({});

  const [violations, setViolations] = useState([]);
  const [warning, setWarning] = useState(null);
  const [camera, setCamera] = useState("idle"); // idle | starting | on | denied | error
  const [faces, setFaces] = useState(null);
  const [detectorReady, setDetectorReady] = useState(false);

  useEffect(() => {
    activeRef.current = active;
    if (active && !startRef.current) startRef.current = performance.now();
  }, [active]);

  const record = useCallback((type, detail = "") => {
    if (!activeRef.current) return;
    const now = performance.now();
    // De-duplicate bursts (e.g. blur + visibilitychange fire together)
    if (now - (lastEventRef.current[type] || 0) < 1500) return;
    lastEventRef.current[type] = now;
    const at = Math.round((now - startRef.current) / 100) / 10;
    setViolations((v) => [...v, { type, at, detail }]);
    setWarning({ type, text: VIOLATION_TEXT[type] || type, id: now });
  }, []);

  const startCamera = useCallback(async () => {
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        setCamera("error");
        record("camera_off");
      });
      setCamera("on");
      if (!detectorRef.current) {
        createDetector()
          .then((d) => { detectorRef.current = d; setDetectorReady(true); })
          .catch(() => setDetectorReady(false));
      }
    } catch (err) {
      setCamera(err?.name === "NotAllowedError" ? "denied" : "error");
    }
  }, [record]);

  // Re-attach the stream when the <video> element remounts (pre-check → test screen)
  const attachVideo = useCallback((el) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  // Face detection loop
  useEffect(() => {
    if (camera !== "on" || !detectorReady) return;
    const id = setInterval(() => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < 2) return;
      let count;
      try {
        count = detector.detectForVideo(video, performance.now()).detections.length;
      } catch {
        return;
      }
      setFaces(count);
      if (count === 0) {
        missesRef.current += 1;
        if (missesRef.current >= NO_FACE_CHECKS && !episodeRef.current.no_face) {
          episodeRef.current.no_face = true;
          record("no_face");
        }
      } else {
        missesRef.current = 0;
        episodeRef.current.no_face = false;
      }
      if (count > 1 && !episodeRef.current.multiple_faces) {
        episodeRef.current.multiple_faces = true;
        record("multiple_faces", `${count} faces`);
      } else if (count <= 1) {
        episodeRef.current.multiple_faces = false;
      }
    }, CHECK_MS);
    return () => clearInterval(id);
  }, [camera, detectorReady, record]);

  // Browser event monitoring
  useEffect(() => {
    if (!active) return;
    const onVisibility = () => document.hidden && record("tab_switch");
    const onBlur = () => !document.hidden && record("window_blur");
    const onFullscreen = () => !document.fullscreenElement && record("fullscreen_exit");
    const onPaste = () => record("paste");
    const onCopy = () => record("copy");
    const onContext = (e) => { e.preventDefault(); record("right_click"); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("contextmenu", onContext);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("contextmenu", onContext);
    };
  }, [active, record]);

  // Auto-hide the warning toast
  useEffect(() => {
    if (!warning) return;
    const id = setTimeout(() => setWarning(null), 4000);
    return () => clearTimeout(id);
  }, [warning]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  useEffect(() => stop, [stop]);

  const enterFullscreen = useCallback(() => document.documentElement.requestFullscreen?.().catch(() => {}), []);

  return { attachVideo, violations, warning, camera, faces, detectorReady, startCamera, enterFullscreen, stop };
}
