import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { OnlineOnly } from "@/components/online-only";
import { RegisterPill } from "@/components/register-pill";
import { speakScenarios } from "@/data/curriculum";
import type { SpeakScenario } from "@/data/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/speak/")({ component: SpeakIndex });

function ScenarioCard({ s }: { s: SpeakScenario }) {
  return (
    <li>
      <OnlineOnly feature="conversas" placement="corner" gate={false}>
        <Link
          to="/speak/$id"
          params={{ id: s.id }}
          className={cn(
            "block overflow-hidden rounded-[var(--radius-lg)] bg-surface no-underline shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-quick)] hover:shadow-[var(--shadow-border-hover)]",
          )}
        >
          <div className="flex gap-0">
            <img
              src={s.image}
              alt=""
              className="scene hidden h-28 w-28 shrink-0 object-cover sm:block"
            />
            <div className="min-w-0 p-4">
              <div className="flex items-center gap-2">
                <p className="min-w-0 text-xs font-medium uppercase tracking-wider text-accent">
                  {s.level} · {s.minutes} min
                </p>
                {s.register ? <RegisterPill register={s.register} /> : null}
              </div>
              <h2 className="mt-1 font-display text-xl font-medium">{s.titlePt}</h2>
              <p className="text-sm text-muted">{s.title}</p>
              <p className="mt-2 line-clamp-2 text-sm text-subtle">{s.setting}</p>
            </div>
          </div>
        </Link>
      </OnlineOnly>
    </li>
  );
}

function SpeakIndex() {
  // #134 (ADR 0018): Social Scenes are a named, headed set on top; guarded so an
  // empty set never renders an empty header.
  const social = speakScenarios.filter((s) => s.group === "social");
  const rest = speakScenarios.filter((s) => s.group !== "social");
  return (
    <AppShell>
      <h1 className="font-display text-3xl font-medium tracking-tight">Speak</h1>
      <p className="mt-2 text-muted">
        Short scenes with a native of Portugal — not Brazil. Stay in character.
        Make mistakes. Recasts come for free. The partner is live.
      </p>

      {social.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-xl font-medium">Cenas sociais</h2>
          <ul className="mt-3 grid gap-3">
            {social.map((s) => (
              <ScenarioCard key={s.id} s={s} />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-display text-xl font-medium">Outras cenas</h2>
        <ul className="mt-3 grid gap-3">
          {rest.map((s) => (
            <ScenarioCard key={s.id} s={s} />
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
