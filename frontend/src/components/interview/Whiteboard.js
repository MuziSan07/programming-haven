"use client";

import dynamic from "next/dynamic";
import { useImperativeHandle, useRef } from "react";
import { Eye } from "lucide-react";
import "@excalidraw/excalidraw/index.css";
import { Spinner } from "@/components/ui";

// Excalidraw touches window/document at import time, so it only ever loads in the browser
const Excalidraw = dynamic(() => import("@excalidraw/excalidraw").then((m) => m.Excalidraw), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
      <Spinner className="size-4" /> Loading whiteboard…
    </div>
  ),
});

const MAX_CHARS = 1_400_000; // the backend rejects frames over ~1.5M chars of base64
const MAX_SIDE = 1400;
const UI_OPTIONS = {
  canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: false },
  tools: { image: false },
};

/**
 * Live system-design whiteboard (Excalidraw). Parent calls `ref.current.capture()` to get a PNG/JPEG
 * data URL of the board (or null when the board is empty) to send with each answer.
 */
export default function Whiteboard({ ref, interviewer = "The interviewer" }) {
  const apiRef = useRef(null);

  useImperativeHandle(ref, () => ({
    async capture() {
      const api = apiRef.current;
      if (!api) return null;
      const elements = api.getSceneElements();
      if (!elements.length) return null;
      const { exportToCanvas } = await import("@excalidraw/excalidraw");
      const canvas = await exportToCanvas({
        elements,
        appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
        files: api.getFiles(),
        maxWidthOrHeight: MAX_SIDE,
        exportPadding: 24,
      });
      let url = canvas.toDataURL("image/png");
      // Fall back to JPEG (white background, no alpha) when the PNG is too heavy
      for (const quality of [0.85, 0.7, 0.55, 0.4]) {
        if (url.length <= MAX_CHARS) break;
        url = canvas.toDataURL("image/jpeg", quality);
      }
      return url.length <= MAX_CHARS ? url : null;
    },
  }), []);

  return (
    <div className="flex h-full min-h-[460px] w-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs">
        <span className="font-semibold tracking-wide text-muted uppercase">Whiteboard</span>
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-ok/15 px-2.5 py-0.5 font-medium text-ok">
          <Eye className="size-3.5" /> {interviewer} can see your board
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <Excalidraw theme="dark" UIOptions={UI_OPTIONS} excalidrawAPI={(api) => { apiRef.current = api; }} />
        </div>
      </div>
    </div>
  );
}
