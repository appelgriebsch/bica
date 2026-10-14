import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { SpeakButton } from "@/components/speak-button";
import { StartLevelPicker } from "@/components/start-level";
import { DailyReminder } from "@/components/daily-reminder";
import { InstallHint } from "@/components/pwa";
import { lessons, vocabFromCompleted, workingLevel } from "@/data/curriculum";
import { useProgress } from "@/lib/progress-store";

export const Route = createFileRoute("/me")({ component: MePage });

function MePage() {
  const completed = useProgress((s) => s.completed);
  const xp = useProgress((s) => s.xp);
  const streak = useProgress((s) => s.streak);
  const floor = useProgress((s) => s.floor);
  const hydrationFailed = useProgress((s) => s.hydrationFailed);
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

      <p className="mt-6 text-sm text-subtle">
        {hydrationFailed
          ? "Couldn't read the progress saved on this device. Reload the page to try again."
          : "Your progress is saved on this device only; nothing leaves the browser."}
      </p>

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
