import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, PenLine } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { grammarDrills, levels } from "@/data/curriculum";
import { useProgress } from "@/lib/progress-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/grammar/")({ component: GrammarIndex });

function GrammarIndex() {
  const completed = useProgress((s) => s.completed);
  const doneIds = new Set(Object.keys(completed));

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-medium tracking-tight">Gramática</h1>
      <p className="mt-2 text-muted">
        Drills for each level. A short rule, three examples, then a quiz. Eight
        to ten minutes — then back to the path. At least three on every level, A1
        through C1.
      </p>

      <div className="mt-8 space-y-10">
        {levels.map((lv) => {
          const drills = grammarDrills.filter((d) => d.level === lv.id);
          const done = drills.filter((d) => doneIds.has(d.id)).length;
          return (
            <section key={lv.id}>
              <div className="mb-3">
                <p className="text-xs font-medium uppercase tracking-wider text-accent">
                  {lv.id} · {done}/{drills.length} done
                </p>
                <h2 className="font-display text-xl font-medium">{lv.title}</h2>
                <p className="text-sm text-muted">{lv.blurb}</p>
              </div>
              <ul className="grid min-w-0 gap-2">
                {drills.map((drill) => {
                  const score = completed[drill.id];
                  return (
                    <li key={drill.id} className="min-w-0">
                      <Link
                        to="/grammar/$id"
                        params={{ id: drill.id }}
                        className="flex min-w-0 w-full items-center gap-3 rounded-[var(--radius-lg)] bg-surface p-3 no-underline shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-quick)] hover:shadow-[var(--shadow-border-hover)]"
                      >
                        <span
                          className={cn(
                            "grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)]",
                            score ? "bg-success text-success-fg" : "bg-soft text-accent",
                          )}
                        >
                          {score ? <Check className="size-4" /> : <PenLine className="size-4" />}
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
          );
        })}
      </div>
    </AppShell>
  );
}
