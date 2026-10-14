import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { LevelComplete } from "@/components/level-complete";
import { QuizBlock } from "@/components/quiz-block";
import { SpeakButton } from "@/components/speak-button";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getLesson, newlyCompletedLevel, nextLesson } from "@/data/curriculum";
import type { CefrLevel, Lesson, LessonSection } from "@/data/types";
import { persistCompletion } from "@/lib/record-progress";
import { sceneImageFor } from "@/lib/scene-image";
import { useProgress } from "@/lib/progress-store";
import { cn } from "@/lib/utils";

export function LessonPlayer({ id }: { id: string }) {
  const lesson = getLesson(id);
  if (!lesson) {
    return (
      <div className="p-6">
        <p>Lesson not found.</p>
        <Link to="/path" className="text-accent">
          Back to path
        </Link>
      </div>
    );
  }
  return <Player key={lesson.id} lesson={lesson} />;
}

function Player({ lesson }: { lesson: Lesson }) {
  const steps = useMemo(() => [...lesson.sections, { type: "quiz" as const }], [lesson]);
  const [step, setStep] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const [levelUp, setLevelUp] = useState<CefrLevel | null>(null);

  const totalSteps = steps.length;
  const current = steps[step];
  const pct = done ? 100 : Math.round((step / totalSteps) * 100);

  function goNext() {
    if (step < totalSteps - 1) setStep((s) => s + 1);
  }

  function finishQuiz(finalCorrect: number) {
    const unlocked = newlyCompletedLevel(lesson.id, useProgress.getState().completed);
    setCorrectCount(finalCorrect);
    persistCompletion(
      lesson.id,
      finalCorrect,
      lesson.quiz.length
    );
    setLevelUp(unlocked);
    setDone(true);
  }

  const nxt = nextLesson(lesson.id);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-bg/90 px-3 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Close lesson">
            <Link to="/path">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-muted">
              {levelUp
                ? `${levelUp} · Concluído`
                : `${lesson.level} · ${lesson.titlePt}`}
            </p>
            <Progress value={pct} className="mt-1" />
          </div>
          <p className="text-xs tabular-nums text-subtle">{lesson.minutes} min</p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-5">
        {done ? (
          <DoneCard
            titlePt={lesson.titlePt}
            correct={correctCount}
            total={lesson.quiz.length}
            levelUp={levelUp}
          >
            {levelUp ? undefined : (
              <>
                {nxt && (
                  <Button asChild>
                    <Link to="/lesson/$id" params={{ id: nxt.id }}>
                      Next lesson
                      <ArrowRight />
                    </Link>
                  </Button>
                )}
                <Button asChild variant="outline">
                  <Link to="/path">Path</Link>
                </Button>
              </>
            )}
          </DoneCard>
        ) : current?.type === "quiz" ? (
          <QuizBlock questions={lesson.quiz} onFinished={(n) => finishQuiz(n)} />
        ) : (
          <SectionView section={current as LessonSection} />
        )}
      </div>

      {!done && current?.type !== "quiz" && (
        <div className="sticky bottom-0 border-t border-border bg-bg/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-2xl gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            <Button className="ml-auto min-w-32" onClick={goNext}>
              Continue
              <ArrowRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionView({ section }: { section: LessonSection }) {
  if (section.type === "intro") {
    return (
      <article>
        <p className="text-xs font-medium uppercase tracking-wider text-accent">
          {section.kicker}
        </p>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">
          {section.title}
        </h1>
        <p className="mt-3 text-muted">{section.body}</p>
        <div className="mt-6 rounded-[var(--radius-xl)] bg-accent p-5 text-accent-fg">
          <div className="flex items-start justify-between gap-2">
            <p className="font-display text-2xl font-medium">{section.phrase.pt}</p>
            <SpeakButton
              text={section.phrase.pt}
              className="text-accent-fg hover:bg-tile"
            />
          </div>
          <p className="mt-2 text-sm text-accent-fg/80">{section.phrase.en}</p>
        </div>
      </article>
    );
  }

  if (section.type === "vocab") {
    return (
      <article>
        <h2 className="font-display text-2xl font-medium">Words that work</h2>
        <p className="mt-1 text-sm text-muted">Tap a card. Play the sound. Say it back.</p>
        <ul className="mt-4 space-y-2">
          {section.items.map((item) => (
            <li
              key={item.pt}
              className="rounded-[var(--radius-lg)] bg-surface p-3 shadow-[var(--shadow-border)]"
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl font-medium">{item.pt}</p>
                  <p className="text-xs text-subtle">{item.hint}</p>
                  <p className="mt-1 text-sm text-muted">{item.en}</p>
                  <p className="mt-2 text-sm">
                    <span className="text-fg">{item.examplePt}</span>
                    <span className="block text-subtle">{item.exampleEn}</span>
                  </p>
                </div>
                <SpeakButton text={item.examplePt || item.pt} />
              </div>
            </li>
          ))}
        </ul>
      </article>
    );
  }

  if (section.type === "grammar") {
    return (
      <article>
        <h2 className="font-display text-2xl font-medium">{section.title}</h2>
        <p className="mt-3 text-muted">{section.body}</p>
        <ul className="mt-4 space-y-2">
          {section.examples.map((ex) => (
            <li
              key={ex.pt}
              className="flex items-start gap-2 rounded-[var(--radius-md)] bg-surface p-3 shadow-[var(--shadow-border)]"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{ex.pt}</p>
                <p className="text-sm text-muted">{ex.en}</p>
              </div>
              <SpeakButton text={ex.pt} />
            </li>
          ))}
        </ul>
      </article>
    );
  }

  if (section.type === "dialogue") {
    const sceneSrc = sceneImageFor(section.setting);
    return (
      <article>
        <div className="overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-border)]">
          <img
            src={sceneSrc}
            alt=""
            className="scene aspect-[16/9] w-full object-cover"
          />
        </div>
        <h2 className="mt-4 font-display text-2xl font-medium">A short scene</h2>
        <p className="mt-1 text-sm text-muted">{section.setting}</p>
        <ol className="mt-4 space-y-2">
          {section.lines.map((line, i) => (
            <li
              key={i}
              className={cn(
                "rounded-[var(--radius-lg)] p-3",
                line.speaker === "You" || line.speaker.startsWith("You")
                  ? "ml-4 bg-soft"
                  : "mr-4 bg-surface shadow-[var(--shadow-border)]",
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-accent">
                    {line.speaker}
                  </p>
                  <p className="mt-0.5 font-medium">{line.pt}</p>
                  <p className="text-sm text-muted">{line.en}</p>
                </div>
                <SpeakButton text={line.pt} />
              </div>
            </li>
          ))}
        </ol>
      </article>
    );
  }

  return (
    <article>
      <p className="text-xs font-medium uppercase tracking-wider text-accent">Portugal</p>
      <h2 className="mt-1 font-display text-2xl font-medium">{section.title}</h2>
      <p className="mt-3 text-muted">{section.body}</p>
    </article>
  );
}

export function DoneCard({
  titlePt,
  correct,
  total,
  levelUp,
  children,
}: {
  titlePt: string;
  correct: number;
  total: number;
  levelUp?: CefrLevel | null;
  children?: ReactNode;
}) {
  if (levelUp) {
    return (
      <LevelComplete
        level={levelUp}
        footnote={`${titlePt} · ${correct}/${total} on the quiz`}
      >
        {children}
      </LevelComplete>
    );
  }
  const pass = total > 0 && correct / total >= 0.6;
  return (
    <article className="flex flex-1 flex-col">
      <div className="grid size-14 place-items-center rounded-full bg-success text-success-fg">
        <Check className="size-6" />
      </div>
      <h1 className="mt-4 font-display text-3xl font-medium">
        {pass ? "Boa." : "Keep the cup warm."}
      </h1>
      <p className="mt-2 text-muted">
        {titlePt} · {correct}/{total} on the quiz.
        {pass
          ? " That's a solid sip. Come back tomorrow."
          : " Redo whenever you like — it stays open."}
      </p>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        {children}
        <Button asChild variant="ghost">
          <Link to="/">Today</Link>
        </Button>
      </div>
    </article>
  );
}
