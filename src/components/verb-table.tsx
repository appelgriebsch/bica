import type { VerbEntry } from "@/data/types";
import { speakPt } from "@/lib/tts";
import { cn } from "@/lib/utils";

export function VerbCard({ verb }: { verb: VerbEntry }) {
  const people = verb.tenses[0]?.forms ?? [];
  const grid = cn(
    "grid items-baseline gap-x-2",
    verb.tenses.length > 1
      ? "grid-cols-[4.75rem_minmax(0,1fr)_minmax(0,1fr)]"
      : "grid-cols-[4.75rem_minmax(0,1fr)]",
  );

  return (
    <section className="rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
      <div>
        <h3 className="font-display text-xl font-medium">{verb.inf}</h3>
        <p className="text-sm text-muted">{verb.en}</p>
        {verb.note ? <p className="mt-2 text-sm text-subtle">{verb.note}</p> : null}
      </div>
      <p className="mt-3 text-xs text-subtle">Tap a line to hear it.</p>
      <div className="mt-2">
        <div
          className={cn(
            grid,
            "pb-1 text-xs font-medium uppercase tracking-wider text-subtle",
          )}
        >
          <span aria-hidden="true" />
          {verb.tenses.map((t) => (
            <span key={t.label} className="min-w-0 truncate">
              {t.label}
            </span>
          ))}
        </div>
        <ul>
          {people.map((row, i) => {
            const spoken = verb.tenses.map((t) => t.forms[i]?.form ?? "").join(", ");
            return (
              <li key={row.person} className="border-t border-border/70">
                <button
                  type="button"
                  onClick={() => void speakPt(spoken, 0.88)}
                  className={cn(grid, "min-h-11 w-full py-2 text-left")}
                >
                  <span className="min-w-0 text-sm text-subtle">{row.person}</span>
                  {verb.tenses.map((t) => (
                    <span
                      key={t.label}
                      className={cn(
                        "min-w-0 truncate font-medium",
                        verb.tenses.length === 1 && "text-base",
                      )}
                    >
                      {t.forms[i]?.form}
                    </span>
                  ))}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
