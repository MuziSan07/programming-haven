"use client";

import Editor from "@monaco-editor/react";
import { Spinner } from "./ui";

function defineTheme(monaco) {
  monaco.editor.defineTheme("haven", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "5b647c", fontStyle: "italic" },
      { token: "keyword", foreground: "a78bfa" },
      { token: "string", foreground: "5eead4" },
      { token: "number", foreground: "fbbf24" },
    ],
    colors: {
      "editor.background": "#070a12",
      "editor.lineHighlightBackground": "#0d1220",
      "editorLineNumber.foreground": "#3a4560",
      "editorLineNumber.activeForeground": "#8a93ab",
      "editor.selectionBackground": "#7c5cff44",
      "editorCursor.foreground": "#22d3ee",
      "editorIndentGuide.background1": "#141b2d",
    },
  });
}

export default function CodeEditor({ value, onChange, language = "python", height = "100%", readOnly = false,
  onMount }) {
  return (
    <Editor
      height={height}
      language={language}
      value={value}
      theme="haven"
      beforeMount={defineTheme}
      onMount={onMount}
      onChange={(v) => onChange?.(v ?? "")}
      loading={<Spinner />}
      options={{
        fontSize: 14,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        padding: { top: 14, bottom: 14 },
        tabSize: language === "python" ? 4 : 2,
        automaticLayout: true,
        readOnly,
        renderLineHighlight: "line",
        smoothScrolling: true,
        cursorBlinking: "smooth",
        wordWrap: "on",
      }}
    />
  );
}
