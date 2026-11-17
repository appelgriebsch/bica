import { Loader2, Snail, Square, Volume2 } from "lucide-react";
import { NO_VOICE_NOTE } from "@/components/pt-voice-notice";
import { useSpeakPlayback } from "@/components/use-speak-playback";
import { Button } from "@/components/ui/button";
import { SPEAK_RATE } from "@/lib/tts";
import { cn } from "@/lib/utils";

/**
 * Paired play controls (#120, #123). Volume2 plays at `rate`, the snail at
 * SLOW_RATE. While one plays it becomes Stop (aria-pressed, Square icon or a
 * pressed snail pill) and stays enabled, so focus never drops; the other
 * button stays enabled and switches speed by cancelling and replaying
 * (ADR 0012). Loader2 shows only while the voice is still loading. With no
 * pt-PT voice both are aria-disabled but focusable, and activating one posts
 * NO_VOICE_NOTE as a toast without ever calling speak().
 */
export function SpeakButton({
  text,
  rate = SPEAK_RATE,
  layout = "inline",
  tone = "default",
}: {
  text: string;
  rate?: number;
  layout?: "inline" | "footer";
  tone?: "default" | "onAccent";
}) {
  const { playing, activate, none, loading } = useSpeakPlayback(text, rate);
  const onAccent = tone === "onAccent";
  const snippet = text.length > 40 ? `${text.slice(0, 40).trimEnd()}…` : text;
  const playLabel = `Play “${snippet}”`;
  const slowLabel = `Play “${snippet}” slower`;

  const playActive = playing === "normal";
  const slowActive = playing === "slow";

  const pair = (
    <span className="inline-flex shrink-0 items-center gap-0 [&_svg]:size-5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={none ? `${playLabel}. ${NO_VOICE_NOTE}` : playActive ? "Stop" : playLabel}
        aria-pressed={playActive || undefined}
        aria-disabled={none || undefined}
        title={none ? NO_VOICE_NOTE : undefined}
        className={cn(
          onAccent
            ? "text-accent-fg hover:bg-tile"
            : none
              ? "text-tile hover:bg-soft"
              : "text-accent hover:bg-soft",
          playActive && (onAccent ? "bg-tile text-accent-fg" : "bg-soft text-accent"),
          onAccent && "focus-visible:outline-accent-fg",
          none && "opacity-60",
        )}
        onClick={(e) => {
          e.stopPropagation();
          activate("normal");
        }}
      >
        {loading ? (
          <Loader2 className="animate-spin" />
        ) : playActive ? (
          <Square className="fill-current" />
        ) : (
          <Volume2 />
        )}
      </Button>
      {onAccent ? (
        <Button
          type="button"
          variant="ghost"
          aria-label={none ? `${slowLabel}. ${NO_VOICE_NOTE}` : slowActive ? "Stop" : slowLabel}
          aria-pressed={slowActive || undefined}
          aria-disabled={none || undefined}
          className={cn(
            "h-11 gap-1.5 px-3 text-sm text-accent-fg hover:bg-tile focus-visible:outline-accent-fg",
            slowActive && "bg-tile text-accent-fg",
            none && "opacity-60",
          )}
          onClick={(e) => {
            e.stopPropagation();
            activate("slow");
          }}
        >
          <Snail />
          {slowActive ? "Stop" : "Slower"}
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={none ? `${slowLabel}. ${NO_VOICE_NOTE}` : slowActive ? "Stop" : slowLabel}
          aria-pressed={slowActive || undefined}
          aria-disabled={none || undefined}
          title={none ? NO_VOICE_NOTE : slowLabel}
          className={cn(
            none ? "text-tile" : "text-muted hover:bg-soft hover:text-accent",
            slowActive && "bg-soft text-accent",
            none && "opacity-60",
          )}
          onClick={(e) => {
            e.stopPropagation();
            activate("slow");
          }}
        >
          <Snail />
        </Button>
      )}
    </span>
  );

  if (layout === "footer") {
    return <span className="-mr-2 -mb-2 mt-2 flex justify-end">{pair}</span>;
  }
  return pair;
}
