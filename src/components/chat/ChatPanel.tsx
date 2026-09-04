import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CloseIcon } from '../icons'
import { ASSISTANT_API_BASE, TURNSTILE_SITE_KEY } from '../../lib/config/dataSources'
import { streamAssistantReply } from '../../api/assistant'
import { mountTurnstileWidget, unmountTurnstileWidget } from '../../lib/turnstile'
import ChatMessageBubble from './ChatMessageBubble'
import type { ChatCitation, ChatMessage } from '../../types/chat'

/**
 * ChatPanel — Field Assistant surface (mockup §06b "템플릿 E", Wave 4 Block 3,
 * Δ4). Structural port of AirLens-platform apps/web/src/components/chat/ChatPanel.tsx.
 *
 * Live since A-4: RAG + intent-classified answers against
 * `workers/assistant/` (C1 scaffold → C2 RAG → C3 intent/live-data → C4
 * eval-verified), gated on `VITE_ASSISTANT_API_BASE` being configured. With
 * it unset, this renders the disabled "coming back soon" state: rendering a
 * fake conversation here would violate Glass-box (a scripted demo could be
 * mistaken for a live answer). See ChatMessageBubble/CitationCard for that
 * machinery, demonstrated with explicitly-synthetic data in the /design
 * gallery instead.
 *
 * Mounts a managed, non-interactive Turnstile widget the moment the panel
 * goes active (`../../lib/turnstile.ts`) — the worker's `/api/session`
 * requires a verification token once its `TURNSTILE_SECRET` is set, and
 * pre-solving here means the first send doesn't wait on it.
 */
interface ChatPanelProps {
  onClose: () => void
  /** Test/demo-only override for ASSISTANT_API_BASE. The /design gallery's
   *  ChatPanel demo passes '' so it stays visibly offline instead of
   *  silently inheriting the live baked default and spending a real
   *  session/budget every time someone opens that page (code review, PR
   *  #50) — production usage (ChatWidget) never passes this. */
  apiBaseOverride?: string
}

const SUGGESTIONS = ['Is it safe to run tonight?', 'Compare with a nearby city'] as const

/** Replaces the trailing assistant placeholder with the tokens assembled so far. */
function applyAssistantUpdate(
  messages: ChatMessage[],
  content: string,
  citations: ChatCitation[] | undefined,
): ChatMessage[] {
  if (messages.length === 0) return messages
  const next = messages.slice()
  const last = next[next.length - 1]
  if (last.role !== 'assistant') return messages
  next[next.length - 1] = { ...last, content, citations }
  return next
}

export default function ChatPanel({ onClose, apiBaseOverride }: ChatPanelProps) {
  const apiBase = apiBaseOverride ?? ASSISTANT_API_BASE
  const isActive = apiBase !== ''

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const turnstileRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  // Start solving a token the moment the panel goes active — see the file
  // header. A rejection (script blocked, ad-blocker) is swallowed here:
  // ensureSession() in api/assistant.ts already treats a missing token as
  // "let the worker decide", not a local failure. The cleanup tears the
  // widget down on unmount (ChatFAB fully unmounts ChatPanel on close) —
  // without it, reopening the panel would try to reuse a widget bound to a
  // container DOM node the FAB already removed (code review, PR #50;
  // turnstile.ts also self-heals this independently, but tearing down
  // immediately on close is cheaper than waiting for the next mount).
  useEffect(() => {
    if (!isActive || !turnstileRef.current) return
    mountTurnstileWidget(turnstileRef.current, TURNSTILE_SITE_KEY).catch(() => {})
    return () => unmountTurnstileWidget()
  }, [isActive])

  // Cancel an in-flight stream if the panel unmounts mid-response.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    const text = input.trim()
    if (!text || isStreaming) return

    const userMessage: ChatMessage = { role: 'user', content: text, timestamp: Date.now() }
    const assistantPlaceholder: ChatMessage = { role: 'assistant', content: '', timestamp: Date.now() }
    const historyForRequest = [...messages, userMessage]

    setMessages([...historyForRequest, assistantPlaceholder])
    setInput('')
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    let assembled = ''
    let citations: ChatCitation[] | undefined

    try {
      for await (const event of streamAssistantReply(historyForRequest, 'en', window.location.pathname, controller.signal)) {
        if (event.type === 'token') {
          assembled += event.content
          setMessages((prev) => applyAssistantUpdate(prev, assembled, citations))
        } else if (event.type === 'citations') {
          citations = event.citations
          setMessages((prev) => applyAssistantUpdate(prev, assembled, citations))
        }
        // 'done' carries budget/intent metadata — nothing to render yet in C1.
      }
    } catch {
      // Aborted (unmount) or a network failure mid-stream — the partial
      // assistant bubble (possibly empty) is left as-is rather than erased,
      // matching what actually happened instead of hiding it.
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

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

      {isActive ? (
        <>
          {/* Managed Turnstile widget — invisible unless Cloudflare decides
              an interactive challenge is needed (appearance: 'interaction-only',
              src/lib/turnstile.ts). No aria-hidden here: WAI-ARIA forbids
              hiding a container that can end up holding focusable content —
              on the rare visitor who does get a checkbox, aria-hidden would
              remove it from the accessibility tree while it stayed visible
              and clickable, silently blocking assistive-tech users (ux-reviewer
              finding, PR #50). Empty in the common case, so this is a no-op
              for everyone else. */}
          <div ref={turnstileRef} className="chat-turnstile" />
          <div className="chat-msgs" role="log" aria-live="polite">
            {messages.length === 0 ? (
              <p className="t-lede chat-msgs-empty">
                Ask about the air where you are — answers cite the observations they came from.
              </p>
            ) : (
              messages.map((m, idx) => (
                <ChatMessageBubble
                  key={m.timestamp + idx}
                  message={m}
                  streaming={isStreaming && idx === messages.length - 1 && m.role === 'assistant'}
                />
              ))
            )}
            <div ref={listEndRef} />
          </div>

          {/* Notice at the point of collection, not only in /legal/privacy:
              what is typed here leaves the device (worker → Cloudflare
              Workers AI). Before this line the panel said nothing at all
              about that. Kept to one sentence so it informs rather than
              becoming the wall of text people learn to skip.
              The purpose stated here must stay no broader than the one in
              content/legal.ts ("finding quality regressions and gaps in the
              documentation the assistant searches"). Until 2026-09-03 this
              said "to improve the assistant", which reads as consent to
              train on what people type — not what happens. */}
          <p className="t-caveat chat-privacy-note">
            Messages are sent to Cloudflare Workers AI to generate a reply, and a copy with personal
            details masked is kept to check answer quality — avoid personal details.{' '}
            <a href="/legal/privacy">Privacy</a>
          </p>

          <form className="chat-input-row" onSubmit={handleSubmit}>
            <input
              type="text"
              className="chat-input"
              placeholder="Ask about air quality…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isStreaming}
              aria-label="Chat input"
            />
            <button type="submit" className="chat-send" disabled={isStreaming || input.trim() === ''}>
              Send
            </button>
          </form>
        </>
      ) : (
        <>
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
        </>
      )}
    </aside>
  )
}
