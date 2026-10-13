import { useRef, useState } from "react";
import { NO_VOICE_NOTE } from "@/components/pt-voice-notice";
import { Button } from "@/components/ui/button";
import type { QuizQuestion } from "@/data/types";
import { speakPt, usePtVoiceStatus } from "@/lib/tts";
import { answersMatch, cn } from "@/lib/utils";

export function QuizBlock({
  questions,
  onFinished,
}: {
  questions: QuizQuestion[];
  onFinished: (correct: number) => void;
}) {
  const noVoice = usePtVoiceStatus() === "none";
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [typedChecked, setTypedChecked] = useState(false);
  const correctRef = useRef(0);

  const question = questions[index];
  if (!question) return null;

  const revealed =
    question.kind === "type" ? typedChecked : picked !== null;
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
    setTyped("");
    setTypedChecked(false);
  }

  return (
    <article>
      <p className="text-xs font-medium uppercase tracking-wider text-accent">
        Quiz · {index + 1} / {questions.length}
      </p>
      <h2 className="mt-2 font-display text-2xl font-medium">{question.prompt}</h2>
      {(question.kind === "listen" || question.speak) && question.speak && (
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={noVoice}
          title={noVoice ? NO_VOICE_NOTE : undefined}
          onClick={() => void speakPt(question.speak!, 0.86)}
        >
          Play the line
        </Button>
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
          <p className={cn("text-sm font-medium", ok ? "text-success" : "text-danger")}>
            {ok ? "That's it." : "Not quite."}
          </p>
          <p className="mt-1 text-sm text-muted">{question.explain}</p>
          {question.kind === "type" && !ok && (question.accept?.[0] ?? "") && (
            <p className="mt-1 text-sm text-fg">
              Expected: <span className="font-medium">{question.accept![0]}</span>
            </p>
          )}
          <Button className="mt-4 w-full" onClick={goNext}>
            {index === questions.length - 1 ? "See results" : "Next"}
          </Button>
        </div>
      )}
    </article>
  );
}
