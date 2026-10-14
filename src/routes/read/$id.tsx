import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { DoneCard } from "@/components/lesson-player";
import { QuizBlock } from "@/components/quiz-block";
import { SpeakButton } from "@/components/speak-button";
import { Button } from "@/components/ui/button";
import { getReading, readingPieces } from "@/data/curriculum";
import type { ReadingPiece } from "@/data/types";
import { persistCompletion } from "@/lib/record-progress";

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
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => setOpen((s) => ({ ...s, [i]: !s[i] }))}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="font-display text-xl leading-relaxed">{p.pt}</p>
                      </button>
                      <SpeakButton text={p.pt} rate={0.9} />
                    </div>
                    {shown && <p className="mt-3 text-sm text-muted">{p.en}</p>}
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

            <Button className="mt-8 w-full" onClick={() => setPhase("quiz")}>
              Check what stuck
            </Button>
          </article>
        )}
      </div>
    </div>
  );
}
