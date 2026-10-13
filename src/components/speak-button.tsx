import { Loader2, Volume2 } from "lucide-react";
import { useState } from "react";
import { NO_VOICE_NOTE } from "@/components/pt-voice-notice";
import { Button } from "@/components/ui/button";
import { speakPt, usePtVoiceStatus } from "@/lib/tts";
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
  const [busy, setBusy] = useState(false);
  const none = usePtVoiceStatus() === "none";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={none ? `${label}. ${NO_VOICE_NOTE}` : label}
      title={none ? NO_VOICE_NOTE : undefined}
      disabled={busy || none}
      className={cn("text-accent hover:bg-soft", className)}
      onClick={(e) => {
        e.stopPropagation();
        setBusy(true);
        void speakPt(text, rate).finally(() => setBusy(false));
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Volume2 />}
    </Button>
  );
}
