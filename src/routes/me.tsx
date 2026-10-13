import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { SpeakButton } from "@/components/speak-button";
import { StartLevelPicker } from "@/components/start-level";
import { DailyReminder } from "@/components/daily-reminder";
import { InstallHint } from "@/components/pwa";
import { OnlineOnly } from "@/components/online-only";
import { lessons, vocabFromCompleted, workingLevel } from "@/data/curriculum";
import { signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useProgress } from "@/lib/progress-store";
import { useOnline } from "@/lib/online";
import { syncProgressWithAccount } from "@/lib/sync-progress";

export const Route = createFileRoute("/me")({ component: MePage });

function MePage() {
  const { user, isPending } = useCurrentUserState();
  const completed = useProgress((s) => s.completed);
  const xp = useProgress((s) => s.xp);
  const streak = useProgress((s) => s.streak);
  const floor = useProgress((s) => s.floor);
  const lastSyncedAt = useProgress((s) => s.lastSyncedAt);
  const syncing = useProgress((s) => s.syncing);
  const syncError = useProgress((s) => s.syncError);
  const syncPending = useProgress((s) => s.syncPending);
  const online = useOnline();
  const doneIds = Object.keys(completed);
  const doneSet = new Set(doneIds);
  const lessonDone = lessons.filter((l) => doneSet.has(l.id)).length;
  const vocab = vocabFromCompleted(doneIds).slice(0, 24);
  const estimated = workingLevel(doneSet, floor);

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-medium tracking-tight">You</h1>
      <p className="mt-2 text-muted">
        A quiet record. No leagues. Show up, sip, leave.
      </p>

      <section className="mt-6 rounded-[var(--radius-xl)] bg-surface p-5 shadow-[var(--shadow-border)]">
        {isPending ? (
          <div className="h-8 w-40 animate-pulse rounded bg-surface-2" />
        ) : user ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{user.displayName ?? "Signed in"}</p>
              <p className="text-sm text-muted">{user.primaryEmail}</p>
              <p className="mt-2 text-sm text-subtle">
                {syncing
                  ? "Saving this path to the account…"
                  : syncPending && !online
                    ? "Waiting to sync, changes saved on this device."
                  : syncError
                    ? syncError
                    : lastSyncedAt
                      ? "Path saved to this account — it follows you on any browser you sign in with."
                      : "Lessons on this account follow you. If a device is behind, open Bica there while signed in."}
              </p>
              {user && !syncing ? (
                <OnlineOnly
                  feature="sync"
                  label={syncError ? "Try again" : "Refresh from account"}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 px-0"
                    onClick={() => void syncProgressWithAccount()}
                  >
                    {syncError ? "Try again" : "Refresh from account"}
                  </Button>
                </OnlineOnly>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        ) : (
          <div>
            <p className="font-medium">Learning as a guest</p>
            <p className="mt-1 text-sm text-muted">
              {lessonDone > 0
                ? "This path lives on this device only. Sign in here — with the same X or Google you use on the other phone or computer — so the lessons can follow you."
                : "Sign in to keep the streak if you switch phones, and to speak with a live partner."}
            </p>
            <Button asChild className="mt-4">
              <OnlineOnly feature="signIn" label="Sign in">
                <Link to="/login">Sign in</Link>
              </OnlineOnly>
            </Button>
          </div>
        )}
      </section>

      <section className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-[var(--radius-lg)] bg-surface p-3 shadow-[var(--shadow-border)]">
          <p className="text-xs text-muted">Streak</p>
          <p className="font-display text-2xl tabular-nums">{streak}</p>
        </div>
        <div className="rounded-[var(--radius-lg)] bg-surface p-3 shadow-[var(--shadow-border)]">
          <p className="text-xs text-muted">Around</p>
          <p className="font-display text-2xl">{estimated}</p>
        </div>
        <div className="rounded-[var(--radius-lg)] bg-surface p-3 shadow-[var(--shadow-border)]">
          <p className="text-xs text-muted">XP</p>
          <p className="font-display text-2xl tabular-nums">{xp}</p>
        </div>
      </section>
      <p className="mt-2 text-sm text-subtle">
        {lessonDone} lessons on the path. Review lives under Practice.
      </p>

      <section className="mt-8">
        <StartLevelPicker label="Treat me as" />
        <p className="mt-2 text-sm text-subtle">
          Today will offer the next unfinished lesson from this level up.
        </p>
      </section>

      <DailyReminder className="mt-8" />

      <InstallHint className="mt-8" />

      <section className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-medium">Phrasebook</h2>
            <p className="mt-1 text-sm text-muted">
              Words from lessons you have finished. Tap the speaker.
            </p>
          </div>
          {vocab.length > 0 && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/review">Palavras</Link>
            </Button>
          )}
        </div>
        {vocab.length === 0 ? (
          <p className="mt-4 text-sm text-subtle">Finish a lesson to fill this page.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-border)]">
            {vocab.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.pt}</p>
                  <p className="truncate text-sm text-muted">{item.en}</p>
                </div>
                <SpeakButton text={item.pt} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
