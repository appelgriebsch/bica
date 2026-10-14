import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { DoneCard } from "@/components/lesson-player";
import { QuizBlock } from "@/components/quiz-block";
import { VerbCard } from "@/components/verb-table";
import { Button } from "@/components/ui/button";
import { getVerbDesk, verbDesks } from "@/data/curriculum";
import type { VerbDesk } from "@/data/types";
import { persistCompletion } from "@/lib/record-progress";

export const Route = createFileRoute("/verbs/$id")({ component: VerbPage });

function VerbPage() {
  const { id } = Route.useParams();
  const desk = getVerbDesk(id);
  if (!desk) {
    return (
      <main className="p-6">
        <p>Desk not found.</p>
        <Link to="/verbs" className="text-accent">
          Back
        </Link>
      </main>
    );
  }
  return <VerbPlayer key={desk.id} desk={desk} />;
}

function VerbPlayer({ desk }: { desk: VerbDesk }) {
  const [phase, setPhase] = useState<"intro" | "quiz" | "done">("intro");
  const [correct, setCorrect] = useState(0);
  const next = verbDesks[verbDesks.findIndex((d) => d.id === desk.id) + 1];

  function finish(n: number) {
    setCorrect(n);
    persistCompletion(desk.id, n, desk.quiz.length);
    setPhase("done");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-bg/90 px-3 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link to="/verbs">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-muted">
              {desk.level} · Verbos
            </p>
            <p className="truncate font-display text-lg font-medium">{desk.titlePt}</p>
          </div>
          <p className="text-xs tabular-nums text-subtle">{desk.minutes} min</p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-5">
        {phase === "done" ? (
          <DoneCard titlePt={desk.titlePt} correct={correct} total={desk.quiz.length}>
            {next && (
              <Button asChild>
                <Link to="/verbs/$id" params={{ id: next.id }}>
                  Next desk
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/verbs">Verbos</Link>
            </Button>
          </DoneCard>
        ) : phase === "quiz" ? (
          <QuizBlock questions={desk.quiz} onFinished={(n) => finish(n)} />
        ) : (
          <article>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              {desk.level} · {desk.focus}
            </p>
            <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">
              {desk.title}
            </h1>
            <p className="mt-3 text-muted">{desk.body}</p>
            <p className="mt-2 text-sm text-subtle">
              ele/você take the same form. eles/vocês too.
            </p>

            <div className="mt-6 space-y-3">
              {desk.verbs.map((v) => (
                <VerbCard key={v.inf} verb={v} />
              ))}
            </div>

            <Button className="mt-8 w-full" onClick={() => setPhase("quiz")}>
              Start the drill
            </Button>
          </article>
        )}
      </div>
    </div>
  );
}
