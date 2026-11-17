import { createFileRoute, Link } from "@tanstack/react-router";
import { BookmarkPlus, Camera, Check, QrCode } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { SpeakButton } from "@/components/speak-button";
import { StartLevelPicker } from "@/components/start-level";
import { DailyReminder } from "@/components/daily-reminder";
import { InstallHint } from "@/components/pwa";
import { HYDRATION_FAILED } from "@/lib/transfer-merge";
import { announce } from "@/lib/online";
import {
  lessons,
  phraseGroups,
  travelPhrases,
  vocabFromCompleted,
  workingLevel,
} from "@/data/curriculum";
import type { TravelPhrase } from "@/data/types";
import { useProgress } from "@/lib/progress-store";

export const Route = createFileRoute("/me")({ component: MePage });

function MePage() {
  const completed = useProgress((s) => s.completed);
  const cards = useProgress((s) => s.cards);
  const saveToPalabras = useProgress((s) => s.saveToPalabras);
  const xp = useProgress((s) => s.xp);
  const streak = useProgress((s) => s.streak);
  const floor = useProgress((s) => s.floor);
  const hydrationFailed = useProgress((s) => s.hydrationFailed);
  const doneIds = Object.keys(completed);
  const doneSet = new Set(doneIds);
  const lessonDone = lessons.filter((l) => doneSet.has(l.id)).length;
  const vocab = vocabFromCompleted(doneIds).slice(0, 24);
  const groups = phraseGroups();
  const savedCount = travelPhrases.filter((p) => cards[p.id]).length;
  const estimated = workingLevel(doneSet, floor);

  function savePhrase(phrase: TravelPhrase) {
    saveToPalabras(phrase.id);
    toast("Added to Palavras.");
    announce("Added to Palavras.");
  }

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-medium tracking-tight">You</h1>
      <p className="mt-2 text-muted">
        A quiet record. No leagues. Show up, sip, leave.
      </p>

      <p className="mt-6 text-sm text-subtle">
        {hydrationFailed
          ? HYDRATION_FAILED
          : "Your progress is saved on this device. It is shared only when you choose Send progress."}
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

      <section className="paper-card mt-8 rounded-[var(--radius-lg)] p-4">
        <h2 className="font-display text-xl font-medium">Move progress</h2>
        <p className="mt-1 text-sm text-muted">
          Copy progress between devices. Nothing is uploaded.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button asChild>
            <Link to="/me/send" className="no-underline">
              <QrCode aria-hidden /> Send progress
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/me/receive" className="no-underline">
              <Camera aria-hidden /> Receive progress
            </Link>
          </Button>
        </div>
        <p className="mt-3 text-sm text-subtle">
          One direction at a time. For both ways, repeat with the phones swapped.
        </p>
      </section>

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
              Trip phrases for the road, plus words from lessons you finished. Tap the
              speaker.
            </p>
          </div>
          {(vocab.length > 0 || savedCount > 0) && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/review">Palavras</Link>
            </Button>
          )}
        </div>

        <h3 className="mt-6 font-display text-lg font-medium">On the trip</h3>
        <p className="mt-1 text-sm text-muted">By situation. Works offline.</p>
        {groups.map((group) => (
          <div key={group.situation} className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-accent">
              {group.labelPt}
              <span className="ml-2 font-sans normal-case tracking-normal text-muted">
                {group.labelEn}
              </span>
            </p>
            <ul className="mt-2 divide-y divide-border rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-border)]">
              {group.phrases.map((phrase) => (
                <PhraseRow
                  key={phrase.id}
                  phrase={phrase}
                  saved={Boolean(cards[phrase.id])}
                  onSave={() => savePhrase(phrase)}
                />
              ))}
            </ul>
          </div>
        ))}

        <h3 className="mt-8 font-display text-lg font-medium">From your lessons</h3>
        {vocab.length === 0 ? (
          <p className="mt-4 text-sm text-subtle">Finish a lesson to fill this part.</p>
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

      <p className="mt-8 text-center text-sm">
        <Link to="/about" className="font-medium text-accent no-underline hover:underline">
          About
        </Link>
      </p>
    </AppShell>
  );
}

function PhraseRow({
  phrase,
  saved,
  onSave,
}: {
  phrase: TravelPhrase;
  saved: boolean;
  onSave: () => void;
}) {
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{phrase.pt}</p>
        <p className="truncate text-sm text-muted">{phrase.en}</p>
      </div>
      <SpeakButton text={phrase.pt} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={saved ? `In Palavras: ${phrase.pt}` : `Add to Palavras: ${phrase.pt}`}
        aria-pressed={saved || undefined}
        title={saved ? "In Palavras" : "Add to Palavras"}
        className={saved ? "text-success" : "text-muted hover:text-accent"}
        onClick={(e) => {
          e.stopPropagation();
          if (saved) {
            toast("Already in Palavras.");
            return;
          }
          onSave();
        }}
      >
        {saved ? <Check /> : <BookmarkPlus />}
      </Button>
    </li>
  );
}
