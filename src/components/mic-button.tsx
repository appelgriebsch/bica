import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { announce } from "@/lib/online";
import {
  getSpeechInputSupport,
  startSpeechInput,
  useSpeechInputSupport,
  type SpeechInputSession,
} from "@/lib/speech-input";
import { cn } from "@/lib/utils";

/**
 * The Conversas composer's microphone (#83, ADR 0020). One tap starts a pt-PT
 * recognition session; what was understood streams into the composer input
 * (finals plus interim) so the learner sees it before sending, and typing
 * stays available the whole time. While listening the button becomes Stop
 * (aria-pressed, Square icon), like the Speak button's playing state. With no
 * pt-PT speech recognition on the device the button is aria-disabled but
 * focusable and activating it posts NO_SPEECH_NOTE as a toast — the typed
 * Scene keeps working either way.
 */
export const NO_SPEECH_NOTE =
  "No European Portuguese speech recognition on this device. Typing still works.";

function errorNote(code: string): string {
  if (code === "not-allowed")
    return "Microphone access was blocked. Allow it in the browser settings — typing still works.";
  if (code === "network") return "Speech recognition needs a connection. Typing still works.";
  if (code === "audio-capture") return "No microphone found on this device. Typing still works.";
  return "Couldn't hear that. Try again, or type your line.";
}

export function MicButton({
  value,
  onChange,
  onListeningChange,
  disabled = false,
}: {
  value: string;
  onChange: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
  disabled?: boolean;
}) {
  const support = useSpeechInputSupport();
  const [listening, setListening] = useState(false);
  const session = useRef<SpeechInputSession | null>(null);
  const base = useRef("");
  const final = useRef("");
  const unsupported = support === "unsupported";

  function setListeningBoth(next: boolean) {
    setListening(next);
    onListeningChange?.(next);
  }

  function stop() {
    session.current?.stop();
    session.current = null;
    setListeningBoth(false);
    announce("Stopped listening.");
  }

  function start() {
    if (unsupported) {
      toast(NO_SPEECH_NOTE, { id: "no-speech-input" });
      return;
    }
    base.current = value;
    final.current = "";
    const s = startSpeechInput({
      onTranscript(f, interim) {
        final.current = f;
        const spoken = f + interim;
        const text =
          base.current && spoken && !/\s$/.test(base.current)
            ? `${base.current} ${spoken}`
            : base.current + spoken;
        onChange(text);
      },
      onError(code) {
        if (getSpeechInputSupport() === "unsupported")
          toast(NO_SPEECH_NOTE, { id: "no-speech-input" });
        else toast(errorNote(code), { id: "speech-input-error" });
      },
      onEnd() {
        // A superseded session (aborted by a newer start) must not end the live one.
        if (session.current !== s) return;
        session.current = null;
        setListeningBoth(false);
      },
    });
    if (!s) {
      toast(NO_SPEECH_NOTE, { id: "no-speech-input" });
      return;
    }
    session.current = s;
    setListeningBoth(true);
    announce("Listening…");
  }

  useEffect(() => {
    if (disabled) session.current?.stop();
  }, [disabled]);

  useEffect(() => () => session.current?.stop(), []);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={
        unsupported
          ? `Speak your line. ${NO_SPEECH_NOTE}`
          : listening
            ? "Stop listening"
            : "Speak your line in Portuguese"
      }
      aria-pressed={listening || undefined}
      aria-disabled={unsupported || undefined}
      title={
        unsupported
          ? NO_SPEECH_NOTE
          : listening
            ? "Stop listening"
            : "Speak your line in Portuguese"
      }
      disabled={disabled && !listening}
      onClick={() => (listening ? stop() : start())}
      className={cn(
        unsupported ? "text-tile hover:bg-soft" : "text-accent hover:bg-soft",
        listening && "bg-soft text-accent",
        unsupported && "opacity-60",
      )}
    >
      {listening ? <Square className="fill-current" /> : <Mic />}
    </Button>
  );
}
