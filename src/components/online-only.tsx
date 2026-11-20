import { useNavigate } from "@tanstack/react-router";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { Cloud } from "lucide-react";
import { useId, type MouseEvent, type ReactElement } from "react";
import { toast } from "sonner";
import { useOnline } from "@/lib/online";
import { ONLINE_FEATURES, type OnlineFeatureId } from "@/lib/online-features";
import { cn } from "@/lib/utils";

/**
 * Marks a control as needing internet (Cloud, online and offline) and gates it
 * offline: muted, `aria-disabled` but focusable, and a tap explains why and
 * offers the alternative. Wraps exactly one element (button or link):
 *   <OnlineOnly feature="conversas"><Button>…</Button></OnlineOnly>
 * The wrapped control keeps its accessible name from its own content or
 * aria-label (WCAG 2.5.3 Label in Name); the online state is exposed as its
 * accessible description, never as a name override.
 * `placement="corner"` puts the marker top-right (cards); default is inline before the label.
 * `placement="badge"` shows the marker, only while offline, as a small corner badge outside
 * the glyph area of an icon-only button (the composer Send): the Slot gets `relative` and no
 * opacity, because the child owns its disabled look.
 * `gate={false}`: marker only — for entry points whose content is bundled and opens offline
 * (scene cards); the online-only part inside them is gated on its own.
 */
export function OnlineOnly({
  feature,
  placement = "inline",
  gate = true,
  onAccent = false,
  dim = true,
  className,
  children,
}: {
  feature: OnlineFeatureId;
  placement?: "inline" | "corner" | "badge";
  gate?: boolean;
  /** Corner Cloud sits on `bg-accent`; accent-fg clears 3:1, text-muted does not (#158). */
  onAccent?: boolean;
  /** Offline opacity. Outline buttons already restyle `aria-disabled`, so they pass false (#158). */
  dim?: boolean;
  className?: string;
  children: ReactElement;
}) {
  const online = useOnline() || !gate;
  const navigate = useNavigate();
  const f = ONLINE_FEATURES[feature];
  const alt = "alternative" in f ? f.alternative : undefined;
  const stateId = useId();

  function onClickCapture(e: MouseEvent) {
    if (online) return;
    e.preventDefault();
    e.stopPropagation();
    toast(f.reason.en, {
      id: `offline-${f.id}`,
      action: alt
        ? { label: alt.label.en, onClick: () => void navigate({ to: alt.to }) }
        : undefined,
    });
  }

  return (
    <Slot
      aria-describedby={stateId}
      aria-disabled={online ? undefined : true}
      onClickCapture={onClickCapture}
      className={cn(
        dim && placement !== "badge" && "aria-disabled:opacity-50",
        placement !== "inline" && "relative",
        className,
      )}
    >
      {placement !== "badge" || !online ? (
        <Cloud
          aria-hidden
          className={cn(
            "size-3.5 shrink-0",
            onAccent ? "text-accent-fg" : "text-muted",
            placement === "corner" && "absolute right-3 top-3",
            placement === "badge" && "absolute -right-1 -top-1 size-4! rounded-full bg-bg p-0.5",
          )}
        />
      ) : null}
      <Slottable>{children}</Slottable>
      <span id={stateId} className="sr-only">
        {online ? "Needs internet." : "Unavailable offline."}
      </span>
    </Slot>
  );
}
