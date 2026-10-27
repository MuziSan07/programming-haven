"use client";

import { useRef, useState } from "react";
import { FileUp, History, ScanSearch, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Button, Card, PageHeader, cx, scoreColor } from "@/components/ui";
import ReviewResult, { KIND_META, ReviewLoading } from "@/components/career/ReviewResult";

const TABS = [
  { id: "cv", label: "Resume" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "github", label: "GitHub" },
];
const MAX_UPLOAD = 5 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.txt,.md";
const FALLBACK_TARGETS = [{ id: "remote", label: "Remote US/UK/EU jobs" }];

function FileDrop({ file, onFile, disabled }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled && e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
      className={cx("rounded-2xl border-2 border-dashed p-5 text-center transition",
        over ? "border-brand bg-brand/5" : "border-line bg-surface-2")}>
      <input ref={input} type="file" accept={ACCEPT} className="hidden" disabled={disabled}
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ""; }} />
      {file ? (
        <div className="flex items-center gap-3 text-left">
          <FileUp className="size-5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-faint">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button type="button" onClick={() => onFile(null)} disabled={disabled} aria-label="Remove file"
            className="rounded-lg p-1 text-faint hover:bg-surface-3 hover:text-text">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={disabled}
          className="flex w-full flex-col items-center gap-2 py-3">
          <FileUp className="size-7 text-brand" />
          <span className="text-sm font-medium">Drop your resume here or browse</span>
          <span className="text-xs text-faint">PDF, DOCX or TXT, up to 5 MB. Scanned image PDFs can&apos;t be read.</span>
        </button>
      )}
    </div>
  );
}

export default function CareerPage() {
  const { data: targetsData } = useApi("/api/coach/targets");
  const reviewsApi = useApi("/api/career/reviews");
  const targets = targetsData?.length ? targetsData : FALLBACK_TARGETS;

  const [tab, setTab] = useState("cv");
  const [target, setTarget] = useState("remote");
  const [file, setFile] = useState(null);
  const [linkedin, setLinkedin] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(null); // kind being reviewed
  const [loadingId, setLoadingId] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const targetLabel = (id) => targets.find((t) => t.id === id)?.label || id;

  function pickFile(f) {
    setError("");
    if (f && f.size > MAX_UPLOAD) {
      setError("That file is larger than 5 MB.");
      return;
    }
    setFile(f);
  }

  const canSubmit = tab === "cv" ? Boolean(file) : tab === "linkedin" ? linkedin.trim().length >= 80 : username.trim().length > 0;

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(tab);
    setError("");
    setResult(null);
    try {
      let res;
      if (tab === "cv") {
        const form = new FormData();
        form.append("file", file);
        form.append("target", target);
        res = await api("/api/career/review/cv", { form });
      } else if (tab === "linkedin") {
        res = await api("/api/career/review/linkedin", { body: { text: linkedin, target } });
      } else {
        res = await api("/api/career/review/github", { body: { username: username.trim(), target } });
      }
      setResult(res);
      reviewsApi.setData((h) => ({ reviews: [res, ...(h?.reviews || [])].slice(0, 30) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function openReview(id) {
    if (busy) return;
    setLoadingId(id);
    setError("");
    try {
      setResult(await api(`/api/career/reviews/${id}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingId(null);
    }
  }

  const reviews = reviewsApi.data?.reviews || [];

  return (
    <div className="mx-auto max-w-7xl animate-fade-up">
      <PageHeader eyebrow="Profile Review" title="Get past the profile screen"
        description="Recruiters at Toptal, Turing, Lemon.io and remote US/UK/EU companies decide in seconds. Get a scored review of your resume, LinkedIn or GitHub with prioritised fixes and rewrites of your weakest lines." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="p-5">
            <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
              {TABS.map((t) => {
                const Icon = KIND_META[t.id].icon;
                return (
                  <button key={t.id} type="button" onClick={() => { setTab(t.id); setError(""); }} disabled={Boolean(busy)}
                    className={cx("flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition sm:text-sm",
                      tab === t.id ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text")}>
                    <Icon className="size-4" /> {t.label}
                  </button>
                );
              })}
            </div>

            <form onSubmit={submit} className="flex flex-col gap-4">
              <div>
                <label className="label" htmlFor="target">Applying to</label>
                <select id="target" className="input" value={target} onChange={(e) => setTarget(e.target.value)} disabled={Boolean(busy)}>
                  {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>

              {tab === "cv" && <FileDrop file={file} onFile={pickFile} disabled={Boolean(busy)} />}

              {tab === "linkedin" && (
                <div>
                  <label className="label" htmlFor="linkedin">Profile text</label>
                  <textarea id="linkedin" className="input min-h-56 resize-y text-sm leading-relaxed" value={linkedin}
                    onChange={(e) => setLinkedin(e.target.value)} disabled={Boolean(busy)} maxLength={20000}
                    placeholder="Paste your headline, About section and experience entries, exactly as they appear on LinkedIn." />
                  <p className={cx("mt-1 text-right text-xs", linkedin.trim().length >= 80 ? "text-faint" : "text-warn")}>
                    {linkedin.trim().length < 80 ? `${80 - linkedin.trim().length} more characters needed` : `${linkedin.length.toLocaleString()} characters`}
                  </p>
                </div>
              )}

              {tab === "github" && (
                <div>
                  <label className="label" htmlFor="gh">GitHub username</label>
                  <div className="flex items-center rounded-xl border border-line bg-surface-2 focus-within:border-brand">
                    <span className="pl-3 text-sm text-faint">github.com/</span>
                    <input id="gh" className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-sm outline-none" value={username}
                      onChange={(e) => setUsername(e.target.value)} disabled={Boolean(busy)} maxLength={60}
                      placeholder="octocat" autoComplete="off" spellCheck={false} />
                  </div>
                  <p className="mt-1.5 text-xs text-faint">Only public data is read: bio, repositories, languages and activity.</p>
                </div>
              )}

              {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

              <Button type="submit" loading={Boolean(busy)} disabled={!canSubmit} className="w-full">
                {busy ? "Reviewing" : <><ScanSearch className="size-4" /> Review my {TABS.find((t) => t.id === tab).label}</>}
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-muted" /> Past reviews</h2>
            {reviewsApi.loading ? (
              <p className="py-4 text-center text-xs text-faint">Loading…</p>
            ) : reviewsApi.error ? (
              <p className="py-4 text-center text-xs text-bad">{reviewsApi.error.message}</p>
            ) : reviews.length === 0 ? (
              <p className="py-4 text-center text-xs text-faint">Your reviews will appear here so you can track your score as you improve.</p>
            ) : (
              <ul className="-mx-2 max-h-96 overflow-y-auto">
                {reviews.map((r) => {
                  const Icon = (KIND_META[r.kind] || KIND_META.cv).icon;
                  return (
                    <li key={r.id}>
                      <button type="button" onClick={() => openReview(r.id)} disabled={Boolean(busy)}
                        className={cx("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-surface-2",
                          result?.id === r.id && "bg-brand/10")}>
                        <Icon className="size-4 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{r.source}</span>
                          <span className="block truncate text-[11px] text-faint">
                            {targetLabel(r.target)} · {new Date(r.created_at).toLocaleDateString()}
                          </span>
                        </span>
                        {loadingId === r.id ? (
                          <span className="text-xs text-faint">…</span>
                        ) : (
                          <span className="text-sm font-semibold tabular-nums" style={{ color: scoreColor(r.score) }}>{r.score}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0">
          {busy ? (
            <ReviewLoading kind={busy} />
          ) : result ? (
            <ReviewResult key={result.id} result={result} targetLabel={targetLabel(result.target)} />
          ) : (
            <Card className="flex min-h-96 flex-col items-center justify-center gap-3 p-8 text-center">
              <ScanSearch className="size-10 text-brand" />
              <p className="font-semibold">See your profile the way a screener does</p>
              <p className="max-w-md text-sm text-muted">
                You get a pass-likelihood score, section-by-section feedback, fixes ranked by impact, before and after
                rewrites and the keywords you are missing for the network you pick.
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {TABS.map((t) => <Badge key={t.id}>{t.label}</Badge>)}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
