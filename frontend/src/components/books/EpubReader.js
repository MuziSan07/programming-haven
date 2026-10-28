"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, List, Minus, Plus, X } from "lucide-react";
import { Spinner, cx } from "@/components/ui";

const THEMES = {
  dark: { label: "Dark", bg: "#0d1220", fg: "#e2e6f0", link: "#a78bfa" },
  sepia: { label: "Sepia", bg: "#f4ecd8", fg: "#3b2f1e", link: "#8a4b14" },
  light: { label: "Light", bg: "#ffffff", fg: "#1b1b1f", link: "#4f46e5" },
};
const SIZES = [80, 90, 100, 110, 120, 135, 150];

function flatten(items, depth = 0) {
  return items.flatMap((item) => [{ id: item.id, href: item.href, label: item.label.trim(), depth },
    ...flatten(item.subitems || [], depth + 1)]);
}

function readPref(key, fallback, allowed) {
  try {
    const v = localStorage.getItem(key);
    return v !== null && allowed(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

export default function EpubReader({ data, initialLocation, onLocation }) {
  const viewRef = useRef(null);
  const renditionRef = useRef(null);
  const bookRef = useRef(null);
  const onLocationRef = useRef(onLocation);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [toc, setToc] = useState([]);
  const [showToc, setShowToc] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [chapter, setChapter] = useState("");
  const [theme, setTheme] = useState(() => readPref("haven_epub_theme", "dark", (v) => v in THEMES));
  const [size, setSize] = useState(() => Number(readPref("haven_epub_size", "2", (v) => SIZES[Number(v)] !== undefined)));
  const initial = useRef(initialLocation);

  useEffect(() => { onLocationRef.current = onLocation; }, [onLocation]);

  useEffect(() => {
    let destroyed = false;
    let book = null;
    (async () => {
      const { default: ePub } = await import("epubjs");
      book = ePub(data.slice(0));
      bookRef.current = book;
      const rendition = book.renderTo(viewRef.current, {
        width: "100%", height: "100%", flow: "paginated", spread: "auto", minSpreadWidth: 900, allowScriptedContent: false,
      });
      renditionRef.current = rendition;
      Object.entries(THEMES).forEach(([name, t]) => rendition.themes.register(name, {
        body: { background: `${t.bg} !important`, color: `${t.fg} !important`, "line-height": "1.65" },
        "p, li, span, div, h1, h2, h3, h4, td": { color: `${t.fg} !important` },
        a: { color: `${t.link} !important` },
        img: { "max-width": "100% !important" },
      }));
      rendition.themes.select(readPref("haven_epub_theme", "dark", (v) => v in THEMES));
      rendition.themes.fontSize(`${SIZES[Number(readPref("haven_epub_size", "2", (v) => SIZES[Number(v)] !== undefined))]}%`);

      rendition.on("relocated", (loc) => {
        if (destroyed || !loc?.start) return;
        setEdges({ start: Boolean(loc.atStart), end: Boolean(loc.atEnd) });
        const pct = book.locations.length() ? book.locations.percentageFromCfi(loc.start.cfi) * 100 : null;
        if (pct !== null) onLocationRef.current?.(loc.start.cfi, pct);
        const nav = book.navigation?.get(loc.start.href);
        if (nav?.label) setChapter(nav.label.trim());
      });
      const onKey = (e) => {
        if (e.key === "ArrowRight" || e.key === "PageDown") rendition.next();
        if (e.key === "ArrowLeft" || e.key === "PageUp") rendition.prev();
      };
      rendition.on("keyup", onKey);

      await rendition.display(initial.current || undefined).catch(() => rendition.display());
      if (destroyed) return;
      setReady(true);
      book.loaded.navigation.then((nav) => { if (!destroyed) setToc(flatten(nav.toc || [])); });
      // Percentages need generated locations; that walks the whole book, so do it after the first page shows.
      await book.locations.generate(1600);
      const loc = rendition.currentLocation();
      if (!destroyed && loc?.start) onLocationRef.current?.(loc.start.cfi, book.locations.percentageFromCfi(loc.start.cfi) * 100);
    })().catch((err) => { if (!destroyed) setError(err?.message || "This EPUB couldn't be opened."); });
    return () => {
      destroyed = true;
      renditionRef.current = null;
      bookRef.current = null;
      book?.destroy();
    };
  }, [data]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") renditionRef.current?.next();
      if (e.key === "ArrowLeft" || e.key === "PageUp") renditionRef.current?.prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function chooseTheme(name) {
    setTheme(name);
    writePref("haven_epub_theme", name);
    renditionRef.current?.themes.select(name);
  }

  function changeSize(delta) {
    const next = Math.min(SIZES.length - 1, Math.max(0, size + delta));
    setSize(next);
    writePref("haven_epub_size", String(next));
    renditionRef.current?.themes.fontSize(`${SIZES[next]}%`);
  }

  function jump(href) {
    setShowToc(false);
    renditionRef.current?.display(href);
  }

  if (error) return <p className="m-auto max-w-sm p-8 text-center text-sm text-bad">{error}</p>;
  const t = THEMES[theme];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1" style={{ background: t.bg }}>
        {!ready && <div className="absolute inset-0 z-10 flex items-center justify-center"><Spinner className="size-6" /></div>}
        <button onClick={() => renditionRef.current?.prev()} disabled={edges.start} aria-label="Previous page"
          className="absolute inset-y-0 left-0 z-10 hidden w-14 items-center justify-center opacity-40 transition hover:opacity-100 disabled:hidden sm:flex"
          style={{ color: t.fg }}><ChevronLeft className="size-6" /></button>
        <div ref={viewRef} className="mx-auto h-full w-full max-w-5xl px-2 py-4 sm:px-16 sm:py-6" />
        <button onClick={() => renditionRef.current?.next()} disabled={edges.end} aria-label="Next page"
          className="absolute inset-y-0 right-0 z-10 hidden w-14 items-center justify-center opacity-40 transition hover:opacity-100 disabled:hidden sm:flex"
          style={{ color: t.fg }}><ChevronRight className="size-6" /></button>
      </div>

      {showToc && (
        <div className="absolute inset-x-0 top-0 bottom-[49px] z-20 flex">
          <div className="w-full max-w-sm overflow-y-auto border-r border-line bg-surface p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between px-2">
              <p className="text-sm font-semibold">Contents</p>
              <button onClick={() => setShowToc(false)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"><X className="size-4" /></button>
            </div>
            {toc.length ? toc.map((item) => (
              <button key={`${item.id}-${item.href}`} onClick={() => jump(item.href)}
                className={cx("block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-muted hover:bg-surface-2 hover:text-text",
                  item.label === chapter && "text-brand")}
                style={{ paddingLeft: `${8 + item.depth * 14}px` }}>{item.label}</button>
            )) : <p className="px-2 text-xs text-faint">This book has no table of contents.</p>}
          </div>
          <button aria-label="Close contents" className="flex-1 bg-black/40" onClick={() => setShowToc(false)} />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line bg-surface px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button onClick={() => setShowToc((v) => !v)} title="Contents"
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text"><List className="size-4" /></button>
          <p className="hidden truncate text-xs text-muted sm:block">{chapter}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => renditionRef.current?.prev()} disabled={edges.start} title="Previous page"
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40 sm:hidden"><ChevronLeft className="size-5" /></button>
          <button onClick={() => changeSize(-1)} disabled={size === 0} title="Smaller text"
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"><Minus className="size-4" /></button>
          <span className="w-10 text-center text-xs text-muted tabular-nums">{SIZES[size]}%</span>
          <button onClick={() => changeSize(1)} disabled={size === SIZES.length - 1} title="Larger text"
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"><Plus className="size-4" /></button>
          <div className="ml-1 flex rounded-lg border border-line p-0.5">
            {Object.entries(THEMES).map(([name, th]) => (
              <button key={name} onClick={() => chooseTheme(name)} title={`${th.label} theme`}
                className={cx("size-6 rounded-md border-2", theme === name ? "border-brand" : "border-transparent")}
                style={{ background: th.bg }} />
            ))}
          </div>
          <button onClick={() => renditionRef.current?.next()} disabled={edges.end} title="Next page"
            className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40 sm:hidden"><ChevronRight className="size-5" /></button>
        </div>
      </div>
    </div>
  );
}
