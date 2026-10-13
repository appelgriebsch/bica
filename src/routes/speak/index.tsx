import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { speakScenarios } from "@/data/curriculum";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";
import { OnlineOnly } from "@/components/online-only";

export const Route = createFileRoute("/speak/")({ component: SpeakIndex });

function SpeakIndex() {
  const { user, isPending } = useCurrentUserState();

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-medium tracking-tight">Speak</h1>
      <p className="mt-2 text-muted">
        Short scenes with a native of Portugal — not Brazil. Stay in character.
        Make mistakes. Recasts come for free. Sign in first; the partner is live.
      </p>

      {!isPending && !user && (
        <p className="mt-4 rounded-[var(--radius-md)] bg-soft px-3 py-2 text-sm text-accent">
          Sign in to start a conversation — it uses a live tutor behind the scenes.
        </p>
      )}

      <ul className="mt-6 grid gap-3">
        {speakScenarios.map((s) => (
          <li key={s.id}>
            <OnlineOnly feature="conversas" label={`${s.titlePt}, ${s.title}`} placement="corner" gate={false}>
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
                  <div className="p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-accent">
                      {s.level} · {s.minutes} min
                    </p>
                    <h2 className="mt-1 font-display text-xl font-medium">{s.titlePt}</h2>
                    <p className="text-sm text-muted">{s.title}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-subtle">{s.setting}</p>
                  </div>
                </div>
              </Link>
            </OnlineOnly>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
