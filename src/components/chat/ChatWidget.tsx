import { useState } from 'react'
import ChatFAB from './ChatFAB'
import ChatPanel from './ChatPanel'

/**
 * ChatWidget — owns the open/closed state and docks ChatFAB+ChatPanel bottom-
 * right (Wave 4 Block 3, Δ4). Mounted once in SiteChrome for `chrome: 'site'`
 * routes only — bare/overlay surfaces (e.g. /globe, /design) own their own
 * chrome and are excluded. Also renders the mobile `.chat-dock-reserve`
 * spacer, which is why it mounts after the footer inside the chrome shell.
 */
export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* F28 — mobile-only end-of-page spacer (composites.css `.chat-dock-reserve`):
          the fixed dock would otherwise sit permanently over the last content. */}
      <div className="chat-dock-reserve" aria-hidden="true" />
      <div className="chat-dock">
        <ChatFAB isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)}>
          <ChatPanel onClose={() => setIsOpen(false)} />
        </ChatFAB>
      </div>
    </>
  )
}
