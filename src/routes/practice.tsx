import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Check, Headphones, MessageCircle, PenLine, RotateCcw, WholeWord } from "lucide-react";
import { OnlineOnly } from "@/components/online-only";
import { AppShell } from "@/components/app-shell";
import {
  dueVocab,
  firstIncompleteOf,
  grammarDrills,
  levels,
  radioBulletins,
  readingPieces,
  speakScenarios,
  verbDesks,
  workingLevel,
} from "@/data/curriculum";
import { useProgress } from "@/lib/progress-store";
import { cn, todayKey } from "@/lib/utils";

export const Route = createFileRoute("/practice")({ component: PracticePage });

function PracticePage() {
  const completed = useProgress((s) => s.completed);
  const cards = useProgress((s) => s.cards);
  const floor = useProgress((s) => s.floor);
  const doneIds = new Set(Object.keys(completed));
  const level = workingLevel(doneIds, floor);
  const nextRadio = firstIncompleteOf(radioBulletins, doneIds, level);
  const nextRead = firstIncompleteOf(readingPieces, doneIds, level);
  const nextGram = firstIncompleteOf(grammarDrills, doneIds, level);
  const nextVerb = firstIncompleteOf(verbDesks, doneIds, level);
  const radioDone = radioBulletins.filter((b) => doneIds.has(b.id)).length;
  const readDone = readingPieces.filter((p) => doneIds.has(p.id)).length;
  const gramDone = grammarDrills.filter((d) => doneIds.has(d.id)).length;
  const verbDone = verbDesks.filter((d) => doneIds.has(d.id)).length;
  const dueCount = dueVocab(Object.keys(completed), cards, todayKey()).length;


  return (
    <AppShell>
      <h1 className="font-display text-3xl font-medium tracking-tight">Practice</h1>
      <p className="mt-2 text-muted">
        The path teaches. This page is the country: a bulletin, a page, a café
        counter, a grammar drill, a verb desk, the words you already met.
      </p>

      <ul className="mt-6 grid gap-3">
        <li>
          <Link
            to="/listen/$id"
            params={{ id: nextRadio.id }}
            className="block overflow-hidden rounded-[var(--radius-lg)] bg-surface no-underline shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-quick)] hover:shadow-[var(--shadow-border-hover)]"
          >
            <div className="flex">
              <img
                src="/scenes/radio.jpg"
                alt=""
                className="scene hidden h-32 w-28 shrink-0 object-cover sm:block"
              />
              <div className="flex flex-1 items-start gap-3 p-4">
                <Headphones className="mt-0.5 size-5 shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-accent">
                    Listen · {radioDone}/{radioBulletins.length}
                  </p>
                  <h2 className="mt-1 font-display text-xl font-medium">Rádio</h2>
                  <p className="mt-1 text-sm text-muted">
                    {nextRadio.station}: {nextRadio.titlePt}. Under {nextRadio.minutes}{" "}
                    minutes.
                  </p>
                </div>
              </div>
            </div>
          </Link>
        </li>
        <li>
          <Link
            to="/read/$id"
            params={{ id: nextRead.id }}
            className="block overflow-hidden rounded-[var(--radius-lg)] bg-surface no-underline shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-quick)] hover:shadow-[var(--shadow-border-hover)]"
          >
            <div className="flex">
              <img
                src="/scenes/books.jpg"
                alt=""
                className="scene hidden h-32 w-28 shrink-0 object-cover sm:block"
              />
              <div className="flex flex-1 items-start gap-3 p-4">
                <BookOpen className="mt-0.5 size-5 shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-accent">
                    Read · {readDone}/{readingPieces.length}
                  </p>
                  <h2 className="mt-1 font-display text-xl font-medium">Uma página</h2>
                  <p className="mt-1 text-sm text-muted">
                    {nextRead.titlePt} — {nextRead.source}.
                  </p>
                </div>
              </div>
            </div>
          </Link>
        </li>
        <li>
          <Link
            to="/grammar"
            className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-surface p-4 no-underline shadow-[var(--shadow-border)]"
          >
            <PenLine className="mt-0.5 size-5 shrink-0 text-accent" />
            <span>
              <span className="block text-xs font-medium uppercase tracking-wider text-accent">
                Grammar · {gramDone}/{grammarDrills.length}
              </span>
              <span className="mt-1 block font-display text-xl font-medium text-fg">
                Gramática
              </span>
              <span className="mt-1 block text-sm text-muted">
                {nextGram.level}: {nextGram.titlePt}. Three drills on every
                level, {nextGram.minutes} min each.
              </span>
            </span>
          </Link>
        </li>
        <li>
          <Link
            to="/verbs"
            className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-surface p-4 no-underline shadow-[var(--shadow-border)]"
          >
            <WholeWord className="mt-0.5 size-5 shrink-0 text-accent" />
            <span>
              <span className="block text-xs font-medium uppercase tracking-wider text-accent">
                Verbs · {verbDone}/{verbDesks.length}
              </span>
              <span className="mt-1 block font-display text-xl font-medium text-fg">
                Verbos
              </span>
              <span className="mt-1 block text-sm text-muted">
                {nextVerb.level}: {nextVerb.titlePt}. Persons, then a quiz.
                Present through will, would, and if.
              </span>
            </span>
          </Link>
        </li>
        <li>
          <OnlineOnly feature="conversas" label="Conversas" placement="corner">
            <Link
              to="/speak"
              className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-accent p-4 text-accent-fg no-underline [&>svg:first-child]:text-accent-fg/70"
            >
              <MessageCircle className="mt-0.5 size-5 shrink-0" />
              <span>
                <span className="block text-xs font-medium uppercase tracking-wider text-accent-fg/80">
                  Speak · {speakScenarios.length} scenes
                </span>
                <span className="mt-1 block font-display text-xl font-medium">
                  Conversas
                </span>
                <span className="mt-1 block text-sm text-accent-fg/80">
                  Café, tickets, disagreement — a Lisbon partner.
                </span>
              </span>
            </Link>
          </OnlineOnly>
        </li>
        <li>
          <Link
            to="/review"
            className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-surface p-4 no-underline shadow-[var(--shadow-border)]"
          >
            <RotateCcw className="mt-0.5 size-5 shrink-0 text-accent" />
            <span>
              <span className="block text-xs font-medium uppercase tracking-wider text-accent">
                Review{dueCount > 0 ? ` · ${dueCount} due` : ""}
              </span>
              <span className="mt-1 block font-display text-xl font-medium text-fg">
                Palavras
              </span>
              <span className="mt-1 block text-sm text-muted">
                {dueCount > 0
                  ? "Flip, listen, type. Due today, then tomorrow, a week, a month."
                  : "Finish a lesson and new words join the pile."}
              </span>
            </span>
          </Link>
        </li>
      </ul>

      <section className="mt-10">
        <h2 className="font-display text-xl font-medium">Bulletins</h2>
        <ul className="mt-3 grid gap-2">
          {radioBulletins.map((b) => (
            <li key={b.id}>
              <Link
                to="/listen/$id"
                params={{ id: b.id }}
                className="flex items-center gap-3 rounded-[var(--radius-md)] bg-surface px-3 py-3 no-underline shadow-[var(--shadow-border)]"
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]",
                    doneIds.has(b.id) ? "bg-success text-success-fg" : "bg-soft text-accent",
                  )}
                >
                  {doneIds.has(b.id) ? <Check className="size-4" /> : <Headphones className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{b.titlePt}</span>
                  <span className="block text-xs text-subtle">
                    {b.level} · {b.station} · {b.minutes} min
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-xl font-medium">Pages</h2>
        <ul className="mt-3 grid gap-2">
          {readingPieces.map((p) => (
            <li key={p.id}>
              <Link
                to="/read/$id"
                params={{ id: p.id }}
                className="flex items-center gap-3 rounded-[var(--radius-md)] bg-surface px-3 py-3 no-underline shadow-[var(--shadow-border)]"
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]",
                    doneIds.has(p.id) ? "bg-success text-success-fg" : "bg-soft text-accent",
                  )}
                >
                  {doneIds.has(p.id) ? <Check className="size-4" /> : <BookOpen className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">{p.titlePt}</span>
                  <span className="block text-xs text-subtle">
                    {p.level} · {p.minutes} min
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-8">
        <h2 className="font-display text-xl font-medium">Grammar by level</h2>
        <div className="mt-3 space-y-6">
          {levels.map((lv) => {
            const drills = grammarDrills.filter((d) => d.level === lv.id);
            const done = drills.filter((d) => doneIds.has(d.id)).length;
            return (
              <div key={lv.id}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-accent">
                  {lv.id} · {done}/{drills.length}
                </p>
                <ul className="grid min-w-0 gap-2">
                  {drills.map((d) => (
                    <li key={d.id} className="min-w-0">
                      <Link
                        to="/grammar/$id"
                        params={{ id: d.id }}
                        className="flex min-w-0 w-full items-center gap-3 rounded-[var(--radius-md)] bg-surface px-3 py-3 no-underline shadow-[var(--shadow-border)]"
                      >
                        <span
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]",
                            doneIds.has(d.id)
                              ? "bg-success text-success-fg"
                              : "bg-soft text-accent",
                          )}
                        >
                          {doneIds.has(d.id) ? (
                            <Check className="size-4" />
                          ) : (
                            <PenLine className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 overflow-hidden">
                          <span className="block truncate font-medium text-fg">
                            {d.titlePt}
                          </span>
                          <span className="block truncate text-xs text-subtle">
                            {d.minutes} min · {d.focus}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="font-display text-xl font-medium">Verbs by level</h2>
        <div className="mt-3 space-y-6">
          {levels.map((lv) => {
            const desks = verbDesks.filter((d) => d.level === lv.id);
            const done = desks.filter((d) => doneIds.has(d.id)).length;
            return (
              <div key={lv.id}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-accent">
                  {lv.id} · {done}/{desks.length}
                </p>
                <ul className="grid min-w-0 gap-2">
                  {desks.map((d) => (
                    <li key={d.id} className="min-w-0">
                      <Link
                        to="/verbs/$id"
                        params={{ id: d.id }}
                        className="flex min-w-0 w-full items-center gap-3 rounded-[var(--radius-md)] bg-surface px-3 py-3 no-underline shadow-[var(--shadow-border)]"
                      >
                        <span
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-[var(--radius-sm)]",
                            doneIds.has(d.id)
                              ? "bg-success text-success-fg"
                              : "bg-soft text-accent",
                          )}
                        >
                          {doneIds.has(d.id) ? (
                            <Check className="size-4" />
                          ) : (
                            <WholeWord className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 overflow-hidden">
                          <span className="block truncate font-medium text-fg">
                            {d.titlePt}
                          </span>
                          <span className="block truncate text-xs text-subtle">
                            {d.minutes} min · {d.focus}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
