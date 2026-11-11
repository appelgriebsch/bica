import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Pause, Play, Sun } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { renderSVG } from "uqr";
import { AppShell } from "@/components/app-shell";
import { Actions, BackTitle, BackToYou, TransferCode, TransferScreen } from "@/components/transfer";
import { Button } from "@/components/ui/button";
import { useProgress } from "@/lib/progress-store";
import { HYDRATION_FAILED, summary, useStoreReady } from "@/lib/transfer-merge";
import { codecSupported, encodeTransfer, newCode, SESSION_MS, TransferError } from "@/lib/transfer";

export const Route = createFileRoute("/me_/send")({ component: SendPage });

type Session = { frames: string[]; code: string; summary: string; expiresAt: number };
type View = "making" | "showing" | "expired" | "too-large" | "unsupported";

const FRAME_MS = 333; // ~3 fps

function SendPage() {
  const ready = useStoreReady();
  const [view, setView] = useState<View>("making");
  const [session, setSession] = useState<Session | null>(null);
  const [part, setPart] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const make = useCallback(async () => {
    setSession(null);
    setPart(0);
    setPaused(false);
    if (!codecSupported()) return setView("unsupported");
    setView("making");
    // One stable snapshot per session; fresh code, salt, IV and SID every time.
    const snapshot = useProgress.getState().snapshot();
    const code = newCode();
    try {
      const frames = await encodeTransfer({ v: 1, snapshot }, code);
      setSession({ frames, code, summary: summary(snapshot), expiresAt: Date.now() + SESSION_MS });
      setView("showing");
    } catch (err) {
      setView(
        err instanceof TransferError && err.kind === "too-large" ? "too-large" : "unsupported",
      );
    }
  }, []);

  useEffect(() => {
    if (ready === "ok") void make();
  }, [ready, make]);

  // Cycle parts; tick the countdown; expire.
  const n = session?.frames.length ?? 0;
  useEffect(() => {
    if (!session) return;
    const cycle = n > 1 && !paused ? setInterval(() => setPart((p) => (p + 1) % n), FRAME_MS) : 0;
    const clock = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= session.expiresAt) {
        setSession(null);
        setView("expired");
      }
    }, 1000);
    return () => {
      clearInterval(cycle);
      clearInterval(clock);
    };
  }, [session, n, paused]);

  useWakeLock(view === "showing");

  if (ready === "failed")
    return (
      <TransferScreen title="Send progress" heading="Can't read progress" stateKey="failed">
        <p className="text-muted">{HYDRATION_FAILED}</p>
        <BackToYou primary />
      </TransferScreen>
    );
  if (view === "unsupported")
    return (
      <TransferScreen
        title="Send progress"
        heading="This browser can't send progress"
        stateKey={view}
      >
        <p className="text-muted">
          It lacks the compression or encryption Bica needs. Update the browser or use another
          device. Your progress is unchanged.
        </p>
        <BackToYou primary />
      </TransferScreen>
    );
  if (view === "too-large")
    return (
      <TransferScreen
        title="Send progress"
        heading="Too much progress for QR codes"
        stateKey={view}
      >
        <p className="text-muted">
          It needs more than 16 QR parts, so it can't be sent this way. Nothing was cut off and your
          progress is unchanged.
        </p>
        <BackToYou primary />
      </TransferScreen>
    );
  if (view === "expired")
    return (
      <TransferScreen title="Send progress" heading="Code expired" stateKey={view}>
        <p className="text-muted">
          The QR code and transfer code are gone from this screen. A phone that already scanned them
          can still use them.
        </p>
        <Actions>
          <Button onClick={() => void make()}>Make a new code</Button>
          <BackToYou />
        </Actions>
      </TransferScreen>
    );
  if (!session)
    return (
      <TransferScreen title="Send progress" heading="Making a code…" stateKey="making">
        <p className="text-muted" role="status">
          Encrypting your progress on this phone.
        </p>
      </TransferScreen>
    );

  const left = Math.max(0, session.expiresAt - now);
  const mmss = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")}`;
  const svg = renderSVG(session.frames[part]!, { border: 4, boostEcc: true, pixelSize: 8 });
  return (
    <AppShell hideNav>
      <div className="short-landscape:-mt-4 short-landscape:grid short-landscape:grid-cols-[280px_1fr] short-landscape:gap-x-6">
        <div className="short-landscape:col-start-2">
          <BackTitle title="Send progress" focusKey="showing" />
          <p className="mt-3 font-medium short-landscape:mt-0">On the other phone</p>
          <p className="text-muted">Open You → Receive progress.</p>
        </div>
        <figure className="m-0 mt-4 short-landscape:col-start-1 short-landscape:row-span-2 short-landscape:row-start-1 short-landscape:mt-0">
          {/* Always black on pure white with a 4-module quiet zone, dark mode too. */}
          <img
            src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
            alt={
              n > 1
                ? `QR code in ${n} parts. Scan it with Receive progress on the other phone until every part is in.`
                : "QR code. Scan it with Receive progress on the other phone."
            }
            className="mx-auto block aspect-square w-full min-w-[280px] max-w-[360px] bg-white [image-rendering:pixelated] short-landscape:w-[280px]"
          />
          {n > 1 && (
            <figcaption className="mt-2 flex items-center justify-between gap-2 text-sm text-muted short-landscape:mt-0">
              <span aria-live={paused ? "polite" : "off"}>
                Part {part + 1} of {n}
              </span>
              <span className="flex items-center gap-1">
                {paused && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Previous QR part"
                      onClick={() => setPart((p) => (p - 1 + n) % n)}
                    >
                      <ChevronLeft aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Next QR part"
                      onClick={() => setPart((p) => (p + 1) % n)}
                    >
                      <ChevronRight aria-hidden />
                    </Button>
                  </>
                )}
                <Button variant="ghost" onClick={() => setPaused((p) => !p)}>
                  {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
                  {paused ? "Resume" : "Pause"}
                </Button>
              </span>
            </figcaption>
          )}
        </figure>
        <div className="mt-4 space-y-3 short-landscape:col-start-2 short-landscape:mt-2 short-landscape:space-y-2">
          <TransferCode code={session.code} />
          <p className="text-center font-medium">{session.summary}</p>
          <p className="flex items-start justify-center gap-2 text-sm text-muted">
            <Sun aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Turn screen brightness up.
              <br />
              Hold steady, 15–30 cm apart.
            </span>
          </p>
          <p className="text-center text-xs text-subtle">
            Works offline · code closes in <span className="tabular-nums">{mmss}</span>
          </p>
          <Button asChild variant="secondary" className="w-full">
            <Link to="/me" className="no-underline">
              Done
            </Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

/** Best effort: keep the screen on while the code shows; never blocks sending. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const take = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((l) => (gone ? void l.release() : (lock = l)))
        .catch(() => {});
    };
    const onVisibility = () =>
      document.visibilityState === "visible" ? take() : void lock?.release();
    take();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
    };
  }, [active]);
}
