import type { Register } from "@/data/types";

/**
 * #134 (ADR 0018): a scene's register (tu / você) as a visible-text pill on
 * /speak cards. The accent/accent-fg pair is pinned by scripts/contrast.test.mjs.
 */
export function RegisterPill({ register }: { register: Register }) {
  return (
    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-fg">
      {register}
    </span>
  );
}
