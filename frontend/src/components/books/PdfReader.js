"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Spinner } from "@/components/ui";

const ZOOMS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
const MAX_PAGE_WIDTH = 980;

export default function PdfReader({ data, initialLocation, onLocation }) {
  const scrollRef = useRef(null);
  const canvasRef = useRef(null);
  const onLocationRef = useRef(onLocation);
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(() => Math.max(1, Number.parseInt(initialLocation, 10) || 1));
  const [pageInput, setPageInput] = useState("");
  const [zoom, setZoom] = useState(3);
  const [width, setWidth] = useState(0);

  useEffect(() => { onLocationRef.current = onLocation; }, [onLocation]);

  // Load the document once. pdf.js transfers the buffer to its worker, so hand it a copy.
  useEffect(() => {
    let destroyed = false;
    let task = null;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
      const loaded = await task.promise;
      if (destroyed) return;
      setDoc(loaded);
      setPage((p) => Math.min(p, loaded.numPages));
    })().catch((err) => { if (!destroyed) setError(err?.message || "This PDF couldn't be opened."); });
    return () => {
      destroyed = true;
      task?.destroy();
    };
  }, [data]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Render the current page to the canvas at the device pixel ratio.
  useEffect(() => {
    if (!doc || !width) return undefined;
    let cancelled = false;
    let task = null;
    doc.getPage(page).then((p) => {
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const fit = (Math.min(width - 32, MAX_PAGE_WIDTH) / base.width) * ZOOMS[zoom];
      const viewport = p.getViewport({ scale: Math.max(0.2, fit) });
      const dpr = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      task = p.render({ canvas, canvasContext: canvas.getContext("2d"), viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] });
      return task.promise;
    }).catch((err) => {
      if (!cancelled && err?.name !== "RenderingCancelledException") setError(err?.message || "This page couldn't be drawn.");
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, width, zoom]);

  useEffect(() => {
    if (!doc) return;
    scrollRef.current?.scrollTo({ top: 0 });
    onLocationRef.current?.(String(page), (100 * page) / doc.numPages);
  }, [doc, page]);

  const total = doc?.numPages || 0;
  const go = (n) => {
    if (!total) return;
    const next = Math.min(total, Math.max(1, n));
    if (next !== page) setPage(next);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(page + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (error) return <p className="m-auto max-w-sm p-8 text-center text-sm text-bad">{error}</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto bg-[#0a0e18] p-4">
        {!doc && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><Spinner className="size-6" /></div>
        )}
        <canvas ref={canvasRef} className="mx-auto block rounded-sm bg-white shadow-2xl shadow-black/50" />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line bg-surface px-3 py-2">
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} title="Zoom out"
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"><ZoomOut className="size-4" /></button>
          <button onClick={() => setZoom(3)} className="w-12 rounded-lg py-1 text-xs tabular-nums text-muted hover:bg-surface-2 hover:text-text" title="Fit width">
            {Math.round(ZOOMS[zoom] * 100)}%
          </button>
          <button onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1} title="Zoom in"
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"><ZoomIn className="size-4" /></button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => go(page - 1)} disabled={page <= 1} title="Previous page"
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"><ChevronLeft className="size-5" /></button>
          <form onSubmit={(e) => { e.preventDefault(); go(Number.parseInt(pageInput, 10) || page); setPageInput(""); }}
            className="flex items-center gap-1.5 text-xs text-muted">
            <input value={pageInput} onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))} placeholder={String(page)}
              inputMode="numeric" aria-label="Go to page"
              className="h-8 w-12 rounded-lg border border-line bg-surface-2 text-center text-xs text-text tabular-nums outline-none placeholder:text-text focus:border-brand" />
            <span className="tabular-nums">of {total || "…"}</span>
          </form>
          <button onClick={() => go(page + 1)} disabled={!total || page >= total} title="Next page"
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"><ChevronRight className="size-5" /></button>
        </div>
      </div>
    </div>
  );
}
