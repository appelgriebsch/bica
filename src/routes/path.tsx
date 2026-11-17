import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Clock3, PenLine, WholeWord } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { LevelCompleteOverlay } from "@/components/level-complete";
import {
  grammarDrills,
  isLevelComplete,
  lessons,
  levels,
  units,
  verbDesks,
} from "@/data/curriculum";
import type { CefrLevel } from "@/data/types";
import { useProgress } from "@/lib/progress-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/path")({ component: PathPage });

function PathPage() {
  const completed = useProgress((s) => s.completed);
  const [review, setReview] = useState<CefrLevel | null>(null);

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-medium tracking-tight">The path</h1>
      <p className="mt-2 text-muted">
        A1 through C1, in European Portuguese. Jump in anywhere — adults skip
        what they already know. After each level, grammar and a verb desk.
      </p>

      {review && <LevelCompleteOverlay level={review} onClose={() => setReview(null)} />}

      <div className="mt-8 space-y-12">
        {levels.map((lv) => {
          const levelUnits = units.filter((u) => u.level === lv.id);
          const drills = grammarDrills.filter((d) => d.level === lv.id);
          const desks = verbDesks.filter((d) => d.level === lv.id);
          const done = isLevelComplete(completed, lv.id);
          return (
            <div key={lv.id}>
              <p className="text-xs font-medium uppercase tracking-wider text-accent">
                {lv.id}
                {done ? " · Concluído" : ""}
              </p>
              <h2 className="font-display text-2xl font-medium">{lv.title}</h2>
              <p className="mt-1 text-sm text-muted">{lv.blurb}</p>
              {done && (
                <button
                  type="button"
                  onClick={() => setReview(lv.id)}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-success px-4 text-sm font-medium text-success-fg transition-transform duration-[var(--motion-quick)] ease-[var(--ease-out)] active:scale-[0.96]"
                >
                  <Check className="size-4" />
                  You can now
                </button>
              )}

              <div className="mt-5 space-y-8">
                {levelUnits.map((unit) => {
                  const unitLessons = lessons.filter((l) => l.unitId === unit.id);
                  return (
                    <section key={unit.id}>
                      <div className="mb-3">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted">
                          {unit.titlePt}
                        </p>
                        <h3 className="font-display text-xl font-medium">{unit.title}</h3>
                        <p className="text-sm text-muted">{unit.blurb}</p>
                      </div>
                      <ul className="grid min-w-0 gap-2">
                        {unitLessons.map((lesson) => {
                          const done = Boolean(completed[lesson.id]);
                          const score = completed[lesson.id];
                          return (
                            <li key={lesson.id} className="min-w-0">
                              <Link
                                to="/lesson/$id"
                                params={{ id: lesson.id }}
                                className="flex min-w-0 items-center gap-3 rounded-[var(--radius-lg)] bg-surface p-3 no-underline shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-quick)] hover:shadow-[var(--shadow-border-hover)]"
                              >
                                <span
                                  className={cn(
                                    "grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)]",
                                    done
                                      ? "bg-success text-success-fg"
                                      : "bg-soft text-accent",
                                  )}
                                >
                                  {done ? (
                                    <Check className="size-4" />
                                  ) : (
                                    <Clock3 className="size-4" />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1 overflow-hidden">
                                  <span className="block truncate font-medium text-fg">
                                    {lesson.titlePt}
                                    <span className="ml-2 font-sans text-sm font-normal text-muted">
                                      {lesson.title.includes("—")
                                        ? lesson.title.split("—").slice(1).join("—").trim()
                                        : lesson.title}
                                    </span>
                                  </span>
                                  <span className="mt-0.5 block text-xs text-subtle">
                                    {lesson.minutes} min
                                    {score
                                      ? ` · ${score.quizScore}/${score.quizTotal} on the quiz`
                                      : ""}
                                  </span>
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}

                <section
                  id={`grammar-${lv.id}`}
                  className="scroll-mt-20 min-w-0 rounded-[var(--radius-xl)] bg-soft p-3"
                >
                  <div className="mb-3 flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wider text-accent">
                        {lv.id} · Gramática · {drills.length} drills
                      </p>
                      <h3 className="font-display text-xl font-medium">Grammar</h3>
                      <p className="text-sm text-muted">
                        Patterns from this level. A rule, three lines, a quiz.
                      </p>
                    </div>
                    <Link
                      to="/grammar"
                      className="shrink-0 text-sm font-medium text-accent no-underline hover:underline"
                    >
                      All levels
                    </Link>
                  </div>
                  <ul className="grid min-w-0 gap-2">
                    {drills.map((drill) => {
                      const score = completed[drill.id];
                      return (
                        <li key={drill.id} className="min-w-0">
                          <Link
                            to="/grammar/$id"
                            params={{ id: drill.id }}
                            className="flex min-w-0 items-center gap-3 rounded-[var(--radius-md)] bg-surface p-3 no-underline shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-quick)] hover:shadow-[var(--shadow-border-hover)]"
                          >
                            <span
                              className={cn(
                                "grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)]",
                                score
                                  ? "bg-success text-success-fg"
                                  : "bg-accent text-accent-fg",
                              )}
                            >
                              {score ? (
                                <Check className="size-4" />
                              ) : (
                                <PenLine className="size-4" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1 overflow-hidden">
                              <span className="block truncate font-medium text-fg">
                                {drill.titlePt}
                                <span className="ml-2 hidden font-sans text-sm font-normal text-muted sm:inline">
                                  {drill.title}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-subtle">
                                {drill.minutes} min · {drill.focus}
                                {score
                                  ? ` · ${score.quizScore}/${score.quizTotal} on the quiz`
                                  : ""}
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section
                  id={`verbs-${lv.id}`}
                  className="scroll-mt-20 min-w-0 rounded-[var(--radius-xl)] bg-soft p-3"
                >
                  <div className="mb-3 flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wider text-accent">
                        {lv.id} · Verbos
                      </p>
                      <h3 className="font-display text-xl font-medium">Verbs</h3>
                      <p className="text-sm text-muted">
                        The ones that open the day, with persons and a quiz.
                      </p>
                    </div>
                    <Link
                      to="/verbs"
                      className="shrink-0 text-sm font-medium text-accent no-underline hover:underline"
                    >
                      All levels
                    </Link>
                  </div>
                  <ul className="grid min-w-0 gap-2">
                    {desks.map((desk) => {
                      const score = completed[desk.id];
                      return (
                        <li key={desk.id} className="min-w-0">
                          <Link
                            to="/verbs/$id"
                            params={{ id: desk.id }}
                            className="flex min-w-0 items-center gap-3 rounded-[var(--radius-md)] bg-surface p-3 no-underline shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-quick)] hover:shadow-[var(--shadow-border-hover)]"
                          >
                            <span
                              className={cn(
                                "grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)]",
                                score
                                  ? "bg-success text-success-fg"
                                  : "bg-accent text-accent-fg",
                              )}
                            >
                              {score ? (
                                <Check className="size-4" />
                              ) : (
                                <WholeWord className="size-4" />
                              )}
                            </span>
                            <span className="min-w-0 flex-1 overflow-hidden">
                              <span className="block truncate font-medium text-fg">
                                {desk.titlePt}
                                <span className="ml-2 hidden font-sans text-sm font-normal text-muted sm:inline">
                                  {desk.title}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-subtle">
                                {desk.minutes} min · {desk.focus}
                                {score
                                  ? ` · ${score.quizScore}/${score.quizTotal} on the quiz`
                                  : ""}
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
