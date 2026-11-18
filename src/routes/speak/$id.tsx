import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookmarkPlus, Check, Flag, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { MicButton } from "@/components/mic-button";
import { SaveWordPanel } from "@/components/save-word-panel";
import { SceneReview } from "@/components/scene-review";
import { Button } from "@/components/ui/button";
import { SpeakButton } from "@/components/speak-button";
import { speakScenarios } from "@/data/curriculum";
import { chatCardId, clampSelection, glossOf, needsGlossCaveat } from "@/lib/chat-words";
import type { Correction } from "@/lib/chat-core";
import { reviewScene, sendChat } from "@/lib/chat-server";
import { chatErrorMessage } from "@/lib/chat-messages";
import { announce, useOnline } from "@/lib/online";
import { useProgress } from "@/lib/progress-store";
import { createTurnstile } from "@/lib/turnstile";
import { sceneImageFor } from "@/lib/scene-image";
import { cn } from "@/lib/utils";
import { OnlineOnly } from "@/components/online-only";

export const Route = createFileRoute("/speak/$id")({ component: SpeakScene });

type Turn = { role: "user" | "assistant"; content: string };
type ReviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; corrections: Correction[] }
  | { status: "error"; message: string };

function SpeakScene() {
  const { id } = Route.useParams();
  const scenario = useMemo(
    () => speakScenarios.find((s) => s.id === id),
    [id],
  );
  const online = useOnline();
  const [turns, setTurns] = useState<Turn[]>(() =>
    scenario
      ? [
          {
            role: "assistant",
            content: `${scenario.openerPt}\n(${scenario.openerEn})`,
          },
        ]
      : [],
  );
  const [draft, setDraft] = useState("");
  // #83 (ADR 0020): spoken answers — the mic streams the pt-PT transcript into `draft`.
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // #80 (ADR 0019): save a partner line/word to Palavras; saving is local, works offline and while busy.
  const savedWords = useProgress((s) => s.savedWords);
  const saveChatWord = useProgress((s) => s.saveChatWord);
  const [panelFor, setPanelFor] = useState<{ index: number; pt: string } | null>(null);
  // #143: floating chip at a selection inside an assistant bubble (viewport coords).
  const [chip, setChip] = useState<{ index: number; pt: string; top: number; left: number } | null>(
    null,
  );
  // #131 (ADR 0017): the end-of-scene corrections review, session-only.
  const [review, setReview] = useState<ReviewState>({ status: "idle" });
  // #35: the Turnstile widget (invisible unless Cloudflare wants an interaction).
  const challengeEl = useRef<HTMLDivElement>(null);
  const turnstile = useRef<ReturnType<typeof createTurnstile> | null>(null);
  const token = () => {
    turnstile.current ??= createTurnstile(challengeEl.current!);
    return turnstile.current.token();
  };

  // #143 (ADR 0019): track a non-empty selection whose anchor is inside an assistant
  // bubble; the chip anchors at the selection's bounding rect. Removed with the view.
  useEffect(() => {
    setChip(null);
    const ac = new AbortController();
    const onSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return setChip(null);
      const text = sel.toString();
      if (!text.trim()) return setChip(null);
      const anchor = sel.anchorNode;
      const el = anchor
        ? anchor.nodeType === Node.ELEMENT_NODE
          ? (anchor as Element)
          : anchor.parentElement
        : null;
      const bubble = el?.closest("li[data-bubble]");
      const index = bubble ? Number(bubble.getAttribute("data-bubble")) : -1;
      const turn = turns[index];
      if (
        !bubble ||
        bubble.getAttribute("data-role") !== "assistant" ||
        !turn ||
        turn.role !== "assistant"
      ) {
        return setChip(null);
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const top =
        rect.bottom + 56 > window.innerHeight ? Math.max(8, rect.top - 48) : rect.bottom + 6;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 180));
      setChip({ index, pt: text.trim(), top, left });
    };
    document.addEventListener("selectionchange", onSelection, { signal: ac.signal });
    return () => ac.abort();
  }, [turns]);

  if (!scenario) {
    return (
      <AppShell>
        <p>Scene not found.</p>
        <Link to="/speak">Back</Link>
      </AppShell>
    );
  }

  async function onSend() {
    const text = draft.trim();
    if (!text || busy || !scenario || !online) return;
    const nextTurns: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(nextTurns);
    setDraft("");
    setBusy(true);
    setError(null);
    const send = (turnstileToken?: string) =>
      sendChat({ data: { scenarioId: scenario.id, messages: nextTurns, turnstileToken } });
    try {
      // The first line of a conversation always carries a token; later ones
      // ride the session cookie until the server asks again (403).
      const first = nextTurns.filter((t) => t.role === "user").length === 1;
      let res = await send(first ? await token() : undefined);
      if (!res.ok && res.error === "challenge_required" && !first) res = await send(await token());
      if (!res.ok) {
        setError(chatErrorMessage(res));
        return;
      }
      setTurns((t) => [...t, { role: "assistant", content: res.text }]);
    } catch {
      setError("Could not send. Try again.");
    } finally {
      // Turnstile tokens are single-use: reset after every chat request.
      turnstile.current?.reset();
      setBusy(false);
    }
  }

  // #131 (ADR 0017): "Finish scene" sends the transcript to reviewScene; the
  // gate, burst and daily caps are the same as for a chat turn.
  async function onFinish() {
    if (!scenario || !online || busy || review.status === "loading") return;
    if (!turns.some((t) => t.role === "user")) return;
    setReview({ status: "loading" });
    const sendReview = (turnstileToken?: string) =>
      reviewScene({ data: { scenarioId: scenario.id, messages: turns, turnstileToken } });
    try {
      const first = turns.filter((t) => t.role === "user").length === 1;
      let res = await sendReview(first ? await token() : undefined);
      if (!res.ok && res.error === "challenge_required" && !first)
        res = await sendReview(await token());
      if (!res.ok) {
        setReview({ status: "error", message: chatErrorMessage(res) });
        return;
      }
      setReview({ status: "done", corrections: res.corrections });
    } catch {
      setReview({ status: "error", message: "Could not review. Try again." });
    } finally {
      // Turnstile tokens are single-use: reset after every review request.
      turnstile.current?.reset();
    }
  }

  const ptOf = (content: string) => content.split("\n")[0] ?? content;

  const bookmarkId = (i: number) => `save-palavras-${i}`;

  /** The current selection's text when its anchor lies inside assistant bubble `i`, else null. */
  function selectionInBubble(i: number): string | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return null;
    const anchor = sel.anchorNode;
    const el = anchor
      ? anchor.nodeType === Node.ELEMENT_NODE
        ? (anchor as Element)
        : anchor.parentElement
      : null;
    const bubble = el?.closest("li[data-bubble]");
    if (!bubble || bubble.getAttribute("data-bubble") !== String(i)) return null;
    const text = sel.toString();
    return text.trim() ? text : null;
  }

  function openPanel(index: number, pt: string) {
    setChip(null);
    setPanelFor({ index, pt });
  }

  // #80 (ADR 0019): save a partner line/word with its English meaning; due today, no XP/streak.
  function saveLine(i: number, pt: string, en: string) {
    if (!scenario) return;
    saveChatWord({ pt, en, level: scenario.level });
    toast("Added to Palavras.");
    announce("Added to Palavras.");
    setPanelFor(null);
    document.getElementById(bookmarkId(i))?.focus();
  }

  function closePanel(i: number) {
    setPanelFor(null);
    document.getElementById(bookmarkId(i))?.focus();
  }

  return (
    <AppShell hideNav>
      <div className="mb-4 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link to="/speak">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            {scenario.level}
            {scenario.register ? ` · ${scenario.register}` : ""} · {scenario.partner}
          </p>
          <h1 className="truncate font-display text-xl font-medium">{scenario.titlePt}</h1>
        </div>
      </div>

      <div className="mb-4 overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-border)]">
        <img
          src={scenario.image || sceneImageFor(scenario.setting)}
          alt=""
          className="scene aspect-[16/9] w-full object-cover"
        />
      </div>

      <p className="rounded-[var(--radius-md)] bg-soft px-3 py-2 text-sm text-fg">
        {scenario.setting}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {scenario.goals.map((g) => (
          <li
            key={g}
            className="rounded-full bg-surface px-3 py-1 text-xs text-muted shadow-[var(--shadow-border)]"
          >
            {g}
          </li>
        ))}
      </ul>

      <ol className="mt-6 space-y-3">
        {turns.map((t, i) => {
          const line = ptOf(t.content);
          const cardId = chatCardId(line);
          const saved = Boolean(savedWords[cardId]);
          return (
            <li
              key={i}
              data-bubble={i}
              data-role={t.role}
              className={cn(
                "max-w-[92%] rounded-[var(--radius-lg)] px-3 py-2 text-sm",
                t.role === "user"
                  ? "ml-auto bg-accent text-accent-fg"
                  : "bg-surface text-fg shadow-[var(--shadow-border)]",
              )}
            >
              <p className="min-w-0 whitespace-pre-wrap">{t.content}</p>
              {t.role === "assistant" && (
                <div className="flex items-center justify-between">
                  <SpeakButton text={line} layout="footer" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    id={bookmarkId(i)}
                    aria-label={saved ? `In Palavras: ${line}` : `Save to Palavras: ${line}`}
                    aria-pressed={saved || undefined}
                    title={saved ? "In Palavras" : "Save to Palavras"}
                    className={saved ? "text-success" : "text-muted hover:text-accent"}
                    onClick={(e) => {
                      // Keep the tap from clearing the selection before it is read.
                      e.stopPropagation();
                      if (saved) {
                        toast("Already in Palavras.");
                        return;
                      }
                      // Read the selection inside this click, before any state update:
                      // a selection in this bubble wins, else the whole first line.
                      openPanel(i, clampSelection(selectionInBubble(i), line));
                    }}
                  >
                    {saved ? <Check /> : <BookmarkPlus />}
                  </Button>
                </div>
              )}
              {t.role === "assistant" && panelFor?.index === i && (
                <SaveWordPanel
                  pt={panelFor.pt}
                  defaultEn={glossOf(t.content)}
                  saved={Boolean(savedWords[chatCardId(panelFor.pt)])}
                  caveat={needsGlossCaveat(panelFor.pt, line)}
                  onSave={(en) => saveLine(i, panelFor.pt, en)}
                  onClose={() => closePanel(i)}
                />
              )}
            </li>
          );
        })}
        {busy && (
          <li className="text-sm text-muted">A pensar…</li>
        )}
      </ol>

      {chip && panelFor?.index !== chip.index && (
        <div className="fixed z-10" style={{ top: chip.top, left: chip.left }}>
          <Button
            type="button"
            onMouseDown={(e) => e.preventDefault() /* keep the selection until the click lands */}
            onClick={() => openPanel(chip.index, chip.pt)}
          >
            <BookmarkPlus aria-hidden /> Save to Palavras
          </Button>
        </div>
      )}

      <OnlineOnly feature="conversas">
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full"
          onClick={() => void onFinish()}
          disabled={
            busy ||
            review.status === "loading" ||
            !online ||
            !turns.some((t) => t.role === "user")
          }
        >
          <Flag /> Finish scene — see my corrections
        </Button>
      </OnlineOnly>
      {review.status === "loading" && (
        <p className="mt-4 text-sm text-muted">A rever a conversa…</p>
      )}
      {review.status === "error" && <p className="mt-4 text-sm text-danger">{review.message}</p>}
      {review.status === "done" && (
        <SceneReview
          corrections={review.corrections}
          onRestart={() => {
            setTurns([
              { role: "assistant", content: `${scenario.openerPt}\n(${scenario.openerEn})` },
            ]);
            setReview({ status: "idle" });
          }}
        />
      )}

      <div ref={challengeEl} className="mt-3 empty:hidden" />
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {!online && (
        <p className="mt-3 text-sm text-muted">
          You're offline. Your transcript stays here; replies need internet and nothing is sent until you're back.
        </p>
      )}

      <form
        className="sticky bottom-0 mt-6 flex gap-2 bg-bg py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
      >
        <label className="sr-only" htmlFor="line">
          Your line
        </label>
        <input
          id="line"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={listening ? "A ouvir…" : "Write in Portuguese…"}
          maxLength={500}
          className="h-12 min-h-12 flex-1 rounded-[var(--radius-md)] border border-border bg-surface px-3 text-base text-fg outline-none ring-accent placeholder:text-subtle focus:ring-2"
        />
        <MicButton
          value={draft}
          onChange={setDraft}
          onListeningChange={setListening}
          disabled={busy}
        />
        <OnlineOnly feature="conversas">
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={busy || (online && !draft.trim())}
          >
            <Send />
          </Button>
        </OnlineOnly>
      </form>
    </AppShell>
  );
}
