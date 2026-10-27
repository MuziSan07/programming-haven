"use client";

import { useState } from "react";
import { CircleCheck, CircleX, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, RichText, cx } from "@/components/ui";
import { SEVERITIES, SEVERITY_TONE } from "./shared";

/** Inline comment editor (new or edit). */
export function CommentBox({ initial, onSave, onCancel, line }) {
  const [body, setBody] = useState(initial?.body || "");
  const [severity, setSeverity] = useState(initial?.severity || "");
  return (
    <div className="rounded-xl border border-brand/40 bg-surface p-3 font-sans">
      <label className="sr-only" htmlFor={`comment-${line}`}>Comment on line {line}</label>
      <textarea id={`comment-${line}`} autoFocus value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) onSave({ body: body.trim(), severity: severity || null });
        }}
        placeholder="What is wrong, why it matters, and how to fix it…"
        className="input min-h-24 resize-y text-[13px] leading-relaxed" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity"
          className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs">
          <option value="">No severity</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <span className="hidden text-[11px] text-faint sm:inline">Ctrl+Enter to save</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={!body.trim()} onClick={() => onSave({ body: body.trim(), severity: severity || null })}>
            {initial ? "Update" : "Add comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SeverityBadge({ severity }) {
  if (!severity) return null;
  return <Badge tone={SEVERITY_TONE[severity]} className="capitalize">{severity}</Badge>;
}

function CommentView({ comment, onEdit, onDelete, locked }) {
  return (
    <div id={`c-${comment.id}`} className="rounded-xl border border-line bg-surface p-3 font-sans">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted">
        <MessageSquare className="size-3.5 text-brand-2" /> Your comment
        <SeverityBadge severity={comment.severity} />
        {!locked && (
          <span className="ml-auto flex gap-1">
            <button onClick={onEdit} aria-label="Edit comment" className="rounded-md p-1 hover:bg-surface-2 hover:text-text">
              <Pencil className="size-3.5" />
            </button>
            <button onClick={onDelete} aria-label="Delete comment" className="rounded-md p-1 hover:bg-bad/15 hover:text-bad">
              <Trash2 className="size-3.5" />
            </button>
          </span>
        )}
      </div>
      <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-text/90">{comment.body}</p>
    </div>
  );
}

function IssueMarker({ issue }) {
  return (
    <div className={cx("rounded-xl border p-3 font-sans text-[13px]",
      issue.found ? "border-ok/40 bg-ok/5" : "border-bad/40 bg-bad/5")}>
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        {issue.found ? <CircleCheck className="size-4 text-ok" /> : <CircleX className="size-4 text-bad" />}
        <span className={cx("font-semibold", issue.found ? "text-ok" : "text-bad")}>{issue.found ? "Found" : "Missed"}</span>
        <SeverityBadge severity={issue.severity} />
        <Badge className="capitalize">{issue.category}</Badge>
      </div>
      <p className="text-text/90"><RichText text={issue.description} /></p>
      {issue.fix && <p className="mt-1 text-muted"><span className="font-medium text-text">Fix: </span><RichText text={issue.fix} /></p>}
    </div>
  );
}

/**
 * GitHub-PR style file view: line numbers, a "+" to comment on any line, inline comments and,
 * after grading, inline markers for each planted issue.
 */
export default function ReviewCode({ file, code, comments, issues, draft, setDraft, onSave, onDelete, locked }) {
  const lines = code.split("\n");
  const byLine = {};
  for (const c of comments) (byLine[c.line] ||= []).push(c);
  const issuesByLine = {};
  for (const x of issues || []) (issuesByLine[x.line] ||= []).push(x);

  return (
    <div className="overflow-x-auto rounded-b-xl border border-t-0 border-line bg-bg">
      <div className="min-w-max font-mono text-[12.5px] leading-6">
        {lines.map((text, i) => {
          const n = i + 1;
          const lineComments = byLine[n] || [];
          const lineIssues = issuesByLine[n] || [];
          const isDraft = draft && draft.file === file && draft.line === n;
          const flagged = lineIssues.length > 0;
          return (
            <div key={n} id={`line-${file}-${n}`} className="scroll-mt-24">
              <div className={cx("group flex",
                flagged ? (lineIssues.every((x) => x.found) ? "bg-ok/10" : "bg-bad/10")
                  : isDraft || lineComments.length ? "bg-brand/10" : "hover:bg-surface")}>
                <button type="button" disabled={locked}
                  onClick={() => setDraft({ file, line: n, editId: null })}
                  aria-label={`Comment on line ${n}`}
                  className="relative w-14 shrink-0 border-r border-line pr-3 text-right text-faint select-none hover:text-brand-2 disabled:cursor-default disabled:hover:text-faint">
                  {!locked && (
                    <span className="absolute top-1/2 left-1 flex size-4 -translate-y-1/2 items-center justify-center rounded bg-brand text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                      <Plus className="size-3" />
                    </span>
                  )}
                  {n}
                </button>
                <span className="pr-6 pl-4 whitespace-pre">{text || " "}</span>
              </div>
              {(lineComments.length > 0 || isDraft || lineIssues.length > 0) && (
                <div className="sticky left-0 w-[min(calc(100vw_-_2.5rem),44rem)] space-y-2 border-y border-line bg-surface-2/60 py-2 pr-3 pl-3 sm:pl-14">
                  {lineIssues.map((x) => <IssueMarker key={x.id} issue={x} />)}
                  {lineComments.map((c) => (
                    draft?.editId === c.id ? (
                      <CommentBox key={c.id} line={n} initial={c} onCancel={() => setDraft(null)}
                        onSave={(v) => onSave({ ...c, ...v })} />
                    ) : (
                      <CommentView key={c.id} comment={c} locked={locked}
                        onEdit={() => setDraft({ file, line: n, editId: c.id })} onDelete={() => onDelete(c.id)} />
                    )
                  ))}
                  {isDraft && !draft.editId && (
                    <CommentBox line={n} onCancel={() => setDraft(null)} onSave={(v) => onSave({ file, line: n, ...v })} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
