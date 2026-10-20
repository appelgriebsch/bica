import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { OnlineOnly } from "@/components/online-only";

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

function AboutPage() {
  return (
    <AppShell>
      <h1 className="font-display text-3xl font-medium tracking-tight">About</h1>

      <Band title="App">
        <p>Bica, European Portuguese, offline-first. Progress stays on this device.</p>
        <p>
          <Link to="/me" className={linkClass}>
            Export and import
          </Link>
        </p>
      </Band>

      <Band title="Version">
        <p>Version {__BICA_BUILD_SHA__}</p>
      </Band>

      <Band title="License">
        <p>MIT © 2026 Andreas Gerlach</p>
        <GitHubLink href={`${REPO}/blob/main/LICENSE`} label="LICENSE">
          LICENSE
        </GitHubLink>
        <GitHubLink href={`${REPO}/blob/main/THIRD-PARTY.md`} label="Third-party notices">
          THIRD-PARTY.md
        </GitHubLink>
      </Band>

      <Band title="Credits">
        <p>
          Illustrations: <span className="font-medium text-fg">Created with Grok</span>{" "}
          (AI-generated).
        </p>
        <p>Fonts: Figtree and Fraunces (OFL-1.1).</p>
        <p>Icons: Lucide (ISC).</p>
        <p>Speech: Uses your device's Portuguese voice.</p>
        <p>Conversas: Replies are AI-generated, written with Grok.</p>
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
