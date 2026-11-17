import { Loader2, Snail, Square } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { NO_VOICE_NOTE } from "@/components/pt-voice-notice";
import { Button } from "@/components/ui/button";
import type { QuizQuestion } from "@/data/types";
import { QUIZ_RATE, SLOW_RATE, speakPt, stopSpeaking, usePtVoiceStatus } from "@/lib/tts";
import { answersMatch, cn } from "@/lib/utils";

export function QuizBlock({
  questions,
  onFinished,
}: {
  questions: QuizQuestion[];
  onFinished: (correct: number) => void;
}) {
  const voiceStatus = usePtVoiceStatus();
  const noVoice = voiceStatus === "none";
  const voiceLoading = voiceStatus === "loading";
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState<"normal" | "slow" | null>(null);
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

  function activate(kind: "normal" | "slow") {
    if (noVoice) {
      toast(NO_VOICE_NOTE, { id: "no-pt-voice" });
      return;
    }
    if (playing === kind) {
      stopSpeaking();
      setPlaying(null);
      return;
    }
    setPlaying(kind);
    void speakPt(question.speak!, kind === "slow" ? SLOW_RATE : QUIZ_RATE).finally(() =>
      setPlaying((p) => (p === kind ? null : p)),
    );
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
    setPlaying(null);
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
            className={cn(
              playing === "normal" && "bg-soft text-accent",
              noVoice && "opacity-60",
            )}
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
            className={cn(playing === "slow" && "bg-soft text-accent", noVoice && "opacity-60")}
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
