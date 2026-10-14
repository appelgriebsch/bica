import { createServerFn } from "@tanstack/react-start";
import { chatInput, sendChatHandler } from "@/lib/chat-core";
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
