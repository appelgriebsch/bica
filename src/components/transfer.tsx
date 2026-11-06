import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

/** Back to You plus the page title; focuses the title when `focusKey` changes. */
export function BackTitle({ title, focusKey }: { title: string; focusKey?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusKey) ref.current?.focus();
  }, [focusKey]);
  return (
    <div className="flex items-center gap-1">
      <Button asChild variant="ghost" size="icon" aria-label="Back to You">
        <Link to="/me">
          <ChevronLeft aria-hidden />
        </Link>
      </Button>
      <h1
        ref={ref}
        tabIndex={-1}
        className="font-display text-3xl font-medium tracking-tight outline-none"
      >
        {title}
      </h1>
    </div>
  );
}

/** Focused Send/Receive screen: no bottom nav, Back to You, heading focused on every state change. */
export function TransferScreen({
  title,
  heading,
  stateKey,
  children,
}: {
  title: string;
  heading: string;
  stateKey: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), [stateKey]);
  return (
    <AppShell hideNav>
      <BackTitle title={title} />
      <h2 ref={ref} tabIndex={-1} className="mt-6 font-display text-2xl font-medium outline-none">
        {heading}
      </h2>
      <div className="mt-3 space-y-4">{children}</div>
    </AppShell>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 pt-2">{children}</div>;
}

export function BackToYou({ primary = false }: { primary?: boolean }) {
  return (
    <Button asChild variant={primary ? "default" : "secondary"}>
      <Link to="/me" className="no-underline">
        Back to You
      </Link>
    </Button>
  );
}

/** Large code for the eye; character by character in two groups for screen readers. */
export function TransferCode({ code }: { code: string }) {
  const [a, b] = [code.slice(0, 4), code.slice(4)];
  const spell = (g: string) => [...g].join(", ");
  return (
    <p className="paper-card rounded-[var(--radius-lg)] p-4 text-center short-landscape:p-2">
      <span className="block text-sm text-muted">Transfer code</span>
      <span
        aria-hidden
        className="mt-1 block font-mono text-4xl font-semibold tracking-widest short-landscape:text-3xl"
      >
        {a}-{b}
      </span>
      <span className="sr-only">
        Group one: {spell(a)}. Group two: {spell(b)}.
      </span>
    </p>
  );
}
