"use client";

import { useState } from "react";
import { BookOpen, Brain, CalendarDays, Flame, Layers, Library, Play, Plus, Target } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Button, Card, ErrorState, PageHeader, PageLoader, cx } from "@/components/ui";
import StudySession from "@/components/flashcards/StudySession";

const LEVELS = ["Basic", "Intermediate", "Advanced", "Expert"];

function Stat({ icon: Icon, label, value, color }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        <Icon className="size-4" style={{ color }} />
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}

function Forecast({ forecast }) {
  const max = Math.max(1, ...forecast.map((d) => d.count));
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4 text-brand-2" /> Next 7 days</h2>
      <div className="mt-4 flex h-28 items-end gap-2">
        {forecast.map((d, i) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.count} due`}>
            <span className="text-[10px] text-muted tabular-nums">{d.count}</span>
            <div className={cx("w-full rounded-t-md", i === 0 ? "bg-brand" : "bg-brand/50")}
              style={{ height: `${Math.max(3, (d.count / max) * 72)}px` }} />
            <span className="text-[10px] text-faint">
              {i === 0 ? "Today" : new Date(d.date + "T00:00").toLocaleDateString(undefined, { weekday: "short" })}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AddDeck({ topics, onAdded }) {
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("");
  const [count, setCount] = useState(20);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function add(e) {
    e.preventDefault();
    if (!topic) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await api("/api/flashcards/topic", { body: { topic, level: level || null, count: Number(count) || 20 } });
      setMessage({ ok: true, text: `Added ${r.added} card${r.added === 1 ? "" : "s"} from ${topic}. They are due now.` });
      onAdded();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Plus className="size-4 text-brand" /> Add a deck</h2>
      <p className="mt-1 text-xs text-muted">Pull questions from the Question Bank into your review queue, easiest first.</p>
      <form onSubmit={add} className="mt-4 space-y-3">
        <div>
          <label htmlFor="deck-topic" className="label">Topic</label>
          <select id="deck-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="input">
            <option value="">Choose a topic…</option>
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="deck-level" className="label">Level</label>
            <select id="deck-level" value={level} onChange={(e) => setLevel(e.target.value)} className="input">
              <option value="">Any</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="deck-count" className="label">Cards</label>
            <input id="deck-count" type="number" min={1} max={100} value={count}
              onChange={(e) => setCount(e.target.value)} className="input" />
          </div>
        </div>
        <Button type="submit" className="w-full" loading={busy} disabled={!topic}>Add cards</Button>
        {message && <p className={cx("text-xs", message.ok ? "text-ok" : "text-bad")}>{message.text}</p>}
      </form>
    </Card>
  );
}

export default function FlashcardsPage() {
  const { data, error, loading, reload } = useApi("/api/flashcards/stats");
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(null);
  const [startError, setStartError] = useState("");

  async function start(topic = "") {
    setStarting(topic || "all");
    setStartError("");
    try {
      const r = await api(`/api/flashcards/due?limit=50${topic ? `&topic=${encodeURIComponent(topic)}` : ""}`);
      if (!r.cards.length) setStartError(topic ? `Nothing due in ${topic} right now.` : "Nothing is due right now. Add a deck or come back later.");
      else setSession({ cards: r.cards, topic, key: Date.now() });
    } catch (err) {
      setStartError(err.message);
    } finally {
      setStarting(null);
    }
  }

  if (session) {
    return (
      <div className="animate-fade-up">
        <StudySession key={session.key} cards={session.cards} topic={session.topic}
          onExit={() => { setSession(null); reload(); }} />
      </div>
    );
  }

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <PageHeader eyebrow="Flashcards" title="Spaced repetition"
        description="Short daily reviews beat cramming before a screening. Cards come back just before you would forget them: missed ones in minutes, known ones in days or weeks."
        actions={
          <Button onClick={() => start()} loading={starting === "all"} disabled={!data.due}>
            <Play className="size-4" /> Study {data.due > 0 ? `${data.due} due` : ""}
          </Button>
        } />

      {startError && <p className="mb-4 text-sm text-warn">{startError}</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={Target} label="Due now" value={data.due} color="var(--color-brand)" />
        <Stat icon={Plus} label="New" value={data.new} color="var(--color-brand-2)" />
        <Stat icon={Brain} label="Learning" value={data.learning} color="var(--color-warn)" />
        <Stat icon={Library} label="Mature" value={data.mature} color="var(--color-ok)" />
        <Stat icon={Flame} label="Review streak" value={`${data.review_streak}d`} color="var(--color-warn)" />
        <Stat icon={BookOpen} label="Reviewed today" value={data.reviewed_today} color="var(--color-muted)" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Forecast forecast={data.forecast} />
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Layers className="size-4 text-brand" /> Your decks</h2>
              <span className="text-xs text-faint">{data.total} cards</span>
            </div>
            {data.topics.length === 0 ? (
              <div className="p-8 text-center">
                <Layers className="mx-auto size-9 text-faint" />
                <p className="mt-3 text-sm font-semibold">No cards yet</p>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
                  Add a deck from any topic, or just practise in the Question Bank: every question you get wrong is added here automatically.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {data.topics.map((t) => (
                  <li key={t.topic} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.topic}</p>
                      <p className="text-xs text-faint">{t.total} cards · {t.mature} mature</p>
                    </div>
                    <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
                      t.due ? "bg-brand/15 text-[#b4a3ff]" : "bg-surface-3 text-faint")}>{t.due} due</span>
                    <Button size="sm" variant="secondary" disabled={!t.due} loading={starting === t.topic}
                      onClick={() => start(t.topic)} aria-label={`Study ${t.topic}`}>
                      <Play className="size-3.5" /> <span className="hidden sm:inline">Study</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <AddDeck topics={data.available_topics} onAdded={reload} />
          <Card className="p-5 text-xs text-muted">
            <p className="mb-1 text-sm font-semibold text-text">How it works</p>
            <p>Wrong answers in the Question Bank are added to your deck automatically. Grade each card honestly:
              <span className="text-bad"> Again</span> brings it back in 10 minutes,
              <span className="text-warn"> Hard</span>, <span className="text-ok">Good</span> and
              <span className="text-brand-2"> Easy</span> push it out further each time you remember it.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
