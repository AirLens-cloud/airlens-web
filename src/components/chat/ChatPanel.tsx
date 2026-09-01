import { CloseIcon } from '../icons'

/**
 * ChatPanel — Field Assistant surface (mockup §06b "템플릿 E", Wave 4 Block 3,
 * Δ4). Structural port of AirLens-platform apps/web/src/components/chat/ChatPanel.tsx
 * (masthead, lede, suggestion chips, disclosure, input row) — the message
 * history, streaming state, and send handler are NOT ported because there is
 * no backend behind this panel yet. Rendering a fake conversation here would
 * violate Glass-box (a scripted demo could be mistaken for a live answer);
 * see ChatMessageBubble/CitationCard for that machinery, demonstrated with
 * explicitly-synthetic data in the /design gallery instead.
 *
 * Suggested prompts are static, non-interactive text (matches the mockup's
 * plain `<span>` chips) — nothing here can currently trigger a request.
 */
interface ChatPanelProps {
  onClose: () => void
}

const SUGGESTIONS = ['Is it safe to run tonight?', 'Compare with a nearby city'] as const

export default function ChatPanel({ onClose }: ChatPanelProps) {
  return (
    <aside className="chat-panel" role="dialog" aria-label="Field Assistant">
      <header className="chat-head">
        <span className="chat-head-left">
          <span className="chat-tickrail" aria-hidden="true"><i /><i /><i /></span>
          <span className="msg-eyebrow">Field Assistant</span>
        </span>
        <button type="button" className="chat-x" onClick={onClose} aria-label="Close chat">
          <CloseIcon size={14} />
        </button>
      </header>

      <div className="chat-mast">
        <p className="t-lede">
          Ask about the air where you are — answers cite the observations they came from.
        </p>
      </div>

      <div className="chat-sug" role="group" aria-label="Example prompts (assistant offline)">
        {SUGGESTIONS.map((s) => (
          <span key={s} className="chat-sug-chip">{s}</span>
        ))}
      </div>

      <p className="t-caveat chat-caveat">
        Answers will always cite their sources and carry the same p10–p90 uncertainty
        as the data behind them (Glass-box) — once the assistant worker is back online.
      </p>

      <form className="chat-input-row" onSubmit={(e) => e.preventDefault()}>
        <input
          type="text"
          className="chat-input"
          placeholder="Assistant backend is being rebuilt — coming back soon"
          disabled
          aria-label="Chat input (disabled — assistant backend is being rebuilt)"
        />
        <button type="submit" className="chat-send" disabled aria-label="Send">
          Send
        </button>
      </form>
    </aside>
  )
}
