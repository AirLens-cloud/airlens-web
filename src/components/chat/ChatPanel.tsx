import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CloseIcon } from '../icons'
import { ASSISTANT_API_BASE } from '../../lib/config/dataSources'
import { streamAssistantReply } from '../../api/assistant'
import ChatMessageBubble from './ChatMessageBubble'
import type { ChatCitation, ChatMessage } from '../../types/chat'

/**
 * ChatPanel — Field Assistant surface (mockup §06b "템플릿 E", Wave 4 Block 3,
 * Δ4). Structural port of AirLens-platform apps/web/src/components/chat/ChatPanel.tsx.
 *
 * C1 (workers/assistant/, Field Assistant v2 design §4) wires this up to a
 * real backend for the first time — but only when `VITE_ASSISTANT_API_BASE`
 * is configured. With it unset (the default — the worker is not deployed
 * yet), this renders the same disabled "coming back soon" state as before:
 * rendering a fake conversation here would violate Glass-box (a scripted
 * demo could be mistaken for a live answer). See ChatMessageBubble/
 * CitationCard for that machinery, demonstrated with explicitly-synthetic
 * data in the /design gallery instead.
 *
 * C1 is SSE echo only (no RAG, no LLM) — the assistant's reply is literally
 * the user's own message streamed back token-by-token. That is expected
 * scaffold behavior, not a bug; C2 wires the real model.
 */
interface ChatPanelProps {
  onClose: () => void
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

export default function ChatPanel({ onClose }: ChatPanelProps) {
  const isActive = ASSISTANT_API_BASE !== ''

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const listEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

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
