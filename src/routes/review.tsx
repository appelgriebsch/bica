import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { SpeakButton } from "@/components/speak-button";
import { Button } from "@/components/ui/button";
import { dueVocab, levels, vocabFromCompleted, type CatalogVocab } from "@/data/curriculum";
import type { CefrLevel } from "@/data/types";
import { useProgress } from "@/lib/progress-store";
import { REVIEW_SESSION_CAP } from "@/lib/srs";
import { speakPt } from "@/lib/tts";
import { answersMatch, cn, todayKey } from "@/lib/utils";

export const Route = createFileRoute("/review")({ component: ReviewPage });

type Mode = "mix" | "flip" | "type";
type Filter = "all" | CefrLevel;
type CardKind = "flip" | "type";
type QueueCard = CatalogVocab & { kind: CardKind; seen: number };

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function acceptFor(pt: string): string[] {
  const list = [pt];
  const stripped = pt.replace(/^(o|a|os|as|um|uma)\s+/i, "");
  if (stripped !== pt) list.push(stripped);
  return list;
}

function buildQueue(items: CatalogVocab[], mode: Mode): QueueCard[] {
  return shuffle(items)
    .slice(0, REVIEW_SESSION_CAP)
    .map((item, i) => ({
      ...item,
      kind:
        mode === "type" ? "type" : mode === "flip" ? "flip" : i % 2 === 0 ? "flip" : "type",
      seen: 0,
    }));
}

function ReviewPage() {
  const completed = useProgress((s) => s.completed);
  const cards = useProgress((s) => s.cards);
  const gradeVocab = useProgress((s) => s.gradeVocab);
  const touchStudy = useProgress((s) => s.touchStudy);
  const today = todayKey();
  const doneIds = useMemo(() => Object.keys(completed), [completed]);

  const pool = useMemo(() => vocabFromCompleted(doneIds), [doneIds]);
  const [filter, setFilter] = useState<Filter>("all");
  const due = useMemo(
    () => dueVocab(doneIds, cards, today, filter === "all" ? undefined : filter),
    [doneIds, cards, today, filter],
  );
  const dueAll = useMemo(() => dueVocab(doneIds, cards, today), [doneIds, cards, today]);

  const [phase, setPhase] = useState<"hub" | "session" | "done">("hub");
  const [queue, setQueue] = useState<QueueCard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");
  const [typedChecked, setTypedChecked] = useState(false);
  const [known, setKnown] = useState(0);

  const card = queue[index];
  const totalPlanned = Math.min(due.length, REVIEW_SESSION_CAP);

  const levelsWithVocab = levels.filter((lv) =>
    pool.some((item) => item.level === lv.id),
  );

  function start(mode: Mode) {
    const next = buildQueue(due, mode);
    if (next.length === 0) return;
    setQueue(next);
    setIndex(0);
    setFlipped(false);
    setTyped("");
    setTypedChecked(false);
    setKnown(0);
    setPhase("session");
  }

  function finishSession(knewCount: number) {
    touchStudy(4 + knewCount);
    setPhase("done");
  }

  function advance(knew: boolean, current: QueueCard) {
    gradeVocab(current.id, knew);
    const nextKnown = knew ? known + 1 : known;
    if (knew) setKnown(nextKnown);

    let nextQueue = queue;
    if (!knew && current.seen < 1) {
      nextQueue = [...queue, { ...current, seen: current.seen + 1 }];
      setQueue(nextQueue);
    }

    if (index >= nextQueue.length - 1) {
      finishSession(nextKnown);
      return;
    }
    setIndex((n) => n + 1);
    setFlipped(false);
    setTyped("");
    setTypedChecked(false);
  }

  useEffect(() => {
    if (phase !== "session" || !card || card.kind !== "flip" || flipped) return;
    void speakPt(card.pt, 0.88);
  }, [phase, card?.id, card?.kind, flipped]);

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-medium tracking-tight">Palavras</h1>
      <p className="mt-2 text-muted">
        Words from lessons you finished. Due today come back. New ones join the
        pile. Flip, or type the Portuguese.
      </p>

      {pool.length === 0 ? (
        <div className="mt-8 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-border)]">
          <p className="font-medium">Nothing to review yet.</p>
          <p className="mt-1 text-sm text-muted">Finish a lesson on the path first.</p>
          <Button asChild className="mt-4">
            <Link to="/path">Open the path</Link>
          </Button>
        </div>
      ) : phase === "done" ? (
        <div className="mt-8">
          <h2 className="font-display text-2xl font-medium">Boa.</h2>
          <p className="mt-2 text-muted">
            {known} felt ready. Again waits until later today or tomorrow — then
            three days, a week, a month.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link to="/">Today</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => setPhase("hub")}>
              Palavras
            </Button>
          </div>
        </div>
      ) : phase === "session" && card ? (
        <SessionCard
          card={card}
          position={index + 1}
          remaining={queue.length}
          flipped={flipped}
          typed={typed}
          typedChecked={typedChecked}
          onFlip={() => setFlipped((v) => !v)}
          onTyped={setTyped}
          onCheck={() => setTypedChecked(true)}
          onGrade={(knew) => advance(knew, card)}
        />
      ) : (
        <div className="mt-8">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Due today · {dueAll.length}
          </p>
          <p className="mt-1 text-sm text-muted">
            {totalPlanned > 0
              ? `A sip of ${Math.min(due.length, REVIEW_SESSION_CAP)} from this pile.`
              : "Caught up in this pile. Switch level, or come back tomorrow."}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <FilterChip
              label="Today"
              on={filter === "all"}
              count={dueAll.length}
              onClick={() => setFilter("all")}
            />
            {levelsWithVocab.map((lv) => (
              <FilterChip
                key={lv.id}
                label={lv.id}
                on={filter === lv.id}
                count={dueVocab(doneIds, cards, today, lv.id).length}
                onClick={() => setFilter(lv.id)}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button disabled={due.length === 0} onClick={() => start("mix")}>
              Start · mix
            </Button>
            <Button
              variant="outline"
              disabled={due.length === 0}
              onClick={() => start("flip")}
            >
              Listen and flip
            </Button>
            <Button
              variant="outline"
              disabled={due.length === 0}
              onClick={() => start("type")}
            >
              Type Portuguese
            </Button>
          </div>
          <p className="mt-3 text-sm text-subtle">
            Mix plays Portuguese first, then asks you to type it. Honest taps
            schedule tomorrow, three days, a week.
          </p>
        </div>
      )}
    </AppShell>
  );
}

function FilterChip({
  label,
  on,
  count,
  onClick,
}: {
  label: string;
  on: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-[var(--radius-md)] px-4 text-sm font-medium transition-colors duration-[var(--motion-quick)]",
        on
          ? "bg-accent text-accent-fg"
          : "bg-surface text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
      )}
    >
      {label}
      <span className={cn("ml-2 tabular-nums", on ? "text-accent-fg/80" : "text-subtle")}>
        {count}
      </span>
    </button>
  );
}

function SessionCard({
  card,
  position,
  remaining,
  flipped,
  typed,
  typedChecked,
  onFlip,
  onTyped,
  onCheck,
  onGrade,
}: {
  card: QueueCard;
  position: number;
  remaining: number;
  flipped: boolean;
  typed: string;
  typedChecked: boolean;
  onFlip: () => void;
  onTyped: (value: string) => void;
  onCheck: () => void;
  onGrade: (knew: boolean) => void;
}) {
  const typedOk = typedChecked && answersMatch(typed, acceptFor(card.pt));
  const revealed = card.kind === "flip" ? flipped : typedChecked;

  return (
    <div className="mt-8">
      <p className="text-xs tabular-nums text-subtle">
        {position} / {remaining} · {card.level}
      </p>

      {card.kind === "flip" ? (
        <button
          type="button"
          onClick={onFlip}
          className="mt-3 min-h-48 w-full rounded-[var(--radius-xl)] bg-surface p-6 text-left shadow-[var(--shadow-border)]"
        >
          <p className="font-display text-3xl font-medium">{card.pt}</p>
          <p className="mt-1 text-sm text-subtle">{card.hint}</p>
          {flipped ? (
            <div className="mt-6">
              <p className="text-lg text-fg">{card.en}</p>
              <p className="mt-3 text-sm text-muted">{card.examplePt}</p>
              <p className="text-sm text-subtle">{card.exampleEn}</p>
            </div>
          ) : (
            <p className="mt-10 text-sm text-subtle">Tap to flip</p>
          )}
        </button>
      ) : (
        <div className="mt-3 min-h-48 rounded-[var(--radius-xl)] bg-surface p-6 shadow-[var(--shadow-border)]">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Type the Portuguese
          </p>
          <p className="mt-2 font-display text-2xl font-medium">{card.en}</p>
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) onCheck();
            }}
          >
            <label className="sr-only" htmlFor="palavras-type">
              Portuguese
            </label>
            <input
              id="palavras-type"
              value={typed}
              onChange={(e) => onTyped(e.target.value)}
              disabled={typedChecked}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Type in Portuguese…"
              className="h-12 min-h-12 w-full rounded-[var(--radius-md)] border border-border bg-bg px-3 text-base text-fg outline-none ring-accent placeholder:text-subtle focus:ring-2"
            />
            {!typedChecked && (
              <Button type="submit" className="mt-3 w-full" disabled={!typed.trim()}>
                Check
              </Button>
            )}
          </form>
          {typedChecked && (
            <div className="mt-4">
              <p className={cn("text-sm font-medium", typedOk ? "text-success" : "text-danger")}>
                {typedOk ? "That's it." : "Not quite."}
              </p>
              <p className="mt-1 font-medium text-fg">{card.pt}</p>
              <p className="mt-2 text-sm text-muted">{card.examplePt}</p>
              <p className="text-sm text-subtle">{card.exampleEn}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SpeakButton text={card.examplePt || card.pt} />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button
            variant="outline"
            disabled={!revealed}
            onClick={() => onGrade(false)}
          >
            Again
          </Button>
          <Button disabled={!revealed} onClick={() => onGrade(true)}>
            I know this
          </Button>
        </div>
      </div>
    </div>
  );
}
