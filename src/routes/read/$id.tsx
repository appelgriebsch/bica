import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { DoneCard } from "@/components/lesson-player";
import { PortugalNote } from "@/components/portugal-note";
import { QuizBlock } from "@/components/quiz-block";
import { SpeakButton } from "@/components/speak-button";
import { Button } from "@/components/ui/button";
import { getReading, readingPieces } from "@/data/curriculum";
import type { ReadingPiece, ReadingTask } from "@/data/types";
import { persistCompletion } from "@/lib/record-progress";
import { READ_RATE } from "@/lib/tts";

export const Route = createFileRoute("/read/$id")({ component: ReadPage });

function ReadPage() {
  const { id } = Route.useParams();
  const piece = getReading(id);
  if (!piece) {
    return (
      <main className="p-6">
        <p>Page not found.</p>
        <Link to="/practice" className="text-accent">
          Back
        </Link>
      </main>
    );
  }
  return <ReadPlayer key={piece.id} piece={piece} />;
}

function ReadPlayer({ piece }: { piece: ReadingPiece }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [phase, setPhase] = useState<"read" | "quiz" | "done">("read");
  const [correct, setCorrect] = useState(0);
  const next = readingPieces[readingPieces.findIndex((p) => p.id === piece.id) + 1];

  function finish(n: number) {
    setCorrect(n);
    persistCompletion(piece.id, n, piece.quiz.length);
    setPhase("done");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-bg/90 px-3 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link to="/practice">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-muted">
              {piece.level} · {piece.source}
            </p>
            <p className="truncate font-display text-lg font-medium">{piece.titlePt}</p>
          </div>
          <p className="text-xs tabular-nums text-subtle">{piece.minutes} min</p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-5">
        {phase === "done" ? (
          <DoneCard titlePt={piece.titlePt} correct={correct} total={piece.quiz.length}>
            {next && (
              <Button asChild>
                <Link to="/read/$id" params={{ id: next.id }}>
                  Next page
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/practice">Practice</Link>
            </Button>
          </DoneCard>
        ) : phase === "quiz" ? (
          <QuizBlock
            questions={piece.quiz}
            onFinished={(n) => finish(n)}
          />
        ) : (
          <article>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              {piece.kind} · tap a paragraph for English
            </p>
            <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">
              {piece.title}
            </h1>

            <div className="mt-6 space-y-3">
              {piece.paragraphs.map((p, i) => {
                const shown = Boolean(open[i]);
                return (
                  <div
                    key={p.pt}
                    className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]"
                  >
                    <button
                      type="button"
                      onClick={() => setOpen((s) => ({ ...s, [i]: !s[i] }))}
                      className="block w-full min-w-0 text-left"
                    >
                      <p className="font-display text-xl leading-relaxed">{p.pt}</p>
                    </button>
                    {shown && <p className="mt-3 text-sm text-muted">{p.en}</p>}
                    <SpeakButton text={p.pt} rate={READ_RATE} layout="footer" />
                  </div>
                );
              })}
            </div>

            {piece.notes.length > 0 && (
              <section className="mt-6">
                <h2 className="text-xs font-medium uppercase tracking-wider text-accent">
                  Notes
                </h2>
                <ul className="mt-2 divide-y divide-border rounded-[var(--radius-md)] bg-surface shadow-[var(--shadow-border)]">
                  {piece.notes.map((n) => (
                    <li key={n.pt} className="px-3 py-2">
                      <p className="font-medium">{n.pt}</p>
                      <p className="text-sm text-muted">{n.en}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {piece.ptNote && <PortugalNote note={piece.ptNote} />}

            {piece.task && <TaskBlock task={piece.task} />}

            <Button className="mt-8 w-full" onClick={() => setPhase("quiz")}>
              Check what stuck
            </Button>
          </article>
        )}
      </div>
    </div>
  );
}

/** #178 (gap P1, plan #210): written-task block — prompt, local-only draft textarea,
 * model-answer reveal with Speak, self-check checklist. No network, no storage, no AI:
 * the draft lives in component state and never leaves the device. */
function TaskBlock({ task }: { task: ReadingTask }) {
  const [draft, setDraft] = useState("");
  const [showModel, setShowModel] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  return (
    <section className="mt-6 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
      <p className="text-xs font-medium uppercase tracking-wider text-accent">{task.practiceLabel}</p>
      <p className="mt-2 font-display text-xl leading-relaxed">{task.prompt.pt}</p>
      <p className="mt-1 text-sm text-muted">{task.prompt.en}</p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        aria-label="A sua mensagem"
        placeholder="Escreva aqui a sua mensagem…"
        className="mt-3 w-full rounded-[var(--radius-md)] border border-border bg-bg p-3 text-base text-fg"
      />
      <p className="mt-1 text-xs tabular-nums text-subtle">
        {words} / {task.minWords}–{task.maxWords} palavras
      </p>
      <Button variant="outline" className="mt-3" onClick={() => setShowModel((s) => !s)}>
        {showModel ? "Hide model answer" : "Show model answer"}
      </Button>
      {showModel && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-border p-3">
          <p className="font-display text-lg leading-relaxed">{task.model.pt}</p>
          <p className="mt-2 text-sm text-muted">{task.model.en}</p>
          <SpeakButton text={task.model.pt} rate={READ_RATE} layout="footer" />
        </div>
      )}
      <ul className="mt-4 space-y-1">
        {task.checklist.map((c, i) => (
          <li key={c.pt}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-2 py-1 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-accent)]"
                checked={Boolean(checked[i])}
                onChange={() => setChecked((s) => ({ ...s, [i]: !s[i] }))}
              />
              <span>
                <span className="block font-medium">{c.pt}</span>
                <span className="block text-xs text-muted">{c.en}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
