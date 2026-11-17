import { Loader2, Snail, Volume2 } from "lucide-react";
import { useState } from "react";
import { NO_VOICE_NOTE } from "@/components/pt-voice-notice";
import { Button } from "@/components/ui/button";
import { SLOW_RATE, speakPt, usePtVoiceStatus } from "@/lib/tts";
import { cn } from "@/lib/utils";

export function SpeakButton({
  text,
  rate = 0.88,
  label = "Play pronunciation",
  className,
}: {
  text: string;
  rate?: number;
  label?: string;
  className?: string;
}) {
  const [playing, setPlaying] = useState<"normal" | "slow" | null>(null);
  const none = usePtVoiceStatus() === "none";
  const slowLabel = "Play slower";

  function play(kind: "normal" | "slow") {
    setPlaying(kind);
    void speakPt(text, kind === "slow" ? SLOW_RATE : rate).finally(() =>
      setPlaying((p) => (p === kind ? null : p)),
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={none ? `${label}. ${NO_VOICE_NOTE}` : label}
        title={none ? NO_VOICE_NOTE : undefined}
        disabled={playing !== null || none}
        className={cn("text-accent hover:bg-soft", className)}
        onClick={(e) => {
          e.stopPropagation();
          play("normal");
        }}
      >
        {playing === "normal" ? <Loader2 className="animate-spin" /> : <Volume2 />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={none ? `${slowLabel}. ${NO_VOICE_NOTE}` : slowLabel}
        title={none ? NO_VOICE_NOTE : slowLabel}
        disabled={playing !== null || none}
        className={cn("text-muted hover:text-accent hover:bg-soft", className)}
        onClick={(e) => {
          e.stopPropagation();
          play("slow");
        }}
      >
        {playing === "slow" ? <Loader2 className="animate-spin" /> : <Snail />}
      </Button>
    </span>
  );
}
