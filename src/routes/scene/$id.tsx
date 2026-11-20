import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DialogueView } from "@/components/dialogue";
import { OnlineOnly } from "@/components/online-only";
import { Button } from "@/components/ui/button";
import { getLesson, getScriptedScene, speakScenarios } from "@/data/curriculum";

export const Route = createFileRoute("/scene/$id")({ component: ScenePage });

function ScenePage() {
  const { id } = Route.useParams();
  const found = getScriptedScene(id);
  if (!found) {
    return (
      <AppShell>
        <p>Scene not found.</p>
        <Link to="/practice" className="text-accent">
          Back to Practice
        </Link>
      </AppShell>
    );
  }
  const { scene, kind } = found;
  const lesson = getLesson(scene.lessonId);
  const scenario = scene.scenarioId
    ? speakScenarios.find((s) => s.id === scene.scenarioId)
    : undefined;

  return (
    <AppShell>
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to Practice">
          <Link to="/practice">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            {kind === "social" ? "Cenas sociais" : "Cenas de viagem"} · {scene.level}
            {scenario?.register ? ` · ${scenario.register}` : ""} · {scene.minutes} min
          </p>
          <h1 className="truncate font-display text-2xl font-medium tracking-tight">
            {scene.titlePt}
          </h1>
          <p className="truncate text-sm text-muted">
            {scene.title} · {scene.partner}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <DialogueView setting={scene.setting} lines={scene.lines} image={scene.image} />
      </div>

      {lesson && (
        <Link
          to="/lesson/$id"
          params={{ id: lesson.id }}
          className="mt-6 flex items-start gap-3 rounded-[var(--radius-lg)] bg-surface p-4 no-underline shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-quick)] hover:shadow-[var(--shadow-border-hover)]"
        >
          <BookOpen className="mt-0.5 size-5 shrink-0 text-accent" />
          <span className="min-w-0">
            <span className="block text-xs font-medium uppercase tracking-wider text-accent">
              Lesson · {lesson.level}
            </span>
            <span className="mt-1 block font-display text-xl font-medium text-fg">
              {lesson.titlePt}
            </span>
            <span className="mt-1 block text-sm text-muted">
              Learn the words — finish it and they join Palavras.
            </span>
          </span>
        </Link>
      )}

      {scenario && (
        <OnlineOnly feature="conversas" placement="corner" onAccent>
          <Link
            to="/speak/$id"
            params={{ id: scenario.id }}
            className="mt-3 flex items-start gap-3 rounded-[var(--radius-lg)] bg-accent p-4 text-accent-fg no-underline"
          >
            <MessageCircle className="mt-0.5 size-5 shrink-0 [&]:text-accent-fg/70" />
            <span className="min-w-0">
              <span className="block text-xs font-medium uppercase tracking-wider text-accent-fg/80">
                Conversas · {scenario.level} · {scenario.minutes} min
              </span>
              <span className="mt-1 block font-display text-xl font-medium">Practice it live</span>
              <span className="mt-1 block text-sm text-accent-fg/80">
                {scenario.titlePt} with {scenario.partner} — needs internet.
              </span>
            </span>
          </Link>
        </OnlineOnly>
      )}
    </AppShell>
  );
}
