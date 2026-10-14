import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pause, Play } from "lucide-react";
import { useState } from "react";
import { DoneCard } from "@/components/lesson-player";
import { NO_VOICE_NOTE } from "@/components/pt-voice-notice";
import { QuizBlock } from "@/components/quiz-block";
import { Button } from "@/components/ui/button";
import { getBulletin, radioBulletins } from "@/data/curriculum";
import type { RadioBulletin } from "@/data/types";
import { persistCompletion } from "@/lib/record-progress";
import { speakPt, stopSpeaking, usePtVoiceStatus } from "@/lib/tts";

export const Route = createFileRoute("/listen/$id")({ component: ListenPage });

function ListenPage() {
  const { id } = Route.useParams();
  const bulletin = getBulletin(id);
  if (!bulletin) {
    return (
      <main className="p-6">
        <p>Bulletin not found.</p>
        <Link to="/practice" className="text-accent">
          Back
        </Link>
      </main>
    );
  }
  return <ListenPlayer key={bulletin.id} bulletin={bulletin} />;
}

function ListenPlayer({ bulletin }: { bulletin: RadioBulletin }) {
  const [phase, setPhase] = useState<"listen" | "quiz" | "done">("listen");
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(bulletin.level !== "C1");
  const [showScript, setShowScript] = useState(false);
  const [correct, setCorrect] = useState(0);
  const next = radioBulletins[radioBulletins.findIndex((b) => b.id === bulletin.id) + 1];

  const noVoice = usePtVoiceStatus() === "none";

  async function play() {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    await speakPt(bulletin.script, slow ? 0.78 : 0.96);
    setPlaying(false);
  }

  function finish(n: number) {
    setCorrect(n);
    persistCompletion(bulletin.id, n, bulletin.quiz.length);
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
              {bulletin.level} · {bulletin.station}
            </p>
            <p className="truncate font-display text-lg font-medium">{bulletin.titlePt}</p>
          </div>
          <p className="text-xs tabular-nums text-subtle">{bulletin.minutes} min</p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-5">
        {phase === "done" ? (
          <DoneCard titlePt={bulletin.titlePt} correct={correct} total={bulletin.quiz.length}>
            {next && (
              <Button asChild>
                <Link to="/listen/$id" params={{ id: next.id }}>
                  Next bulletin
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/practice">Practice</Link>
            </Button>
          </DoneCard>
        ) : phase === "quiz" ? (
          <QuizBlock
            questions={bulletin.quiz}
            onFinished={(n) => finish(n)}
          />
        ) : (
          <article>
            <img
              src={bulletin.image}
              alt=""
              className="scene h-40 w-full rounded-[var(--radius-lg)] object-cover"
            />
            <p className="mt-5 text-xs font-medium uppercase tracking-wider text-accent">
              {bulletin.kicker}
            </p>
            <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">
              {bulletin.title}
            </h1>
            <p className="mt-2 text-sm text-muted">
              European Portuguese. Play once without the script. Then the quiz.
            </p>

            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => void play()}
                disabled={noVoice}
                title={noVoice ? NO_VOICE_NOTE : undefined}
                className="grid size-20 place-items-center rounded-full bg-accent text-accent-fg shadow-[var(--shadow-border)] disabled:opacity-40"
                aria-label={playing ? "Stop" : "Play bulletin"}
              >
                {playing ? (
                  <Pause className="size-8" />
                ) : (
                  <Play className="size-8 translate-x-0.5" />
                )}
              </button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={slow ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSlow(true)}
                >
                  Slow
                </Button>
                <Button
                  type="button"
                  variant={!slow ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSlow(false)}
                >
                  Natural
                </Button>
              </div>
            </div>

            <div className="mt-8">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowScript((v) => !v)}
              >
                {showScript ? "Hide transcript" : "Show transcript"}
              </Button>
              {showScript && (
                <div className="mt-3 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
                  <p className="font-display text-lg leading-relaxed">{bulletin.script}</p>
                  <p className="mt-3 text-sm text-muted">{bulletin.translation}</p>
                </div>
              )}
            </div>

            <Button className="mt-8 w-full" onClick={() => setPhase("quiz")}>
              Start the quiz
            </Button>
          </article>
        )}
      </div>
    </div>
  );
}
