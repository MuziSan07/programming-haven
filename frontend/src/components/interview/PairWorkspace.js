"use client";

import { useImperativeHandle, useRef, useState } from "react";
import { Bug, FileCode, FlaskConical, Lock, Play, RotateCcw } from "lucide-react";
import CodeEditor from "@/components/CodeEditor";
import RoundTestResults from "@/components/rounds/RoundTestResults";
import { LANGUAGE_LABEL } from "@/components/rounds/shared";
import { Badge, Button, DIFFICULTY_TONE, RichText, Spinner, cx } from "@/components/ui";

/**
 * Pair-programming editor: the partner's files in tabs, the read-only test file, "Run tests" and results.
 * The parent owns `files`; `ref.current.insert(text)` puts a partner suggestion at the cursor.
 */
export default function PairWorkspace({ ref, round, files, onChange, result, running, onRun, partner }) {
  const sourceNames = Object.keys(round.files);
  const [active, setActive] = useState(sourceNames[0]);
  const editorRef = useRef(null);
  const isTest = active === round.test_file;
  const tabs = [...sourceNames, round.test_file];
  const editedCount = sourceNames.filter((n) => files[n] !== round.files[n]).length;

  useImperativeHandle(ref, () => ({
    insert(text) {
      const editor = editorRef.current;
      if (!editor || active === round.test_file) return false;
      const selection = editor.getSelection();
      editor.executeEdits("partner", [{ range: selection, text, forceMoveMarkers: true }]);
      editor.focus();
      return true;
    },
  }), [active, round.test_file]);

  return (
    <div className="flex min-h-0 flex-col border-r border-line">
      <details className="border-b border-line" open>
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
          <Bug className="size-3.5 text-bad" /> Ticket
          <Badge tone={DIFFICULTY_TONE[round.difficulty]} className="normal-case">{round.difficulty}</Badge>
          <span className="font-normal normal-case text-faint">{LANGUAGE_LABEL[round.language]}</span>
        </summary>
        <div className="max-h-[22vh] overflow-y-auto px-5 pb-3 text-sm">
          <p className="font-semibold">{round.title}</p>
          <p className="mt-1 leading-relaxed text-text/85"><RichText text={round.scenario} /></p>
          <p className="mt-2 text-xs text-faint">{partner} wrote this code. Talk through what you see; {partner} sees your edits and test runs with every answer.</p>
        </div>
      </details>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-line bg-surface px-2">
        {tabs.map((name) => {
          const test = name === round.test_file;
          return (
            <button key={name} onClick={() => setActive(name)}
              className={cx("flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 font-mono text-xs transition",
                active === name ? "border-brand text-text" : "border-transparent text-muted hover:text-text")}>
              {test ? <FlaskConical className="size-3.5 text-brand-2" /> : <FileCode className="size-3.5" />}
              {name}
              {test && <Lock className="size-3 text-faint" aria-label="read-only" />}
              {!test && files[name] !== round.files[name] && <span className="size-1.5 rounded-full bg-warn" title="Edited" />}
            </button>
          );
        })}
        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          {!isTest && (
            <Button size="sm" variant="ghost" onClick={() => onChange(active, round.files[active])}
              disabled={files[active] === round.files[active]} title="Restore this file to the original version">
              <RotateCcw className="size-3.5" /> <span className="hidden sm:inline">Reset</span>
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={onRun} loading={running} disabled={running}>
            {!running && <Play className="size-3.5" />} Run tests
          </Button>
        </div>
      </div>

      <div className="h-[50vh] min-h-0 lg:h-auto lg:flex-[3]">
        <CodeEditor value={isTest ? round.tests : files[active]} onChange={(v) => !isTest && onChange(active, v)}
          language={round.language} readOnly={isTest} onMount={(editor) => { editorRef.current = editor; }} />
      </div>
      <div className="max-h-[40vh] min-h-0 overflow-y-auto border-t border-line bg-surface lg:max-h-none lg:flex-[2]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs font-medium text-muted">
          Test results {running && <Spinner className="size-3.5" />}
          <span className="ml-auto text-faint">{editedCount} file{editedCount === 1 ? "" : "s"} changed</span>
        </div>
        <RoundTestResults result={result} />
      </div>
    </div>
  );
}
