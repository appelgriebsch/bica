import { useRef, useState } from "react";
import { toast } from "sonner";
import { NO_VOICE_NOTE } from "@/components/pt-voice-notice";
import { announce } from "@/lib/online";
import { SLOW_RATE, speakPt, stopSpeaking, usePtVoiceStatus } from "@/lib/tts";

/**
 * The one playback state model for every play/snail pair (#120): the active
 * control becomes Stop, the other switches speed by cancelling and replaying
 * at its own rate, and with no pt-PT voice activating posts NO_VOICE_NOTE as a
 * toast without calling speak(). State changes are announced in the app's
 * polite live region (#123 L2): "Playing.", "Playing slower.", "Stopped.".
 */
export function useSpeakPlayback(text: string, rate: number) {
  const [playing, setPlaying] = useState<"normal" | "slow" | null>(null);
  const turn = useRef(0);
  const status = usePtVoiceStatus();
  const none = status === "none";
  const loading = status === "loading";

  function reset() {
    turn.current += 1;
    stopSpeaking();
    setPlaying(null);
  }

  function activate(kind: "normal" | "slow") {
    if (none) {
      toast(NO_VOICE_NOTE, { id: "no-pt-voice" });
      return;
    }
    const id = ++turn.current;
    if (playing === kind) {
      reset();
      announce("Stopped.");
      return;
    }
    setPlaying(kind);
    announce(kind === "slow" ? "Playing slower." : "Playing.");
    void speakPt(text, kind === "slow" ? SLOW_RATE : rate).finally(() => {
      if (turn.current !== id) return;
      setPlaying(null);
    });
  }

  return { playing, activate, reset, none, loading };
}
