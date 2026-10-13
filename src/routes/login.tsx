import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { AzulejoMark } from "@/components/azulejo-mark";
import { Button } from "@/components/ui/button";
import { OnlineOnly } from "@/components/online-only";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <div className="azulejo-band h-2 w-full" />
      <div className="mx-auto grid min-h-[calc(100dvh-8px)] max-w-md content-center px-6 py-10">
        <Link to="/" className="mb-8 flex items-center gap-2 font-display text-2xl font-medium text-fg no-underline">
          <AzulejoMark className="size-9" />
          Bica
        </Link>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          Keep your streak.
        </h1>
        <p className="mt-3 text-muted">
          Sign in to save progress, sync across devices, and practise speaking
          with a Lisbon conversation partner.
        </p>
        <div className="mt-8 space-y-3">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <OnlineOnly key={p.providerId} feature="signIn" label={`Continue with ${p.label}`}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full"
                  disabled={busy !== null}
                  onClick={() => {
                    setError(null);
                    setBusy(p.providerId);
                    void signIn(p.providerId, { callbackURL: "/" }).catch((err: unknown) => {
                      setBusy(null);
                      setError(
                        err instanceof Error ? err.message : "Sign-in failed. Try again.",
                      );
                    });
                  }}
                >
                  {busy === p.providerId ? "Opening…" : `Continue with ${p.label}`}
                </Button>
              </OnlineOnly>
            ))
          ) : (
            <p className="text-sm text-muted">Sign-in is disabled.</p>
          )}
        </div>
        {error ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <p className="mt-6 text-sm text-subtle">
          Lessons work without an account. Progress stays on this device until
          you sign in.
        </p>
        <Link
          to="/"
          className="mt-4 inline-block text-sm font-medium text-accent no-underline hover:underline"
        >
          Continue as guest
        </Link>
      </div>
    </main>
  );
}
