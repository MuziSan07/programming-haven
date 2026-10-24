"use client";

import { CircleCheck, CircleX, Lock } from "lucide-react";
import { cx } from "./ui";

const fmt = (v) => JSON.stringify(v);

/** Verdict + per-case results from /api/dsa/run or /submit. */
export default function TestResults({ result }) {
  if (!result) {
    return <p className="p-4 text-sm text-faint">Run your code to see results against the sample tests.</p>;
  }
  const accepted = result.status === "Accepted";
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className={cx("text-lg font-bold", accepted ? "text-ok" : "text-bad")}>{result.status}</span>
        <span className="text-sm text-muted">{result.passed}/{result.total} tests passed</span>
        <span className="text-xs text-faint">{result.time_ms} ms</span>
      </div>
      {result.stderr && (
        <pre className="overflow-x-auto rounded-xl bg-bad/10 p-3 font-mono text-xs whitespace-pre-wrap text-bad">
          {result.stderr}
        </pre>
      )}
      {result.cases?.map((c, i) => (
        <div key={i} className={cx("rounded-xl border p-3 text-xs", c.passed ? "border-ok/30 bg-ok/5" : "border-bad/30 bg-bad/5")}>
          <div className="mb-1 flex items-center gap-2 font-medium">
            {c.passed ? <CircleCheck className="size-4 text-ok" /> : <CircleX className="size-4 text-bad" />}
            Test {i + 1}
            {c.hidden && <span className="flex items-center gap-1 text-faint"><Lock className="size-3" /> hidden</span>}
          </div>
          {!c.hidden && (
            <div className="grid gap-1 font-mono">
              <p><span className="text-faint">Input:    </span>{c.input.map(fmt).join(", ")}</p>
              <p><span className="text-faint">Expected: </span>{fmt(c.expected)}</p>
              <p><span className="text-faint">Output:   </span>
                <span className={c.passed ? "text-ok" : "text-bad"}>{c.error || fmt(c.actual)}</span></p>
            </div>
          )}
          {c.hidden && c.error && <p className="font-mono text-bad">{c.error}</p>}
        </div>
      ))}
      {result.stdout && (
        <div>
          <p className="mb-1 text-xs text-faint">Your print output</p>
          <pre className="overflow-x-auto rounded-xl bg-bg p-3 font-mono text-xs whitespace-pre-wrap">{result.stdout}</pre>
        </div>
      )}
    </div>
  );
}
