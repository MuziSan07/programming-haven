"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { cx } from "@/components/ui";

/** Result of POST /api/rounds/debug/{id}/run or /submit: {status, passed, total, results, stdout, stderr}. */
export default function RoundTestResults({ result }) {
  if (!result) {
    return <p className="p-4 text-sm text-faint">Run the tests to see which ones fail. The test file is fixed: change the source files until everything passes.</p>;
  }
  const ok = result.status === "All tests pass";
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className={cx("text-lg font-bold", ok ? "text-ok" : "text-bad")}>{result.status}</span>
        <span className="text-sm text-muted">{result.passed}/{result.total} tests passed</span>
        {result.time_ms != null && <span className="text-xs text-faint">{result.time_ms} ms</span>}
      </div>
      {result.total > 0 && (
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
          {result.results.map((r) => (
            <span key={r.name} className={cx("flex-1", r.passed ? "bg-ok" : "bg-bad")} />
          ))}
        </div>
      )}
      {result.stderr && (
        <pre className="overflow-x-auto rounded-xl bg-bad/10 p-3 font-mono text-xs whitespace-pre-wrap text-bad">{result.stderr}</pre>
      )}
      <ul className="space-y-1.5">
        {result.results?.map((r) => (
          <li key={r.name} className={cx("rounded-xl border px-3 py-2 text-xs",
            r.passed ? "border-ok/25 bg-ok/5" : "border-bad/30 bg-bad/5")}>
            <div className="flex items-center gap-2 font-medium">
              {r.passed ? <CircleCheck className="size-4 shrink-0 text-ok" /> : <CircleX className="size-4 shrink-0 text-bad" />}
              <span className="font-mono break-all">{r.name}</span>
            </div>
            {!r.passed && r.error && <p className="mt-1 pl-6 font-mono break-words text-bad/90">{r.error}</p>}
          </li>
        ))}
      </ul>
      {result.stdout && (
        <div>
          <p className="mb-1 text-xs text-faint">Print output</p>
          <pre className="overflow-x-auto rounded-xl bg-bg p-3 font-mono text-xs whitespace-pre-wrap">{result.stdout}</pre>
        </div>
      )}
    </div>
  );
}
