import { Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_CHAT_TEXT } from "@/lib/chat-words";
import { normalizePt } from "@/lib/utils";

/**
 * Inline "Save to Palavras" panel under a Conversas bubble (#80, ADR 0019).
 * The Portuguese is read-only; the English meaning is required and editable.
 * Wrapped in a form so Enter saves; Esc cancels; focus moves into the input on
 * open (the parent returns it to the trigger on close). `saved` mirrors the
 * PhraseRow already-saved state; `caveat` flags a sub-phrase save, where the
 * prefilled gloss describes the whole reply.
 */
export function SaveWordPanel({
  pt,
  defaultEn,
  saved = false,
  caveat = false,
  onSave,
  onClose,
}: {
  pt: string;
  defaultEn: string;
  saved?: boolean;
  caveat?: boolean;
  onSave: (en: string) => void;
  onClose: () => void;
}) {
  const [en, setEn] = useState(defaultEn);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLFormElement>(null);
  const enId = useId();
  const errorId = useId();
  const tooLong = normalizePt(pt).length > MAX_CHAT_TEXT;
  const canSave = !saved && !tooLong && en.trim().length > 0;

  useEffect(() => {
    inputRef.current?.focus();
    // The sticky input bar must not cover the panel when it opens.
    panelRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <form
      ref={panelRef}
      role="group"
      aria-label="Save to Palavras"
      className="mt-2 rounded-[var(--radius-lg)] bg-surface p-3 shadow-[var(--shadow-border)]"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave(en.trim());
      }}
    >
      <p className="truncate text-sm font-medium" title={pt}>
        {pt}
      </p>
      <label
        htmlFor={enId}
        className="mt-2 block text-xs font-medium uppercase tracking-wider text-muted"
      >
        English meaning
      </label>
      <input
        ref={inputRef}
        id={enId}
        value={en}
        onChange={(e) => setEn(e.target.value)}
        aria-invalid={tooLong || undefined}
        aria-describedby={errorId}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="English meaning…"
        className="mt-1 h-12 min-h-12 w-full rounded-[var(--radius-md)] border border-border bg-bg px-3 text-base text-fg outline-none ring-accent placeholder:text-subtle focus:ring-2"
      />
      <p id={errorId} aria-live="polite" className="mt-1 text-sm text-danger">
        {tooLong ? `Too long to save — keep it to ${MAX_CHAT_TEXT} characters or fewer.` : ""}
      </p>
      {caveat && !saved && (
        <p className="mt-1 text-xs text-muted">
          The translation is for the whole reply — adjust it for the selected words.
        </p>
      )}
      {saved && (
        <p role="status" className="mt-1 text-sm text-success">
          Already in Palavras.
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <Button type="submit" disabled={!canSave}>
          {saved && <Check aria-hidden />}
          Save
        </Button>
        {!canSave && !tooLong && !saved && (
          <p className="text-xs text-subtle">Add the English meaning to save.</p>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
