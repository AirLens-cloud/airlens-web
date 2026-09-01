/**
 * Chat types — ported from AirLens-platform apps/web/src/types/chat.ts (trimmed
 * to what ChatMessageBubble/CitationCard actually render; the source's
 * request/response wire types are dropped since this port has no backend yet,
 * Wave 4 Block 3).
 */

export interface ChatCitation {
  source_title: string
  source_url: string | null
  /** Retrieval relevance (0-1), not a confidence score. `null` when the worker didn't compute one. */
  relevance: number | null
  excerpt?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  citations?: ChatCitation[]
}
