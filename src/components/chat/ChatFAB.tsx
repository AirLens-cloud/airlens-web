/**
 * ChatFAB — the floating "ASK" action button. Ported from
 * AirLens-platform apps/web/src/components/chat/ChatFAB.tsx, stubbed per the
 * porting brief: the source's route/auth/config gating (`useLocation`,
 * `useChatStore`, `useAuthStore`, `isChatbotConfigured`) is dropped — this
 * port is a plain presentational FAB with `isOpen`/`onToggle` props and a
 * `children` slot for whatever panel content the caller wants to show when
 * open. react-i18next stripped — plain-English default props.
 *
 * Wave 4 Block 3 (Δ4): the toggle glyph now uses the custom icon set's
 * `LiveIcon` (closed — the mockup's "live" concentric-circle mark) and
 * `CloseIcon` (open), replacing the generic inline target/X svgs.
 */
import type { ReactNode } from 'react'
import { LiveIcon, CloseIcon } from '../icons'

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
          {isOpen ? <CloseIcon size={16} /> : <LiveIcon size={16} />}
        </span>
      </button>
    </>
  )
}
