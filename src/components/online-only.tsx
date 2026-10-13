import { useNavigate } from "@tanstack/react-router";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { Cloud } from "lucide-react";
import type { MouseEvent, ReactElement } from "react";
import { toast } from "sonner";
import { useOnline } from "@/lib/online";
import { ONLINE_FEATURES, type OnlineFeatureId } from "@/lib/online-features";
import { cn } from "@/lib/utils";

/**
 * Marks a control as needing internet (Cloud, online and offline) and gates it
 * offline: muted, `aria-disabled` but focusable, and a tap explains why and
 * offers the alternative. Wraps exactly one element (button or link):
 *   <OnlineOnly feature="sync" label="Refresh from account"><Button>…</Button></OnlineOnly>
 * `placement="corner"` puts the marker top-right (cards); default is inline before the label.
 */
export function OnlineOnly({
  feature,
  label,
  placement = "inline",
  className,
  children,
}: {
  feature: OnlineFeatureId;
  /** Visible name of the control; the accessible name adds the online state. */
  label: string;
  placement?: "inline" | "corner";
  className?: string;
  children: ReactElement;
}) {
  const online = useOnline();
  const navigate = useNavigate();
  const f = ONLINE_FEATURES[feature];
  const alt = "alternative" in f ? f.alternative : undefined;

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
      aria-label={`${label}, ${online ? "needs internet" : "unavailable offline"}`}
      aria-disabled={online ? undefined : true}
      onClickCapture={onClickCapture}
      className={cn("aria-disabled:opacity-50", placement === "corner" && "relative", className)}
    >
      <Cloud
        aria-hidden
        className={cn(
          "size-3.5 shrink-0 text-muted",
          placement === "corner" && "absolute right-3 top-3",
        )}
      />
      <Slottable>{children}</Slottable>
    </Slot>
  );
}
