import { Languages } from "lucide-react";
import { SpeakButton } from "@/components/speak-button";
import type { PtNote } from "@/data/types";

/**
 * The Portugal × Brasil note (#82, ADR 0018), rendered below the lesson section
 * that teaches the form. Only the European `pt` form is playable — TTS stays
 * pt-PT-only; the Brazilian `br` form is text with a non-interactive BR pill.
 */
export function PortugalNote({ note }: { note: PtNote }) {
  return (
    <section
      aria-label="Portugal and Brazil"
      className="mt-6 rounded-[var(--radius-lg)] bg-soft p-4"
    >
      <div className="flex items-center gap-2">
        <Languages className="size-5 shrink-0 text-accent" />
        <h2 className="font-display text-lg font-medium">Portugal × Brasil</h2>
      </div>
      <p className="mt-1 text-sm text-muted">{note.en}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">In Portugal</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="min-w-0 font-medium text-fg">{note.pt}</p>
            <SpeakButton text={note.pt} />
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">In Brazil</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="min-w-0 text-muted">{note.br}</p>
            <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-fg">
              BR
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
