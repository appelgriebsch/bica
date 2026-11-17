import { SpeakButton } from "@/components/speak-button";
import type { DialogueLine } from "@/data/types";
import { sceneImageFor } from "@/lib/scene-image";
import { cn } from "@/lib/utils";

/** Scripted dialogue with per-line on-device pt-PT audio (works offline). Shared by lessons and Travel Scenes. */
export function DialogueView({
  setting,
  lines,
  image,
  heading,
}: {
  setting: string;
  lines: DialogueLine[];
  image?: string;
  heading?: string;
}) {
  const src = image ?? sceneImageFor(setting);
  return (
    <article>
      <div className="overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-border)]">
        <img src={src} alt="" className="scene aspect-[16/9] w-full object-cover" />
      </div>
      {heading ? <h2 className="mt-4 font-display text-2xl font-medium">{heading}</h2> : null}
      <p className={cn("text-sm text-muted", heading ? "mt-1" : "mt-4")}>{setting}</p>
      <ol className="mt-4 space-y-2">
        {lines.map((line, i) => (
          <li
            key={i}
            className={cn(
              "rounded-[var(--radius-lg)] p-3",
              line.speaker === "You" || line.speaker.startsWith("You")
                ? "ml-4 bg-soft"
                : "mr-4 bg-surface shadow-[var(--shadow-border)]",
            )}
          >
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-accent">
                {line.speaker}
              </p>
              <p className="mt-0.5 font-medium">{line.pt}</p>
              <p className="text-sm text-muted">{line.en}</p>
              <SpeakButton text={line.pt} layout="footer" />
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
