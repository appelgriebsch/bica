import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftRight, Pause, Play } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Actions, BackToYou, TransferScreen } from "@/components/transfer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UPDATE_MESSAGES, updateApp } from "@/lib/app-update";
import { useProgress, type ProgressSnapshot } from "@/lib/progress-store";
import {
  cameraAvailable,
  cameraProblem,
  openCamera,
  startDecoding,
  stopTracks,
  type CameraProblem,
} from "@/lib/qr-scan";
import {
  codecSupported,
  formatCode,
  isComplete,
  missingParts,
  normalizeCode,
  ReceiveSession,
  received,
  TransferError,
  type Collection,
} from "@/lib/transfer";
import {
  commitMerge,
  HYDRATION_FAILED,
  MERGE_RULE,
  previewMerge,
  summary,
  useStoreReady,
  type MergePreview,
} from "@/lib/transfer-merge";
import { transferSchema } from "@/lib/transfer-schema";
import { todayKey } from "@/lib/utils";

export const Route = createFileRoute("/me_/receive")({ component: ReceivePage });

const STALL_MS = 20_000;

type View =
  | "start"
  | "failed"
  | "scanning"
  | "stalled"
  | "code"
  | "review"
  | "saved"
  | "noop"
  | "save-failed"
  | "expired"
  | "update"
  | "invalid"
  | "unsupported"
  | CameraProblem;

function ReceivePage() {
  const ready = useStoreReady();
  const [view, setView] = useState<View>(() => (codecSupported() ? "start" : "unsupported"));
  const session = useRef<ReceiveSession | null>(null);
  const [, setTick] = useState(0); // re-render when the session's parts change
  const [paused, setPaused] = useState(false);
  const [foreign, setForeign] = useState(false);
  const [restarted, setRestarted] = useState(false);
  const [remote, setRemote] = useState<ProgressSnapshot | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [reviewChanged, setReviewChanged] = useState(false);
  const lastNew = useRef(0);
  const expiresAt = useRef(0);

  const reset = useCallback(() => {
    session.current = null;
    setRemote(null);
    setPreview(null);
  }, []);

  // Leaving the page drops every transient part, code and snapshot.
  useEffect(() => reset, [reset]);

  const begin = (fresh: boolean, restart = false) => {
    if (fresh || !session.current) {
      session.current = new ReceiveSession();
      expiresAt.current = session.current.expiresAt;
    }
    setRestarted(restart);
    setForeign(false);
    setPaused(false);
    lastNew.current = Date.now();
    setView("scanning");
  };

  const onText = useCallback((text: string) => {
    const s = session.current;
    if (!s) return;
    const result = s.add(text);
    if (result === "version") {
      session.current = null;
      setView("update");
    } else if (result === "foreign") {
      setForeign(true);
    } else if (result === "new") {
      lastNew.current = Date.now();
      navigator.vibrate?.(10);
      setTick((t) => t + 1);
      if (s.collection && isComplete(s.collection)) setView("code");
    }
  }, []);

  // Five-minute transient session (parts, then the decrypted snapshot); stall check.
  useEffect(() => {
    const id = setInterval(() => {
      if ((session.current || remote) && Date.now() >= expiresAt.current) {
        reset();
        setView("expired");
      } else if (view === "scanning" && !paused && Date.now() - lastNew.current > STALL_MS) {
        setView("stalled");
      }
    }, 1000);
    return () => clearInterval(id);
  }, [view, paused, remote, reset]);

  if (ready === "failed" || view === "failed")
    return (
      <Screen heading="Can't read progress" view="failed">
        <p className="text-muted">{HYDRATION_FAILED}</p>
        <BackToYou primary />
      </Screen>
    );
  if (ready === "loading")
    return (
      <Screen heading="Reading your progress…" view="loading">
        <span />
      </Screen>
    );

  const c = session.current?.collection ?? null;
  switch (view) {
    case "start":
      return (
        <Screen heading="Scan the other phone" view={view}>
          <p className="text-muted">On the other phone, open You → Send progress.</p>
          <p className="text-muted">
            Bica needs the rear camera to scan the code. The video stays on this device.
          </p>
          {cameraAvailable() ? (
            <Actions>
              <Button onClick={() => begin(true)}>Allow camera</Button>
              <CancelLink />
            </Actions>
          ) : (
            <NoCamera />
          )}
        </Screen>
      );
    case "scanning":
    case "stalled":
      return (
        <Screen heading={view === "stalled" ? "Lost the code" : "Scanning"} view={view}>
          {view === "scanning" && !paused && <Camera onText={onText} onProblem={setView} />}
          {view === "stalled" && (
            <p className="text-muted">
              Turn the other phone's screen brightness up and hold steady, 15–30 cm apart. Parts
              already received are kept.
            </p>
          )}
          {restarted && <p role="status">Starting a new scan. Previous parts cleared.</p>}
          <Collected c={c} />
          {foreign && (
            <p className="text-sm" role="status">
              Another code is in view. Its parts are ignored. Scan a new code to start over with it.
            </p>
          )}
          <p className="text-sm text-muted">
            Each part only needs to be scanned once. Nothing is saved yet.
          </p>
          <Actions>
            {view === "stalled" ? (
              <Button onClick={() => begin(false)}>Keep scanning</Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  lastNew.current = Date.now(); // a pause doesn't count toward the stall
                  setPaused((p) => !p);
                }}
              >
                {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
                {paused ? "Resume scanning" : "Pause scanning"}
              </Button>
            )}
            {(foreign || view === "stalled" || (c && received(c) > 0)) && (
              <Button variant="secondary" onClick={() => begin(true, true)}>
                Scan a new code
              </Button>
            )}
            <CancelLink />
          </Actions>
        </Screen>
      );
    case "code":
      return (
        <Unlock
          parts={c?.n ?? 0}
          session={session.current!}
          onRescan={() => begin(true)}
          onUnlocked={(snapshot) => {
            const p = previewMerge(useProgress.getState().snapshot(), snapshot);
            session.current = null; // ciphertext and code are no longer needed
            if (p.changed) setRemote(snapshot); // a no-op keeps nothing transient
            setPreview(p);
            setReviewChanged(false);
            setView(p.changed ? "review" : "noop");
          }}
          onInvalid={() => {
            reset();
            setView("invalid");
          }}
          onDiscarded={() => {
            reset();
            setView("expired");
          }}
        />
      );
    case "review":
    case "save-failed":
      return (
        <Screen heading={view === "review" ? "Ready to merge" : "Couldn't save"} view={view}>
          {view === "save-failed" && (
            <p role="alert">
              Progress wasn't saved on this phone. Nothing changed. Free some storage, then try
              again.
            </p>
          )}
          {reviewChanged && (
            <p role="status">Progress on this phone changed. Here is the new result.</p>
          )}
          <p className="paper-card rounded-[var(--radius-lg)] p-4">
            <span className="block text-sm text-muted">From the other phone</span>
            <span className="font-medium">{summary(remote!)}</span>
          </p>
          <Review p={preview!} />
          <Actions>
            <Button
              onClick={() => {
                const r = commitMerge(preview!, remote!);
                if (!("preview" in r))
                  return setView(r.status === "failed" ? "save-failed" : "failed");
                setPreview(r.preview);
                if (r.status === "changed") {
                  setReviewChanged(true);
                  return setView("review");
                }
                setRemote(null);
                setView(r.status);
              }}
            >
              <ArrowLeftRight aria-hidden /> {view === "review" ? "Merge progress" : "Retry"}
            </Button>
            <Button variant="secondary" onClick={() => (reset(), setView("start"))}>
              Cancel
            </Button>
          </Actions>
          <p className="text-sm text-subtle">
            Only this phone changes. The other phone keeps its progress.
          </p>
        </Screen>
      );
    case "saved":
      return (
        <Screen heading="Progress merged. Saved on this phone." view={view}>
          <Review p={preview!} done />
          <SwapPrompt />
        </Screen>
      );
    case "noop":
      return (
        <Screen heading="Nothing new to merge" view={view}>
          <p className="text-muted">This phone already has all of that progress.</p>
          <Actions>
            <BackToYou primary />
            <SendLink />
          </Actions>
        </Screen>
      );
    case "expired":
      return (
        <Screen heading="Code no longer usable" view={view}>
          <p className="text-muted">
            The scanned parts were cleared. Make a new code on the other phone, then scan again.
            Your saved progress is untouched.
          </p>
          <Actions>
            <Button onClick={() => begin(true)}>Scan again</Button>
            <BackToYou />
          </Actions>
        </Screen>
      );
    case "update":
      return <UpdateRequired />;
    case "invalid":
      return (
        <Screen heading="Couldn't read this progress" view={view}>
          <p className="text-muted">
            The code unlocked, but what it holds isn't progress this version of Bica accepts.
            Nothing was changed.
          </p>
          <Actions>
            <Button onClick={() => begin(true)}>Scan again</Button>
            <BackToYou />
          </Actions>
        </Screen>
      );
    case "unsupported":
      return (
        <Screen heading="This browser can't receive progress" view={view}>
          <p className="text-muted">
            It lacks the compression or encryption Bica needs. Update the browser or use another
            device. Your progress is unchanged.
          </p>
          <BackToYou primary />
        </Screen>
      );
    case "denied":
      return (
        <Screen heading="Camera not allowed" view={view}>
          <p className="text-muted">
            Tap Retry and allow the camera. If the browser doesn't ask again, allow the camera for
            this site in the browser's site settings, then Retry.
          </p>
          <Actions>
            <Button onClick={() => begin(false)}>Retry</Button>
            <BackToYou />
          </Actions>
        </Screen>
      );
    case "blocked":
      return (
        <Screen heading="Camera scanning isn't available here" view={view}>
          <p className="text-muted">
            Camera scanning isn't available in this browser. Open Bica directly in a supported
            browser.
          </p>
          <BackToYou primary />
        </Screen>
      );
    case "nocamera":
      return (
        <Screen heading="No camera" view={view}>
          <NoCamera />
        </Screen>
      );
  }
}

function Screen(props: { heading: string; view: string; children: ReactNode }) {
  return (
    <TransferScreen title="Receive progress" heading={props.heading} stateKey={props.view}>
      {props.children}
    </TransferScreen>
  );
}

function CancelLink() {
  return (
    <Button asChild variant="ghost">
      <Link to="/me" className="no-underline">
        Cancel
      </Link>
    </Button>
  );
}

function SendLink() {
  return (
    <Button asChild variant="secondary">
      <Link to="/me/send" className="no-underline">
        Send from this phone
      </Link>
    </Button>
  );
}

function NoCamera() {
  return (
    <>
      <p className="text-muted">
        This device can't scan progress codes. Receive on a device with a working camera.
      </p>
      <Actions>
        <SendLink />
        <BackToYou />
      </Actions>
    </>
  );
}

/** Camera preview plus decoding. Unmounting stops every track and the worker. */
function Camera({
  onText,
  onProblem,
}: {
  onText: (text: string) => void;
  onProblem: (p: CameraProblem) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onVisibility = () => document.visibilityState === "hidden" && setHidden(true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (hidden) return;
    let stream: MediaStream | null = null;
    let stop = () => {};
    let gone = false;
    openCamera()
      .then(async (s) => {
        if (gone) return stopTracks(s);
        stream = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => {});
        stop = startDecoding(v, onText);
      })
      .catch((err) => !gone && onProblem(cameraProblem(err)));
    return () => {
      gone = true;
      stop();
      stopTracks(stream);
    };
  }, [hidden, onText, onProblem]);
  if (hidden)
    return (
      <div className="space-y-2">
        <p role="status">Camera off while Bica was in the background.</p>
        <Button onClick={() => setHidden(false)}>Resume scanning</Button>
      </div>
    );
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] bg-black">
      <video
        ref={video}
        playsInline
        muted
        autoPlay
        aria-hidden
        className="aspect-square w-full object-cover"
      />
      <p className="sr-only">Camera is looking for the code.</p>
    </div>
  );
}

/** Segmented n-part progress; text carries the same meaning for screen readers. */
function Collected({ c }: { c: Collection | null }) {
  if (!c) return <p role="status">Looking for a new code</p>;
  const got = received(c);
  const missing = missingParts(c);
  return (
    <div>
      <p className="font-medium" role="status">
        {got === c.n ? `All ${c.n} parts received` : `${got} of ${c.n} received`}
      </p>
      <Progress
        value={(got / c.n) * 100}
        label={`${got} of ${c.n} parts received`}
        className="sr-only"
      />
      <ol aria-hidden className="mt-2 grid grid-cols-8 gap-1 sm:grid-cols-16">
        {c.parts.map((p, i) => (
          <li
            key={i}
            className={
              p
                ? "rounded-[var(--radius-sm)] bg-accent py-1 text-center text-xs text-accent-fg"
                : "rounded-[var(--radius-sm)] py-1 text-center text-xs shadow-[var(--shadow-border)]"
            }
          >
            {i + 1}
          </li>
        ))}
      </ol>
      {missing.length > 0 && (
        <p className="mt-2 text-sm text-muted">Still need parts {missing.join(", ")}</p>
      )}
    </div>
  );
}

function Unlock({
  parts,
  session,
  onRescan,
  onUnlocked,
  onInvalid,
  onDiscarded,
}: {
  parts: number;
  session: ReceiveSession;
  onRescan: () => void;
  onUnlocked: (snapshot: ProgressSnapshot) => void;
  onInvalid: () => void;
  onDiscarded: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const code = normalizeCode(value);
    if (!code) {
      setError(
        "Enter the 8-character code shown under the QR on the other phone. Codes never contain O, I, L, 0 or 1.",
      );
      return input.current?.focus();
    }
    setBusy(true);
    try {
      const envelope = transferSchema(todayKey()).safeParse(await session.unlock(code));
      if (!envelope.success) return onInvalid();
      onUnlocked(envelope.data.snapshot);
    } catch (err) {
      const kind = err instanceof TransferError ? err.kind : "malformed";
      if (kind === "discarded") return onDiscarded();
      if (kind !== "unlock") return onInvalid();
      setError(
        "Couldn't unlock this code. Check the transfer code on the other phone, or scan again.",
      );
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen heading="Enter the transfer code" view="code">
      <p role="status">All {parts} parts received. Camera off.</p>
      <p className="text-muted">Use the transfer code shown below the QR on the other phone.</p>
      <form onSubmit={submit} className="space-y-2">
        <label htmlFor="transfer-code" className="block text-sm font-medium">
          Transfer code
          <span className="sr-only"> (two groups of four characters)</span>
        </label>
        <input
          ref={input}
          id="transfer-code"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={11}
          value={value}
          onChange={(e) => {
            const v = e.target.value.toUpperCase();
            const raw = v.replace(/[\s-]/g, "");
            setValue(raw.length > 4 && raw.length <= 8 ? formatCode(raw) : v);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-12 w-full rounded-[var(--radius-md)] bg-surface px-4 font-mono text-2xl tracking-widest shadow-[var(--shadow-border)]"
        />
        {error && (
          <p id={errorId} className="text-sm text-danger">
            {error}
          </p>
        )}
        <Actions>
          <Button type="submit" disabled={busy}>
            {busy ? "Unlocking…" : error ? "Try code again" : "Unlock progress"}
          </Button>
          <Button type="button" variant="secondary" onClick={onRescan}>
            Scan again
          </Button>
          <CancelLink />
        </Actions>
      </form>
    </Screen>
  );
}

function Review({ p, done = false }: { p: MergePreview; done?: boolean }) {
  const rows: [string, string][] = [];
  if (p.newLessons) rows.push(["Lessons added", `+${p.newLessons}`]);
  if (p.changedLessons) rows.push(["Lesson scores updated", String(p.changedLessons)]);
  if (p.newCards) rows.push(["Cards added", `+${p.newCards}`]);
  if (p.changedCards) rows.push(["Cards updated", String(p.changedCards)]);
  if (p.xp[0] !== p.xp[1]) rows.push(["XP", `${p.xp[0]} → ${p.xp[1]}`]);
  const streak =
    p.streak[0] === p.streak[1] ? `${p.streak[1]} · unchanged` : `${p.streak[0]} → ${p.streak[1]}`;
  const floor =
    p.floor[0] === p.floor[1] ? `${p.floor[1]} · unchanged` : `${p.floor[0]} → ${p.floor[1]}`;
  return (
    <section className="paper-card rounded-[var(--radius-lg)] p-4">
      <h3 className="font-display text-xl font-medium">On this phone</h3>
      <dl className="mt-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt>{k}</dt>
            <dd className="font-medium tabular-nums text-accent">{v}</dd>
          </div>
        ))}
      </dl>
      {!done && <p className="mt-2 text-sm">{MERGE_RULE}</p>}
      <p className="mt-3 border-t border-border pt-3 text-sm text-muted">
        {done ? "Now" : "After merge"}: streak {streak}
        <br />
        Treat me as {floor}
      </p>
    </section>
  );
}

function SwapPrompt() {
  return (
    <section className="paper-card rounded-[var(--radius-lg)] p-4">
      <h3 className="font-medium">Want progress on both?</h3>
      <p className="mt-1 text-sm text-muted">
        This was one-way only. Send from this phone, then open Receive progress on the other phone.
      </p>
      <Actions>
        <SendLink />
        <BackToYou />
      </Actions>
    </section>
  );
}

function UpdateRequired() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Screen heading="Update Bica on this phone to receive this" view="update">
      <p className="text-muted">
        This code uses a format this version of Bica can't read. Update, then scan it again. Your
        progress is unchanged.
      </p>
      {message && <p role="status">{message}</p>}
      <Actions>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await updateApp();
            setBusy(false);
            setMessage(r === "reloading" ? "Updating…" : UPDATE_MESSAGES[r]);
          }}
        >
          {busy ? "Checking…" : "Update app"}
        </Button>
        <BackToYou />
      </Actions>
    </Screen>
  );
}
