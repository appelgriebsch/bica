// Server-only: the request side of sendChat (#35), loaded lazily by chat-server.ts.
import {
  getCookie,
  getRequestHeader,
  setCookie,
  setResponseHeader,
  setResponseStatus,
} from "@tanstack/react-start/server";
import type { ChatRequest } from "@/lib/chat-core";
import { CHAT_COOKIE, SESSION_TTL_MS } from "@/lib/chat-gate";
import { clientIp } from "@/lib/chat-limit";

export function chatRequest(): ChatRequest {
  return {
    // CF-Connecting-IP only; X-Forwarded-For / x-real-ip never read (#17).
    ip: clientIp((name) => getRequestHeader(name)),
    cookie: getCookie(CHAT_COOKIE),
    setCookie: (value) =>
      setCookie(CHAT_COOKIE, value, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        path: "/",
        maxAge: SESSION_TTL_MS / 1000,
      }),
    setStatus: (status, headers = {}) => {
      setResponseStatus(status);
      for (const [k, v] of Object.entries(headers)) setResponseHeader(k, v);
    },
  };
}
