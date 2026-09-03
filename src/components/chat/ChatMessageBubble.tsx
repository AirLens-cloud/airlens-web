import type { ChatMessage } from '../../types/chat'
import CitationCard from './CitationCard'
import { LiveIcon } from '../icons'

/**
 * ChatMessageBubble — ported from AirLens-platform apps/web/src/components/chat/ChatMessageBubble.tsx
 * (Wave 4 Block 3, Δ4). Two deviations from the source, both deliberate:
 *
 *   - No markdown rendering / DOMPurify. The source ran assistant content
 *     through a tiny bold-and-italic markdown shim into `dangerouslySetInnerHTML`;
 *     this port has no live backend producing that markdown, so plain text
 *     avoids adding a sanitizer dependency for a code path nothing exercises
 *     yet. Reintroduce alongside the real backend wiring.
 *   - No DQSS pill at all. The source badged every answer, and this port
 *     briefly kept that as `DqssBadge dqss="unknown"` — which rendered a "—"
 *     and announced "DQSS — — Unknown" to screen readers on every turn. A
 *     document-grounded answer has no data-quality grade to withhold: there
 *     is no sensor reading behind it to score, so the honest render is no
 *     badge rather than a permanently unknown one. Answers that quote a
 *     measured value carry that value's own uncertainty inline, from the
 *     source text (page-specs/ask-assistant.md §11-6).
 */
interface ChatMessageBubbleProps {
  message: ChatMessage
  streaming?: boolean
}

export default function ChatMessageBubble({ message, streaming }: ChatMessageBubbleProps) {
  const isUser = message.role === 'user'
  const hasCitations =
    !isUser && Array.isArray(message.citations) && message.citations.length > 0

  if (isUser) {
    return (
      <div className="msg msg-user">
        <span className="msg-eyebrow">YOU</span>
        <div className="msg-body t-body">{message.content}</div>
      </div>
    )
  }

  return (
    <article className="msg msg-asst">
      <header className="msg-asst-head">
        <span className="msg-asst-mark" aria-hidden="true">
          <LiveIcon size={16} />
        </span>
        <span className="msg-eyebrow">Field Assistant</span>
      </header>

      <div className="msg-body t-body">
        {message.content || (streaming ? <span className="msg-typing-dots">…</span> : null)}
      </div>

      {hasCitations && (
        <ol className="msg-cites">
          {message.citations!.map((c, idx) => (
            <CitationCard key={`${c.source_url}-${idx}`} citation={c} index={idx} />
          ))}
        </ol>
      )}
    </article>
  )
}
