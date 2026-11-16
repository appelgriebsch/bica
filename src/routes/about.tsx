import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { OnlineOnly } from "@/components/online-only";
import { Button } from "@/components/ui/button";

const REPO = "https://github.com/appelgriebsch/bica";
const linkClass = "font-medium text-accent no-underline hover:underline";

export const Route = createFileRoute("/about")({ component: AboutPage });

function Band({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]">
      <h2 className="font-display text-xl font-medium">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm text-muted">{children}</div>
    </section>
  );
}

function GitHubLink({ href, label, children }: { href: string; label: string; children: string }) {
  return (
    <OnlineOnly feature="github" label={label}>
      <a href={href} className={linkClass}>
        {children}
      </a>
    </OnlineOnly>
  );
}

/** Mistral AI logo next to the credit name, hiato-style (public/brand/mistral-mark.svg). */
function MistralCredit() {
  return (
    <span className="whitespace-nowrap">
      <img
        src="/brand/mistral-mark.svg"
        alt=""
        width={12}
        height={12}
        className="mr-1 inline-block h-3 w-3 select-none align-[-2px]"
        draggable={false}
      />
      <span className="font-medium text-fg">Mistral AI</span>
    </span>
  );
}

function AboutPage() {
  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to You">
          <Link to="/me">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="font-display text-3xl font-medium tracking-tight">About</h1>
      </div>

      <Band title="App">
        <p>Bica, European Portuguese, offline-first. Progress stays on this device.</p>
      </Band>

      <Band title="Version">
        <p>Version {__BICA_BUILD_SHA__}</p>
      </Band>

      <Band title="License">
        <p>MIT © 2026 Andreas Gerlach</p>
        <GitHubLink href={`${REPO}/blob/main/LICENSE`} label="LICENSE">
          LICENSE
        </GitHubLink>
        <GitHubLink href={`${REPO}/blob/main/THIRD-PARTY.md`} label="THIRD-PARTY.md">
          THIRD-PARTY.md
        </GitHubLink>
      </Band>

      <Band title="Credits">
        <p>
          Scene illustrations: AI-generated with <MistralCredit /> (ADR 0009).
        </p>
        <p>
          App icon and mark: <span className="font-medium text-fg">original hand-authored SVG</span>{" "}
          (illustrative azulejo tile, ADR 0010).
        </p>
        <p>Fonts: Figtree and Fraunces (OFL-1.1).</p>
        <p>Icons: Lucide (ISC).</p>
        <p>Speech: Uses your device's Portuguese voice.</p>
        <p>
          Conversas: Replies are AI-generated with <MistralCredit />.
        </p>
      </Band>

      <Band title="What we count">
        <p>
          On the production site only, Bica uses cookieless Cloudflare Web Analytics to count
          visits and page views per screen. It sets no cookies, uses no device storage for
          tracking, and collects nothing that identifies you. Staging previews and offline play
          are not counted (ADR 0011).
        </p>
      </Band>

      <Band title="Links">
        <GitHubLink href={REPO} label="Source repository">
          Source repository
        </GitHubLink>
        <GitHubLink href={`${REPO}/issues`} label="Report an issue">
          Report an issue
        </GitHubLink>
      </Band>
    </AppShell>
  );
}
