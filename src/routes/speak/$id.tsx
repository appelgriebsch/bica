import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { SpeakButton } from "@/components/speak-button";
import { speakScenarios } from "@/data/curriculum";
import { sendChat } from "@/lib/chat-server";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { sceneImageFor } from "@/lib/scene-image";
import { cn } from "@/lib/utils";
import { OnlineOnly } from "@/components/online-only";
import { useOnline } from "@/lib/online";

export const Route = createFileRoute("/speak/$id")({ component: SpeakScene });

type Turn = { role: "user" | "assistant"; content: string };

function SpeakScene() {
  const { id } = Route.useParams();
  const scenario = useMemo(
    () => speakScenarios.find((s) => s.id === id),
    [id],
  );
  const { user, isPending } = useCurrentUserState();
  const online = useOnline();
  const [turns, setTurns] = useState<Turn[]>(() =>
    scenario
      ? [
          {
            role: "assistant",
            content: `${scenario.openerPt}\n(${scenario.openerEn})`,
          },
        ]
      : [],
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isPending) {
    return (
      <AppShell hideNav>
        <div className="h-40 animate-pulse rounded-[var(--radius-lg)] bg-surface-2" />
      </AppShell>
    );
  }
  // Offline the session can't be checked; the scene (bundled) still opens read-only.
  if (!user && online) return <RedirectToSignIn />;
  if (!scenario) {
    return (
      <AppShell>
        <p>Scene not found.</p>
        <Link to="/speak">Back</Link>
      </AppShell>
    );
  }

  async function onSend() {
    const text = draft.trim();
    if (!text || busy || !scenario || !online || !user) return;
    const nextTurns: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(nextTurns);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const res = await sendChat({
        data: {
          scenarioId: scenario.id,
          messages: nextTurns,
        },
      });
      if (!res.ok) {
        setError(
          !("retryAfter" in res)
            ? res.error
            : res.retryAfter > 3600
              ? "Daily chat limit reached. It resets at 00:00 UTC."
              : `Slow down, try again in ${Math.ceil(res.retryAfter / 60)} min.`,
        );
        return;
      }
      setTurns((t) => [...t, { role: "assistant", content: res.text }]);
    } catch {
      setError("Could not send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const ptOf = (content: string) => content.split("\n")[0] ?? content;

  return (
    <AppShell hideNav>
      <div className="mb-4 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link to="/speak">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            {scenario.level} · {scenario.partner}
          </p>
          <h1 className="truncate font-display text-xl font-medium">{scenario.titlePt}</h1>
        </div>
      </div>

      <div className="mb-4 overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-border)]">
        <img
          src={scenario.image || sceneImageFor(scenario.setting)}
          alt=""
          className="scene aspect-[16/9] w-full object-cover"
        />
      </div>

      <p className="rounded-[var(--radius-md)] bg-soft px-3 py-2 text-sm text-fg">
        {scenario.setting}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {scenario.goals.map((g) => (
          <li
            key={g}
            className="rounded-full bg-surface px-3 py-1 text-xs text-muted shadow-[var(--shadow-border)]"
          >
            {g}
          </li>
        ))}
      </ul>

      <ol className="mt-6 space-y-3">
        {turns.map((t, i) => (
          <li
            key={i}
            className={cn(
              "max-w-[92%] rounded-[var(--radius-lg)] px-3 py-2 text-sm",
              t.role === "user"
                ? "ml-auto bg-accent text-accent-fg"
                : "bg-surface text-fg shadow-[var(--shadow-border)]",
            )}
          >
            <div className="flex items-start gap-1">
              <p className="min-w-0 flex-1 whitespace-pre-wrap">{t.content}</p>
              {t.role === "assistant" && <SpeakButton text={ptOf(t.content)} className="size-9" />}
            </div>
          </li>
        ))}
        {busy && (
          <li className="text-sm text-muted">A pensar…</li>
        )}
      </ol>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {!online && (
        <p className="mt-3 text-sm text-muted">
          You're offline. Your transcript stays here; replies need internet and nothing is sent until you're back.
        </p>
      )}

      <form
        className="sticky bottom-0 mt-6 flex gap-2 bg-bg py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
      >
        <label className="sr-only" htmlFor="line">
          Your line
        </label>
        <input
          id="line"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write in Portuguese…"
          maxLength={500}
          className="h-12 min-h-12 flex-1 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-base text-fg outline-none ring-accent placeholder:text-subtle focus:ring-2"
        />
        <OnlineOnly feature="conversas" label="Send">
          <Button type="submit" size="icon" disabled={busy || (online && !draft.trim())}>
            <Send />
          </Button>
        </OnlineOnly>
      </form>
    </AppShell>
  );
}
