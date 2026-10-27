"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, CircleCheck, Keyboard, RotateCcw, Trash2, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, CodeBlock, LEVEL_TONE, Markdown, Progress, RichText, cx } from "@/components/ui";

const GRADES = [
  { grade: 0, label: "Again", key: "1", className: "border-bad/40 hover:bg-bad/10 text-bad" },
  { grade: 1, label: "Hard", key: "2", className: "border-warn/40 hover:bg-warn/10 text-warn" },
  { grade: 2, label: "Good", key: "3", className: "border-ok/40 hover:bg-ok/10 text-ok" },
  { grade: 3, label: "Easy", key: "4", className: "border-brand-2/40 hover:bg-brand-2/10 text-brand-2" },
];

function Complete({ stats, onExit }) {
  return (
    <Card className="mx-auto max-w-md animate-pop p-8 text-center">
      <CircleCheck className="mx-auto size-12 text-ok" />
      <h2 className="mt-4 text-xl font-bold">Session complete</h2>
      <p className="mt-1 text-sm text-muted">
        {stats.reviewed} card{stats.reviewed === 1 ? "" : "s"} reviewed
        {stats.again > 0 && `, ${stats.again} marked Again (back in 10 minutes)`}.
      </p>
      <p className="mt-4 flex items-center justify-center gap-1 text-lg font-bold text-brand">
        <Zap className="size-5" /> +{stats.xp} XP
      </p>
      {stats.xp === 0 && stats.reviewed > 0 && <p className="mt-1 text-xs text-faint">Daily review XP cap reached. Reviews still count for your streak.</p>}
      <Button className="mt-6 w-full" onClick={onExit}>Back to overview</Button>
    </Card>
  );
}

/** Run through a queue of due cards: flip, grade (1-4), repeat. */
export default function StudySession({ cards: initialCards, topic, onExit }) {
  const { setUser } = useAuth();
  const [cards, setCards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, again: 0, xp: 0 });

  const card = cards[index];
  const done = index >= cards.length;

  async function grade(g) {
    if (!card || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api(`/api/flashcards/${card.id}/review`, { body: { grade: g } });
      if (r.user) setUser(r.user);
      setStats((s) => ({ reviewed: s.reviewed + 1, again: s.again + (g === 0 ? 1 : 0), xp: s.xp + (r.xp_gained || 0) }));
      setIndex((i) => i + 1);
      setFlipped(false);
      setConfirmDelete(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/flashcards/${card.id}`, { method: "DELETE" });
      setCards((list) => list.filter((c) => c.id !== card.id));
      setFlipped(false);
      setConfirmDelete(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKey(e) {
      if (done || e.target.closest?.("input, textarea, select, button")) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && /^[1-4]$/.test(e.key)) {
        grade(Number(e.key) - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (done) return <Complete stats={stats} onExit={onExit} />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onExit} className="flex items-center gap-1 text-sm text-muted hover:text-text">
          <ChevronLeft className="size-4" /> End session
        </button>
        <span className="text-xs text-faint">{topic || "All topics"}</span>
        <span className="ml-auto text-xs text-muted tabular-nums">{index + 1} / {cards.length}</span>
      </div>
      <Progress value={(100 * index) / cards.length} className="mb-5 h-1.5" />

      <div role="button" tabIndex={0} aria-label={flipped ? "Card back. Press space to show the question" : "Card front. Press space to reveal the answer"}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => { if (e.key === "Enter") setFlipped((f) => !f); }}
        className={cx("card min-h-80 cursor-pointer p-5 transition outline-none focus-visible:ring-2 focus-visible:ring-brand/40 sm:p-7",
          flipped ? "border-brand/40" : "hover:border-faint")}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">{card.topic}</Badge>
          <Badge tone={LEVEL_TONE[card.level]}>{card.level}</Badge>
          {card.lapses > 0 && <Badge tone="bad"><RotateCcw className="size-3" /> {card.lapses} lapse{card.lapses === 1 ? "" : "s"}</Badge>}
          <span className="ml-auto text-[11px] text-faint">{flipped ? "Answer" : "Question"}</span>
        </div>
        <h2 className="mt-4 text-lg leading-snug font-semibold"><RichText text={card.front} /></h2>
        {card.code && <CodeBlock code={card.code} className="mt-4" />}
        {card.options?.length > 0 && !flipped && (
          <ol className="mt-4 space-y-1.5">
            {card.options.map((o, i) => (
              <li key={i} className="flex gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <span className="font-mono text-xs text-faint">{String.fromCharCode(65 + i)}</span><RichText text={o} />
              </li>
            ))}
          </ol>
        )}
        {flipped ? (
          <div className="mt-5 animate-fade-up space-y-4 border-t border-line pt-5">
            <div className="rounded-xl border border-ok/30 bg-ok/5 p-4">
              <p className="mb-1 text-xs font-semibold text-ok">Answer</p>
              <Markdown>{card.back}</Markdown>
            </div>
            {card.explanation && (
              <div className="rounded-xl bg-surface-2 p-4">
                <p className="mb-1 text-xs font-semibold text-warn">Why</p>
                <Markdown>{card.explanation}</Markdown>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-8 text-center text-sm text-faint">Answer it in your head, then click or press Space to flip.</p>
        )}
      </div>

      {flipped && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GRADES.map((g) => (
            <button key={g.grade} disabled={busy} onClick={() => grade(g.grade)}
              className={cx("flex flex-col items-center rounded-xl border bg-surface px-3 py-2.5 transition disabled:opacity-50", g.className)}>
              <span className="text-sm font-semibold">{g.label}</span>
              <span className="text-[11px] text-muted">{card.preview?.[g.grade] ?? card.preview?.[String(g.grade)]}
                <kbd className="ml-1.5 hidden rounded border border-line px-1 font-mono text-[10px] text-faint sm:inline">{g.key}</kbd>
              </span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-bad">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-faint">
        <span className="hidden items-center gap-1.5 sm:flex"><Keyboard className="size-3.5" /> Space flips, 1-4 grades</span>
        <span className="ml-auto">
          {confirmDelete ? (
            <span className="flex items-center gap-2">
              Remove this card from your deck?
              <Button size="sm" variant="danger" onClick={remove} loading={busy}>Delete</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1 hover:text-bad">
              <Trash2 className="size-3.5" /> Delete card
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
