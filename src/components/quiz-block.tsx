import { Loader2, Snail, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NO_VOICE_NOTE } from "@/components/pt-voice-notice";
import { useSpeakPlayback } from "@/components/use-speak-playback";
import { Button } from "@/components/ui/button";
import type { QuizQuestion } from "@/data/types";
import { QUIZ_RATE } from "@/lib/tts";
import { answersMatch, cn } from "@/lib/utils";

const focusable =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function QuizBlock({
  questions,
  onFinished,
  lastLabel = "See results",
  autoFocusOnMount = false,
}: {
  questions: QuizQuestion[];
  onFinished: (correct: number) => void;
  /** Last item of a placement band that continues says "Next band" (#158). */
  lastLabel?: string;
  /** Focus the prompt on mount. Placement sets this after band 1, when the
   *  previous band's button unmounts. Lesson, listen, read, grammar and verb
   *  quizzes leave it off so the page heading keeps focus (#158). */
  autoFocusOnMount?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const { playing, activate, reset, none: noVoice, loading: voiceLoading } = useSpeakPlayback(
    questions[index]?.speak ?? "",
    QUIZ_RATE,
  );
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [typedChecked, setTypedChecked] = useState(false);
  const correctRef = useRef(0);
  const promptRef = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const seenFocus = useRef<string | null>(null);

  const question = questions[index];
  const revealed = question
    ? question.kind === "type"
      ? typedChecked
      : picked !== null
    : false;

  // #158: Next/See results unmounts the control that had focus, and Check
  // unmounts itself. Move focus to the next prompt, or to the result line.
  // The first key is the mount. Skip it unless autoFocusOnMount, and ignore a
  // repeat of the same key so StrictMode's second effect run does not focus.
  useEffect(() => {
    if (!question) return;
    const key = `${index}:${typedChecked ? 1 : 0}`;
    const prev = seenFocus.current;
    seenFocus.current = key;
    if (prev === key) return;
    if (prev === null && !autoFocusOnMount) return;
    if (question.kind === "type" && typedChecked) feedbackRef.current?.focus();
    else promptRef.current?.focus();
  }, [index, typedChecked, question, autoFocusOnMount]);

  if (!question) return null;

  const ok =
    question.kind === "type"
      ? answersMatch(typed, question.accept ?? [])
      : picked === question.answer;

  function lockChoice(i: number) {
    if (picked !== null || question.kind === "type") return;
    setPicked(i);
    if (i === question.answer) correctRef.current += 1;
  }

  function lockType() {
    if (typedChecked || !typed.trim()) return;
    const match = answersMatch(typed, question.accept ?? []);
    setTypedChecked(true);
    if (match) correctRef.current += 1;
  }

  function goNext() {
    if (!revealed) return;
    const last = index >= questions.length - 1;
    if (last) {
      onFinished(correctRef.current);
      return;
    }
    setIndex((n) => n + 1);
    setPicked(null);
    reset();
    setTyped("");
    setTypedChecked(false);
  }

  return (
    <article>
      <p className="text-xs font-medium uppercase tracking-wider text-accent">
        Quiz · {index + 1} / {questions.length}
      </p>
      <h2
        ref={promptRef}
        tabIndex={-1}
        className={cn("mt-2 font-display text-2xl font-medium", focusable)}
      >
        {question.prompt}
      </h2>
      {(question.kind === "listen" || question.speak) && question.speak && (
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            aria-label={
              noVoice ? `Play the line. ${NO_VOICE_NOTE}` : playing === "normal" ? "Stop" : undefined
            }
            aria-pressed={playing === "normal" || undefined}
            aria-disabled={noVoice || undefined}
            title={noVoice ? NO_VOICE_NOTE : undefined}
            className={cn("[&_svg]:size-5", playing === "normal" && "bg-soft text-accent")}
            onClick={() => activate("normal")}
          >
            {playing === "normal" ? (
              <Square className="fill-current" />
            ) : voiceLoading ? (
              <Loader2 className="animate-spin" />
            ) : null}
            {playing === "normal" ? "Stop" : "Play the line"}
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label={
              noVoice
                ? `Play the line slower. ${NO_VOICE_NOTE}`
                : playing === "slow"
                  ? "Stop"
                  : "Play the line slower"
            }
            aria-pressed={playing === "slow" || undefined}
            aria-disabled={noVoice || undefined}
            title={noVoice ? NO_VOICE_NOTE : undefined}
            className={cn("[&_svg]:size-5", playing === "slow" && "bg-soft text-accent")}
            onClick={() => activate("slow")}
          >
            <Snail />
            {playing === "slow" ? "Stop" : "Slower"}
          </Button>
        </div>
      )}

      {question.kind === "type" ? (
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            lockType();
          }}
        >
          <label className="sr-only" htmlFor="typed-answer">
            Your answer
          </label>
          <input
            id="typed-answer"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={typedChecked}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Type in Portuguese…"
            className="h-12 min-h-12 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-base text-fg outline-none ring-accent placeholder:text-subtle focus:ring-2"
          />
          {!typedChecked && (
            <Button type="submit" className="mt-3 w-full" disabled={!typed.trim()}>
              Check
            </Button>
          )}
        </form>
      ) : (
        <ul className="mt-5 space-y-2">
          {(question.options ?? []).map((opt, i) => {
            const selected = picked === i;
            const isAnswer = i === question.answer;
            return (
              <li key={opt}>
                <button
                  type="button"
                  onClick={() => lockChoice(i)}
                  className={cn(
                    "flex min-h-12 w-full items-center rounded-[var(--radius-md)] px-4 py-3 text-left text-sm font-medium shadow-[var(--shadow-border)] transition-colors duration-[var(--motion-quick)]",
                    !revealed && "bg-surface hover:bg-surface-2",
                    revealed && isAnswer && "bg-success text-success-fg",
                    revealed && selected && !isAnswer && "bg-danger text-danger-fg",
                    revealed && !selected && !isAnswer && "bg-surface text-muted",
                  )}
                >
                  {opt}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {revealed && (
        <div className="mt-4">
          <p
            id="quiz-result"
            ref={feedbackRef}
            tabIndex={-1}
            className={cn(
              "text-sm font-medium",
              focusable,
              ok ? "text-success" : "text-danger",
            )}
          >
            {ok ? "That's it." : "Not quite."}
          </p>
          <p className="mt-1 text-sm text-muted">{question.explain}</p>
          {question.kind === "type" && !ok && (question.accept?.[0] ?? "") && (
            <p className="mt-1 text-sm text-fg">
              Expected: <span className="font-medium">{question.accept![0]}</span>
            </p>
          )}
          <Button className="mt-4 w-full" onClick={goNext}>
            {index === questions.length - 1 ? lastLabel : "Next"}
          </Button>
        </div>
      )}
    </article>
  );
}
