// Copies the MediaPipe WASM runtime and downloads the face-detection model into
// public/mediapipe so proctoring works without third-party CDNs at runtime.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "public", "mediapipe");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const modelPath = join(target, "blaze_face_short_range.tflite");

mkdirSync(target, { recursive: true });
cpSync(join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm"), join(target, "wasm"), { recursive: true });

if (!existsSync(modelPath)) {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
    console.log("Downloaded face detection model");
  } catch (err) {
    console.warn(`Could not download face model (${err.message}); proctoring will fall back to the CDN.`);
  }
}
console.log("Proctoring assets ready in public/mediapipe");
