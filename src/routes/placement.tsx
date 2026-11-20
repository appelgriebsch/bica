import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { QuizBlock } from "@/components/quiz-block";
import { StartLevelPicker } from "@/components/start-level";
import { Button } from "@/components/ui/button";
import { levels } from "@/data/curriculum";
import {
  CLEAR_THRESHOLD,
  PLACEMENT_PER_BAND,
  placementBands,
  recommendLevel,
} from "@/data/placement";
import type { CefrLevel } from "@/data/types";
import { announce } from "@/lib/online";
import { useProgress } from "@/lib/progress-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/placement")({ component: PlacementPage });

const ALL_ZERO: Record<CefrLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };

function PlacementPage() {
  const setFloor = useProgress((s) => s.setFloor);
  const [bandIndex, setBandIndex] = useState(0);
  const [scores, setScores] = useState<Partial<Record<CefrLevel, number>>>({});
  const [accepted, setAccepted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const running = bandIndex < placementBands.length;
  const band = placementBands[bandIndex];
  const full = { ...ALL_ZERO, ...scores };
  const recommended = recommendLevel(full);
  const meta = levels.find((l) => l.id === recommended)!;

  function finishBand(correct: number) {
    const level = band.level;
    setScores((prev) => ({ ...prev, [level]: correct }));
    setBandIndex((i) => i + 1);
  }

  function accept() {
    setFloor(recommended);
    announce(`Start level set to ${recommended}.`);
    toast(`Start level set to ${recommended}.`);
    setAccepted(true);
  }

  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to Today">
          <Link to="/">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="font-display text-3xl font-medium tracking-tight">Placement check</h1>
      </div>

      {running ? (
        <>
          <p className="mt-2 text-sm text-muted">
            Fifteen quick questions, about five minutes. Answer what you know — there is no timer.
          </p>
          <p className="mt-6 text-xs font-medium uppercase tracking-wider text-accent">
            {band.level} · {bandIndex + 1} of {placementBands.length}
          </p>
          <div className="mt-2">
            <QuizBlock key={band.level} questions={band.items} onFinished={finishBand} />
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">Your recommended start level.</p>
          <div className="mt-4 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-border)]">
            <p className="font-display text-4xl font-medium">{recommended}</p>
            <p className="mt-1 font-medium">{meta.title}</p>
            <p className="mt-1 text-sm text-muted">{meta.blurb}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {placementBands.map((b) => {
                const score = scores[b.level] ?? 0;
                return (
                  <span
                    key={b.level}
                    className={cn(
                      "rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-medium tabular-nums",
                      score >= CLEAR_THRESHOLD
                        ? "bg-success text-success-fg"
                        : "bg-soft text-muted",
                    )}
                  >
                    {b.level} · {score}/{PLACEMENT_PER_BAND}
                  </span>
                );
              })}
            </div>
          </div>

          {accepted ? (
            <Button asChild className="mt-6 w-full">
              <Link to="/" className="no-underline">
                Go to Today
                <ArrowRight />
              </Link>
            </Button>
          ) : showPicker ? (
            <div className="mt-6">
              <StartLevelPicker label="Start from" />
              <Button asChild variant="outline" className="mt-4 w-full">
                <Link to="/" className="no-underline">
                  Done
                </Link>
              </Button>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-2">
              <Button className="w-full" onClick={accept}>
                Start at {recommended}
                <ArrowRight />
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setShowPicker(true)}>
                Choose another level
              </Button>
            </div>
          )}

          <p className="mt-4 text-sm text-subtle">
            Today will offer the next unfinished lesson from this level up. You can retake the check
            any time from You.
          </p>
        </>
      )}
    </AppShell>
  );
}
