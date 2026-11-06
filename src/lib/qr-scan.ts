/**
 * Camera QR scanning for Receive progress (#36). BarcodeDetector when it can
 * really decode QR, otherwise jsQR in a module worker. Frames are downscaled to
 * 640 px and centre-cropped; one decode in flight. Nothing leaves the device.
 */
type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorClass = {
  new (o: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

const SIDE = 640;

async function nativeDetector(): Promise<Detector | null> {
  const BD = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  try {
    if (!BD || !(await BD.getSupportedFormats()).includes("qr_code")) return null;
    return new BD({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

export type CameraProblem = "denied" | "blocked" | "nocamera";

/** Why the camera can't open: policy/insecure context vs. the user saying no vs. no camera. */
export function cameraProblem(err: unknown): CameraProblem {
  const name = (err as { name?: string })?.name;
  // Chromium can tell a Permissions-Policy block apart from the user saying no.
  const policy = (document as { featurePolicy?: { allowsFeature(f: string): boolean } })
    .featurePolicy;
  if (
    name === "SecurityError" ||
    !window.isSecureContext ||
    policy?.allowsFeature("camera") === false
  )
    return "blocked";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "nocamera";
  return "denied";
}

export function cameraAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof Worker !== "undefined"
  );
}

/** Rear camera when there is one; `ideal` falls back to any camera. */
export function openCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: "environment" } },
  });
}

/**
 * Decode frames from `video` until stopped. Calls `onText` for each decoded QR
 * text (duplicates included; the caller dedupes). Returns stop(), which also
 * terminates the worker and drops pending callbacks.
 */
export function startDecoding(video: HTMLVideoElement, onText: (text: string) => void): () => void {
  let stopped = false;
  let busy = false;
  let worker: Worker | null = null;
  let pending: ((text: string | null) => void) | null = null;
  let detector: Promise<Detector | null> = nativeDetector();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const viaWorker = (img: ImageData) =>
    new Promise<string | null>((resolve) => {
      if (!worker) {
        worker = new Worker(new URL("./qr-worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (e) => pending?.(e.data);
        worker.onerror = () => pending?.(null);
      }
      pending = resolve;
      worker.postMessage({ data: img.data, width: img.width, height: img.height }, [
        img.data.buffer,
      ]);
    });

  async function decode(): Promise<string | null> {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h || !ctx) return null;
    const crop = Math.min(w, h);
    const side = Math.min(SIDE, crop);
    canvas.width = canvas.height = side;
    ctx.drawImage(video, (w - crop) / 2, (h - crop) / 2, crop, crop, 0, 0, side, side);
    const native = await detector;
    if (native) {
      try {
        return (await native.detect(canvas))[0]?.rawValue ?? null;
      } catch {
        detector = Promise.resolve(null); // native decoding failed: jsQR from now on
      }
    }
    return viaWorker(ctx.getImageData(0, 0, side, side));
  }

  const rvfc = "requestVideoFrameCallback" in video;
  const next = () => {
    if (stopped) return;
    if (rvfc) video.requestVideoFrameCallback(tick);
    else setTimeout(tick, 100);
  };
  const tick = () => {
    if (stopped || busy) return next();
    busy = true;
    decode()
      .then((text) => !stopped && text && onText(text))
      .catch(() => {})
      .finally(() => {
        busy = false;
        next();
      });
  };
  next();

  return () => {
    stopped = true;
    pending = null;
    worker?.terminate();
    worker = null;
  };
}

export function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}
