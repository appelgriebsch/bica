import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export function Progress({
  value = 0,
  className,
  label,
}: {
  value?: number;
  className?: string;
  label?: string;
}) {
  return (
    <ProgressPrimitive.Root
      value={value}
      aria-label={label}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2",
        className,
      )}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-accent transition-transform duration-[var(--motion-fast)] ease-[var(--ease-smooth-out)]"
        style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value))}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
