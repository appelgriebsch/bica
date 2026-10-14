import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { chatInput, chatTurn } from "@/lib/chat-core";
import { chatLimiter, checkChatLimit } from "@/lib/chat-limit";

export const sendChat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => chatInput.parse(input))
  .handler(({ data, context }) =>
    chatTurn({
      data,
      apiKey: process.env.XAI_API_KEY,
      limit: () => checkChatLimit(context.userId, Date.now(), chatLimiter()),
    }),
  );
