import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Headphones, House, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useProgress } from "@/lib/progress-store";
import { cn } from "@/lib/utils";
import { AzulejoMark } from "@/components/azulejo-mark";
import { OfflineChip } from "@/components/offline-status";

const nav = [
  { to: "/", label: "Today", icon: House, match: (p: string) => p === "/" },
  { to: "/path", label: "Path", icon: BookOpen, match: (p: string) => p === "/path" || p.startsWith("/lesson") },
  {
    to: "/practice",
    label: "Practice",
    icon: Headphones,
    match: (p: string) =>
      p === "/practice" ||
      p.startsWith("/speak") ||
      p.startsWith("/listen") ||
      p.startsWith("/read") ||
      p.startsWith("/review") ||
      p.startsWith("/grammar") ||
      p.startsWith("/verbs"),
  },
  { to: "/me", label: "You", icon: UserRound, match: (p: string) => p === "/me" },
] as const;

export function AppShell({
  children,
  hideNav = false,
}: {
  children: ReactNode;
  hideNav?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const streak = useProgress((s) => s.streak);

  return (
    <div className="min-h-dvh overflow-x-clip bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <AzulejoMark />
            <span className="font-display text-lg font-medium tracking-tight">Bica</span>
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium no-underline transition-colors duration-[var(--motion-quick)]",
                    active ? "bg-soft text-accent" : "text-muted hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <OfflineChip />
            {streak > 0 && (
              <p className="text-xs font-medium tabular-nums text-muted">{streak}d</p>
            )}
          </div>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto w-full max-w-2xl px-4 pt-5",
          hideNav ? "pb-8" : "pb-28 md:pb-12",
        )}
      >
        {children}
      </main>

      {!hideNav && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          <ul className="mx-auto grid max-w-2xl grid-cols-4">
            {nav.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium no-underline",
                      active ? "text-accent" : "text-muted",
                    )}
                  >
                    <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
