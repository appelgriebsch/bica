import { ListChecks, RotateCcw } from "lucide-react";
import { SpeakButton } from "@/components/speak-button";
import { Button } from "@/components/ui/button";
import type { Correction } from "@/lib/chat-core";

/**
 * The end-of-scene corrections panel (#131, ADR 0017): every learner line that
 * needed a fix, with its European Portuguese form. Model-provided strings render
 * as text only. Session-only — the parent owns the state, nothing is stored.
 */
export function SceneReview({
  loading,
  corrections,
  onRestart,
}: {
  loading: boolean;
  corrections: Correction[];
  onRestart: () => void;
}) {
  return (
    <section
      aria-live="polite"
      aria-label="Scene corrections"
      className="mt-6 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]"
    >
      <div className="flex items-center gap-2">
        <ListChecks className="size-5 shrink-0 text-accent" />
        <h2 id="scene-review-heading" tabIndex={-1} className="font-display text-lg font-medium">
          As tuas correções
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        What to practise — European Portuguese, not Brazilian.
      </p>
      {loading ? null : corrections.length === 0 ? (
        <p className="mt-3 text-sm text-fg">Sem erros — muito bem! No corrections needed.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {corrections.map((c, i) => (
            <li
              key={`${c.youSaid}→${c.pt}#${i}`}
              className="rounded-[var(--radius-md)] bg-soft px-3 py-2"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-muted">You said</p>
              <p className="text-sm text-muted">{c.youSaid}</p>
              <div className="mt-1.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted">
                    In Portugal
                  </p>
                  <p className="text-sm font-medium text-fg">{c.pt}</p>
                  {c.note && <p className="mt-0.5 text-xs text-muted">{c.note}</p>}
                </div>
                {c.brazilian && (
                  <span className="mt-1 shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-fg">
                    BR → PT
                  </span>
                )}
              </div>
              <SpeakButton text={c.pt} layout="footer" />
            </li>
          ))}
        </ul>
      )}
      {!loading && (
        <Button type="button" variant="outline" className="mt-4" onClick={onRestart}>
          <RotateCcw /> Start again
        </Button>
      )}
    </section>
  );
}
