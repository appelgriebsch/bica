import { createServerFn } from "@tanstack/react-start";
import { chatInput, sendChatHandler } from "@/lib/chat-core";
import { serverFnErrors } from "@/lib/server-fn-errors";

// No auth middleware since #33: sendChatHandler is gated by CHAT_ENABLED until #35.
// serverFnErrors turns a validator failure into 400 invalid_input.
export const sendChat = createServerFn({ method: "POST" })
  .middleware([serverFnErrors])
  .validator((input: unknown) => chatInput.parse(input))
  .handler(({ data }) => sendChatHandler(data));
