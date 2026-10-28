import { API_URL } from "@/lib/api";
import { cx } from "@/components/ui";

const COVER_TONES = [
  ["#1e2a4a", "#7c5cff"], ["#14313a", "#22d3ee"], ["#2b1f3d", "#c084fc"], ["#3a2416", "#f59e0b"],
  ["#13301f", "#22c55e"], ["#3a1a22", "#f43f5e"], ["#1f2937", "#94a3b8"],
];

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function formatSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** The uploaded cover, or a typographic cover generated from the title when there isn't one. */
export function BookCover({ book, className }) {
  if (book.cover_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`${API_URL}${book.cover_url}`} alt="" loading="lazy"
        className={cx("aspect-[2/3] w-full rounded-lg border border-line bg-surface-2 object-cover", className)} />
    );
  }
  const [bg, accent] = COVER_TONES[hash(book.title) % COVER_TONES.length];
  return (
    <div className={cx("relative flex aspect-[2/3] w-full flex-col overflow-hidden rounded-lg border border-line p-3", className)}
      style={{ background: bg }}>
      <span className="h-1 w-8 rounded-full" style={{ background: accent }} />
      <p className="mt-3 line-clamp-5 text-[13px] leading-snug font-semibold text-white/90">{book.title}</p>
      {book.author && <p className="mt-auto line-clamp-2 text-[10px] text-white/55">{book.author}</p>}
      <span className="absolute right-2 bottom-2 text-[9px] font-semibold tracking-wider text-white/40 uppercase">{book.format}</span>
    </div>
  );
}
