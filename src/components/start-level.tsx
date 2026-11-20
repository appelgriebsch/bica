import { levels } from "@/data/curriculum";
import type { CefrLevel } from "@/data/types";
import { useProgress } from "@/lib/progress-store";
import { cn } from "@/lib/utils";

export function StartLevelPicker({
  label = "Start from",
  labelId,
}: {
  label?: string;
  labelId?: string;
}) {
  const floor = useProgress((s) => s.floor);
  const setFloor = useProgress((s) => s.setFloor);

  return (
    <div>
      <p id={labelId} className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {levels.map((lv) => {
          const on = floor === lv.id;
          return (
            <button
              key={lv.id}
              type="button"
              aria-pressed={on}
              onClick={() => setFloor(lv.id as CefrLevel)}
              className={cn(
                "min-h-11 rounded-[var(--radius-md)] px-4 text-sm font-medium transition-colors duration-[var(--motion-quick)]",
                on
                  ? "bg-accent text-accent-fg"
                  : "bg-surface text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
              )}
            >
              {lv.id}
            </button>
          );
        })}
      </div>
    </div>
  );
}
