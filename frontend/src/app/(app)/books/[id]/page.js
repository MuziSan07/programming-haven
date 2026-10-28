"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, CircleCheck, LoaderCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ErrorState, PageLoader, Spinner } from "@/components/ui";
import EpubReader from "@/components/books/EpubReader";
import PdfReader from "@/components/books/PdfReader";
import { formatSize } from "@/components/books/shared";

const SAVE_DELAY = 1200;

/** Download the book with the auth header, reporting progress. */
function useBookFile(id) {
  const [state, setState] = useState({ data: null, received: 0, total: 0, error: null });
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const res = await api(`/api/books/${id}/file`, { raw: true, signal: controller.signal });
      const total = Number(res.headers.get("content-length")) || 0;
      if (!res.body) {
        const buf = await res.arrayBuffer();
        setState({ data: buf, received: buf.byteLength, total, error: null });
        return;
      }
      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        setState((s) => ({ ...s, received, total }));
      }
      const out = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) { out.set(c, offset); offset += c.length; }
      setState({ data: out.buffer, received, total, error: null });
    })().catch((error) => { if (error.name !== "AbortError") setState((s) => ({ ...s, error })); });
    return () => controller.abort();
  }, [id]);
  return state;
}

export default function ReaderPage() {
  const { id } = useParams();
  const { data: book, error, loading, reload } = useApi(`/api/books/${id}`);
  const file = useBookFile(id);
  const [percent, setPercent] = useState(null);
  const [saved, setSaved] = useState("idle");
  const pending = useRef(null);
  const timer = useRef(null);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const body = pending.current;
    if (!body) return;
    pending.current = null;
    setSaved("saving");
    api(`/api/books/${id}/progress`, { method: "PUT", body })
      .then(() => setSaved("saved"))
      .catch(() => setSaved("idle"));
  }, [id]);

  const onLocation = useCallback((location, pct) => {
    const value = Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
    setPercent(value);
    pending.current = { location: String(location).slice(0, 500), percent: value };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }, [flush]);

  // Save the latest position when leaving the reader
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const shown = percent ?? book.progress?.percent ?? 0;
  const Reader = book.format === "epub" ? EpubReader : PdfReader;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2.5">
        <Link href="/books" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label="Back to the library">
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{book.title}</p>
          {book.author && <p className="truncate text-[11px] text-faint">{book.author}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
          <span className="hidden items-center gap-1 sm:flex">
            {saved === "saving" && <><LoaderCircle className="size-3 animate-spin" /> Saving</>}
            {saved === "saved" && <><CircleCheck className="size-3 text-ok" /> Place saved</>}
          </span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-3 sm:w-28">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${shown}%` }} />
            </div>
            <span className="w-9 text-right tabular-nums">{Math.round(shown)}%</span>
          </div>
        </div>
      </header>

      {file.error ? (
        <ErrorState error={file.error} />
      ) : !file.data ? (
        <div className="m-auto flex flex-col items-center gap-3 text-sm text-muted">
          <Spinner className="size-7" />
          <p>Opening the book…</p>
          {file.total > 0 && (
            <div className="w-56">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(100 * file.received) / file.total}%` }} />
              </div>
              <p className="mt-1 text-center text-[11px] text-faint tabular-nums">{formatSize(file.received)} of {formatSize(file.total)}</p>
            </div>
          )}
        </div>
      ) : (
        <Reader data={file.data} initialLocation={book.progress?.location} onLocation={onLocation} />
      )}
    </div>
  );
}
