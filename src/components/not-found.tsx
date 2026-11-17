import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <AppShell>
      <h1 className="font-display text-3xl font-medium tracking-tight">Page not found</h1>
      <p className="mt-2 text-muted">
        This page isn&apos;t on the path. Head back to today&apos;s lesson.
      </p>
      <Button asChild className="mt-5">
        <Link to="/">Back to Today</Link>
      </Button>
    </AppShell>
  );
}
