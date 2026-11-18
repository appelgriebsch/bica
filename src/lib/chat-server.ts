import { createServerFn } from "@tanstack/react-start";
import { chatInput, reviewInput, sendChatHandler, sendReviewHandler } from "@/lib/chat-core";
import { serverFnErrors } from "@/lib/server-fn-errors";

// No auth since #33; #35's Turnstile gate and per-IP/daily limits run inside
// sendChatHandler. serverFnErrors turns a validator failure into 400 invalid_input.
export const sendChat = createServerFn({ method: "POST" })
  .middleware([serverFnErrors])
  .validator((input: unknown) => chatInput.parse(input))
  .handler(async ({ data }) => {
    const { chatRequest } = await import("./chat-request.server");
    return sendChatHandler(data, chatRequest());
  });

// #131 (ADR 0017): the end-of-scene corrections review. Same gate, burst and
// daily caps as sendChat — they run inside sendReviewHandler.
export const reviewScene = createServerFn({ method: "POST" })
  .middleware([serverFnErrors])
  .validator((input: unknown) => reviewInput.parse(input))
  .handler(async ({ data }) => {
    const { chatRequest } = await import("./chat-request.server");
    return sendReviewHandler(data, chatRequest());
  });
