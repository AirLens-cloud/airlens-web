import type { ChatBudgetStatus, ChatStreamEvent } from './types';

const encoder = new TextEncoder();

function sseLine(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * C1 scaffold stream: echoes the user's last message back token-by-token as
 * SSE `token` events, then a `done` event carrying the real budget status
 * from checkGlobalBudget. No `citations` event is ever emitted here — C1 has
 * no RAG, and a fabricated empty-citations event would misrepresent "we
 * searched and found nothing" as having happened (Glass-box). `intent` is
 * hardcoded to `'general'`; intent classification (guardrails.ts port) is
 * C3 scope per the design doc.
 */
export function buildEchoStream(userMessage: string, budgetStatus: ChatBudgetStatus): ReadableStream<Uint8Array> {
  // Keep whitespace as its own token so the client can join tokens verbatim
  // without re-inserting spaces.
  const tokens = userMessage.split(/(\s+)/).filter((t) => t.length > 0);
  let index = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < tokens.length) {
        controller.enqueue(sseLine({ type: 'token', content: tokens[index] }));
        index += 1;
        return;
      }
      controller.enqueue(sseLine({ type: 'done', budget: budgetStatus, intent: 'general' }));
      controller.close();
    },
  });
}
