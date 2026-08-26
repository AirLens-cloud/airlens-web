/**
 * ChatFAB — the floating "ASK" action button. Ported from
 * AirLens-platform apps/web/src/components/chat/ChatFAB.tsx, stubbed per the
 * porting brief: the source's route/auth/config gating (`useLocation`,
 * `useChatStore`, `useAuthStore`, `isChatbotConfigured`) and its `<ChatPanel>`
 * body are all dropped — this port is a plain presentational FAB with
 * `isOpen`/`onToggle` props and a `children` slot for whatever panel content
 * the caller wants to show when open (a real chat panel is a follow-up item,
 * not ported in this wave). react-i18next stripped — plain-English default props.
 */
import type { ReactNode } from 'react'

export interface ChatFABProps {
  isOpen: boolean
  onToggle: () => void
  /** Panel content shown above the button when `isOpen` — omit to render just the button. */
  children?: ReactNode
  openLabel?: string
  closeLabel?: string
  closeTooltip?: string
  openTooltip?: string
}

export default function ChatFAB({
  isOpen,
  onToggle,
  children,
  openLabel = 'ASK ↗',
  closeLabel = 'CLOSE',
  closeTooltip = 'Close chat',
  openTooltip = 'Open Field Assistant',
}: ChatFABProps) {
  return (
    <>
      {isOpen && children}
      <button
        type="button"
        onClick={onToggle}
        aria-label={isOpen ? closeTooltip : openTooltip}
        aria-expanded={isOpen}
        className={`fab${isOpen ? ' fab-open' : ''}`}
      >
        <span className="fab-eyebrow">{isOpen ? closeLabel : openLabel}</span>
        <span className="fab-glyph" aria-hidden="true">
          {isOpen ? (
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v3M12 20v3M1 12h3M20 12h3" strokeLinecap="round" />
            </svg>
          )}
        </span>
      </button>
    </>
  )
}
