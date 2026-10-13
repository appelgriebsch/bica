import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Clock3, Headphones, MessageCircle, PenLine, RotateCcw, WholeWord } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StartLevelPicker } from "@/components/start-level";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  dueVocab,
  firstIncomplete,
  firstIncompleteOf,
  grammarDrills,
  lessons,
  levels,
  radioBulletins,
  readingPieces,
  verbDesks,
  workingLevel,
} from "@/data/curriculum";
import { loadPtVoice } from "@/lib/tts";
import { useProgress } from "@/lib/progress-store";
import { greetingForHour, todayKey } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const completed = useProgress((s) => s.completed);
  const xp = useProgress((s) => s.xp);
  const streak = useProgress((s) => s.streak);
  const floor = useProgress((s) => s.floor);
  const cards = useProgress((s) => s.cards);
  const [hour, setHour] = useState(9);

  useEffect(() => {
    setHour(new Date().getHours());
    void loadPtVoice();
  }, []);

  const greet = greetingForHour(hour);
  const doneIds = useMemo(() => new Set(Object.keys(completed)), [completed]);
  const next = firstIncomplete(doneIds, floor);
  const level = workingLevel(doneIds, floor);
  const nextRadio = firstIncompleteOf(radioBulletins, doneIds, level);
  const nextRead = firstIncompleteOf(readingPieces, doneIds, level);
  const nextGram = firstIncompleteOf(grammarDrills, doneIds, level);
  const nextVerb = firstIncompleteOf(verbDesks, doneIds, level);
  const dueCount = dueVocab(Object.keys(completed), cards, todayKey()).length;
  const doneCount = lessons.filter((l) => doneIds.has(l.id)).length;
  const pct = Math.round((doneCount / lessons.length) * 100);
  const todayDone = Object.values(completed).some((r) => {
    const d = new Date(r.completedAt);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  });

  return (
    <AppShell>
      <p className="text-sm font-medium tracking-wide text-accent">{greet.pt}</p>
      <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">
        Portuguese in sips.
      </h1>
      <p className="mt-2 max-w-prose text-muted">
        European Portuguese, under twenty minutes. Built for the gap between
        meetings — then the café, the book, the radio.
      </p>

      {doneCount === 0 && (
        <section className="mt-6">
          <StartLevelPicker label="I am starting at" />
          <p className="mt-2 text-sm text-subtle">
            Jump the early units if you already greet and order. The path stays
            open.
          </p>
        </section>
      )}

      <section className="mt-6 overflow-hidden rounded-[var(--radius-xl)] bg-surface shadow-[var(--shadow-border)]">
        <img
          src={next.image}
          alt=""
          className="scene h-44 w-full object-cover"
        />
        <div className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            {todayDone ? "Done for today — or one more" : "Continue"} · {next.level} ·{" "}
            {next.minutes} min
          </p>
          <h2 className="mt-1 font-display text-2xl font-medium">{next.titlePt}</h2>
          <p className="mt-1 text-muted">{next.title}</p>
          <p className="mt-2 text-sm text-muted">{next.summary}</p>
          <Button asChild className="mt-4 w-full sm:w-auto">
            <Link to="/lesson/$id" params={{ id: next.id }}>
              {doneIds.has(next.id) ? "Revise" : "Start lesson"}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-3 gap-2">
        <Stat label="Streak" value={`${streak}`} hint="days" />
        <Stat label="Lessons" value={`${doneCount}`} hint={`of ${lessons.length}`} />
        <Stat label="XP" value={`${xp}`} hint="quiet points" />
      </section>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>Path</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} />
      </div>

      <Link
        to="/review"
        className="mt-5 flex items-start gap-3 rounded-[var(--radius-lg)] bg-surface p-4 no-underline shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-quick)] hover:shadow-[var(--shadow-border-hover)]"
      >
        <RotateCcw className="mt-0.5 size-5 shrink-0 text-accent" />
        <span className="min-w-0">
          <span className="block text-xs font-medium uppercase tracking-wider text-accent">
            Palavras{dueCount > 0 ? ` · ${dueCount} due` : ""}
          </span>
          <span className="mt-1 block font-medium text-fg">
            {dueCount > 0 ? "Words waiting" : "Caught up"}
          </span>
          <span className="mt-1 block text-sm text-muted">
            {dueCount > 0
              ? "Flip, listen, type. Three minutes, then back to the path."
              : "Finish a lesson and new words join the pile."}
          </span>
        </span>
      </Link>

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link
          to="/listen/$id"
          params={{ id: nextRadio.id }}
          className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-accent p-4 text-accent-fg no-underline"
        >
          <Headphones className="mt-0.5 size-5 shrink-0" />
          <span>
            <span className="block font-medium">Listen</span>
            <span className="mt-1 block text-sm text-accent-fg/80">
              {nextRadio.station} · {nextRadio.titlePt}
            </span>
          </span>
        </Link>
        <Link
          to="/read/$id"
          params={{ id: nextRead.id }}
          className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-surface p-4 no-underline shadow-[var(--shadow-border)]"
        >
          <BookOpen className="mt-0.5 size-5 shrink-0 text-accent" />
          <span>
            <span className="block font-medium text-fg">Read</span>
            <span className="mt-1 block text-sm text-muted">{nextRead.titlePt}</span>
          </span>
        </Link>
        <Link
          to="/grammar"
          className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-surface p-4 no-underline shadow-[var(--shadow-border)]"
        >
          <PenLine className="mt-0.5 size-5 shrink-0 text-accent" />
          <span>
            <span className="block font-medium text-fg">Grammar</span>
            <span className="mt-1 block text-sm text-muted">
              {nextGram.level} · {nextGram.titlePt}
            </span>
          </span>
        </Link>
        <Link
          to="/verbs"
          className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-surface p-4 no-underline shadow-[var(--shadow-border)]"
        >
          <WholeWord className="mt-0.5 size-5 shrink-0 text-accent" />
          <span>
            <span className="block font-medium text-fg">Verbs</span>
            <span className="mt-1 block text-sm text-muted">
              {nextVerb.level} · {nextVerb.titlePt}
            </span>
          </span>
        </Link>
        <Link
          to="/speak"
          className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-surface p-4 no-underline shadow-[var(--shadow-border)]"
        >
          <MessageCircle className="mt-0.5 size-5 shrink-0 text-accent" />
          <span>
            <span className="block font-medium text-fg">Speak</span>
            <span className="mt-1 block text-sm text-muted">A short scene</span>
          </span>
        </Link>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl font-medium">Levels</h2>
        <ul className="mt-3 grid gap-3">
          {levels.map((lv) => {
            const inLevel = lessons.filter((l) => l.level === lv.id);
            const done = inLevel.filter((l) => doneIds.has(l.id)).length;
            const grams = grammarDrills.filter((d) => d.level === lv.id);
            const gDone = grams.filter((d) => doneIds.has(d.id)).length;
            const desks = verbDesks.filter((d) => d.level === lv.id);
            const vDone = desks.filter((d) => doneIds.has(d.id)).length;
            return (
              <li key={lv.id}>
                <Link
                  to="/path"
                  className="flex items-start gap-4 rounded-[var(--radius-lg)] bg-surface p-4 no-underline shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-quick)] hover:shadow-[var(--shadow-border-hover)]"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-md)] bg-soft font-display text-sm font-semibold text-accent">
                    {lv.id}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-fg">{lv.title}</span>
                    <span className="mt-0.5 block text-sm text-muted">{lv.blurb}</span>
                    <span className="mt-2 block text-xs tabular-nums text-subtle">
                      {done}/{inLevel.length} lessons · {gDone}/{grams.length}{" "}
                      grammar · {vDone}/{desks.length} verbs
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-8 flex items-center gap-2 text-sm text-subtle">
        <Clock3 className="size-4" />
        {lessons.length} lessons · {grammarDrills.length} grammar · {verbDesks.length}{" "}
        verb desks · none over 18 minutes
      </p>
    </AppShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-surface px-3 py-3 shadow-[var(--shadow-border)]">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-medium tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-xs text-subtle">{hint}</p>
    </div>
  );
}
