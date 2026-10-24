import { Badge, DIFFICULTY_TONE, RichText } from "./ui";

export default function ProblemStatement({ problem }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{problem.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge tone={DIFFICULTY_TONE[problem.difficulty]}>{problem.difficulty}</Badge>
          <Badge tone="cyan">{problem.pattern}</Badge>
        </div>
      </div>
      {problem.description.split("\n\n").map((para, i) => (
        <p key={i} className="text-sm leading-relaxed text-text/90"><RichText text={para} /></p>
      ))}
      {problem.examples.map((ex, i) => (
        <div key={i}>
          <p className="mb-1.5 text-sm font-semibold">Example {i + 1}</p>
          <div className="rounded-xl border border-line bg-bg p-3 font-mono text-xs leading-6">
            <p><span className="text-faint">Input: </span>{ex.input}</p>
            <p><span className="text-faint">Output: </span>{ex.output}</p>
            {ex.explanation && <p className="font-sans text-muted">{ex.explanation}</p>}
          </div>
        </div>
      ))}
      <div>
        <p className="mb-1.5 text-sm font-semibold">Constraints</p>
        <ul className="list-disc space-y-1 pl-5 font-mono text-xs text-muted">
          {problem.constraints.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </div>
      {problem.hidden_count > 0 && (
        <p className="text-xs text-faint">+ {problem.hidden_count} hidden test cases run on submit.</p>
      )}
    </div>
  );
}
