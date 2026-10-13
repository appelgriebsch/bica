import { useEffect, useState } from "react";
import { usePtVoiceStatus } from "@/lib/tts";

export const NO_VOICE_NOTE = "No European Portuguese voice on this device. Text only.";

/** Install hint per platform (Chrome's "Google português do Brasil" and Edge "Natural" voices are online and don't count). */
export function voiceInstallHint(ua: string, touchMac = false): string {
  if (/iPad|iPhone|iPod/.test(ua) || touchMac)
    return "Settings › Accessibility › Spoken Content › Voices › Portuguese (Portugal): Joana.";
  if (/Android/.test(ua))
    return "Settings › Text-to-speech › Google › Install voice data › Português (Portugal).";
  if (/Mac OS X|Macintosh/.test(ua))
    return "System Settings › Accessibility › Spoken Content › System voice › Manage Voices › Portuguese (Portugal): Joana or Catarina.";
  if (/Windows/.test(ua))
    return "Settings › Time & language › Language › add Português (Portugal) with speech (voice: Helia).";
  return "Install a Portuguese (Portugal) voice, e.g. espeak-ng pt-PT.";
}

export function PtVoiceNotice() {
  const status = usePtVoiceStatus();
  const [hint, setHint] = useState("");
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setHint(
      voiceInstallHint(
        navigator.userAgent,
        navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1,
      ),
    );
  }, []);
  if (status !== "none" || dismissed) return null;
  return (
    <div
      role="status"
      className="mx-auto mt-2 flex w-[calc(100%-2rem)] max-w-2xl items-start gap-3 rounded-[var(--radius-md)] bg-soft px-3 py-2.5 text-sm text-fg"
    >
      <p className="min-w-0 flex-1">
        {NO_VOICE_NOTE} <span className="text-muted">{hint}</span>
      </p>
      <button
        type="button"
        className="min-h-11 shrink-0 px-1 text-sm font-medium text-accent"
        onClick={() => setDismissed(true)}
      >
        Hide
      </button>
    </div>
  );
}
