import { useState } from 'react'
import ChatFAB from './ChatFAB'
import ChatPanel from './ChatPanel'

/**
 * ChatWidget — owns the open/closed state and docks ChatFAB+ChatPanel bottom-
 * right (Wave 4 Block 3, Δ4). Mounted once in SiteChrome for `chrome: 'site'`
 * routes only — bare/overlay surfaces (e.g. /globe, /design) own their own
 * chrome and are excluded.
 */
export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="chat-dock">
      <ChatFAB isOpen={isOpen} onToggle={() => setIsOpen((v) => !v)}>
        <ChatPanel onClose={() => setIsOpen(false)} />
      </ChatFAB>
    </div>
  )
}
