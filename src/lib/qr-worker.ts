/// <reference lib="webworker" />
/** jsQR fallback decoder (#36), a same-origin Vite module worker. */
import jsQR from "jsqr";

self.onmessage = (e: MessageEvent<{ data: Uint8ClampedArray; width: number; height: number }>) => {
  const { data, width, height } = e.data;
  const code = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
  self.postMessage(code?.data ?? null);
};
