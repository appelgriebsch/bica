import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { DoneCard } from "@/components/lesson-player";
import { QuizBlock } from "@/components/quiz-block";
import { SpeakButton } from "@/components/speak-button";
import { Button } from "@/components/ui/button";
import { getGrammar, grammarDrills } from "@/data/curriculum";
import type { GrammarDrill } from "@/data/types";
import { persistCompletion } from "@/lib/record-progress";

export const Route = createFileRoute("/grammar/$id")({ component: GrammarPage });

function GrammarPage() {
  const { id } = Route.useParams();
  const drill = getGrammar(id);
  if (!drill) {
    return (
      <main className="p-6">
        <p>Drill not found.</p>
        <Link to="/grammar" className="text-accent">
          Back
        </Link>
      </main>
    );
  }
  return <GrammarPlayer key={drill.id} drill={drill} />;
}

function GrammarPlayer({ drill }: { drill: GrammarDrill }) {
  const [phase, setPhase] = useState<"intro" | "quiz" | "done">("intro");
  const [correct, setCorrect] = useState(0);
  const next = grammarDrills[grammarDrills.findIndex((d) => d.id === drill.id) + 1];

  function finish(n: number) {
    setCorrect(n);
    persistCompletion(drill.id, n, drill.quiz.length);
    setPhase("done");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-bg/90 px-3 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link to="/grammar">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-muted">
              {drill.level} · Gramática
            </p>
            <p className="truncate font-display text-lg font-medium">{drill.titlePt}</p>
          </div>
          <p className="text-xs tabular-nums text-subtle">{drill.minutes} min</p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-5">
        {phase === "done" ? (
          <DoneCard titlePt={drill.titlePt} correct={correct} total={drill.quiz.length}>
            {next && (
              <Button asChild>
                <Link to="/grammar/$id" params={{ id: next.id }}>
                  Next drill
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/grammar">Grammar</Link>
            </Button>
          </DoneCard>
        ) : phase === "quiz" ? (
          <QuizBlock questions={drill.quiz} onFinished={(n) => finish(n)} />
        ) : (
          <article>
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              {drill.level} · {drill.focus}
            </p>
            <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">
              {drill.title}
            </h1>
            <p className="mt-3 text-muted">{drill.body}</p>

            <ul className="mt-6 space-y-2">
              {drill.examples.map((ex) => (
                <li
                  key={ex.pt}
                  className="flex items-start gap-2 rounded-[var(--radius-md)] bg-surface p-3 shadow-[var(--shadow-border)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{ex.pt}</p>
                    <p className="text-sm text-muted">{ex.en}</p>
                  </div>
                  <SpeakButton text={ex.pt} />
                </li>
              ))}
            </ul>

            <Button className="mt-8 w-full" onClick={() => setPhase("quiz")}>
              Start the drill
            </Button>
          </article>
        )}
      </div>
    </div>
  );
}
