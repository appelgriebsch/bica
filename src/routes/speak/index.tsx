import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { OnlineOnly } from "@/components/online-only";
import { RegisterPill } from "@/components/register-pill";
import { speakScenarioGroups } from "@/data/curriculum";
import { topicLabels } from "@/data/types";
import type { ScenarioTopic, SpeakScenario } from "@/data/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/speak/")({ component: SpeakIndex });

function TopicChip({ topic }: { topic: ScenarioTopic }) {
  return (
    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted">
      {topicLabels[topic]}
    </span>
  );
}

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
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 text-xs font-medium uppercase tracking-wider text-accent">
                  {s.level} · {s.minutes} min
                </p>
                <TopicChip topic={s.topic} />
                {s.register ? <RegisterPill register={s.register} /> : null}
              </div>
              <h4 className="mt-1 font-display text-xl font-medium">{s.titlePt}</h4>
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
  // #154 (ADR 0022): one section per level (A1 → C1), each with topic sub-groups;
  // speakScenarioGroups() drops empty groups and keeps authored order within a group.
  const groups = speakScenarioGroups();
  return (
    <AppShell>
      <h1 className="font-display text-3xl font-medium tracking-tight">Speak</h1>
      <p className="mt-2 text-muted">
        Short scenes with a native of Portugal — not Brazil. Stay in character. Make mistakes.
        Recasts come for free. The partner is live.
      </p>

      {groups.map((g) => (
        <section key={g.level} className="mt-6">
          <h2 className="font-display text-xl font-medium">
            {g.level} · {g.title}
          </h2>
          {g.topics.map((t) => (
            <div key={t.topic} className="mt-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted">{t.label}</h3>
              <ul className="mt-3 grid gap-3">
                {t.scenarios.map((s) => (
                  <ScenarioCard key={s.id} s={s} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </AppShell>
  );
}
