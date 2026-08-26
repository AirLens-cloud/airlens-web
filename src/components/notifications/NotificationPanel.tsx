/**
 * NotificationPanel — dropdown notification panel, renders below the Navbar
 * bell. Ported from AirLens-platform apps/web/src/components/notifications/NotificationPanel.tsx
 * as a fully presentational component: the source read `useNotificationStore`
 * (zustand) directly; this port takes `notifications`/`unreadCount`/`isOpen`
 * plus action callbacks as props instead, with the outside-click-to-close
 * effect kept but driven by the `onClose` prop. react-i18next stripped —
 * plain-English default props.
 */
import { useRef, useEffect } from 'react'
import type { AppNotification } from '../../types/notification'

/** Format a timestamp into a relative or short absolute string. */
function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

const TYPE_GLYPH: Record<AppNotification['type'], string> = {
  alert: '⚠',
  info: 'ℹ',
  update: '↑',
}

function NotificationItem({ n }: { n: AppNotification }) {
  return (
    <div className={`np-item${n.read ? ' np-item--read' : ''}`}>
      <span className="np-item-icon">{TYPE_GLYPH[n.type]}</span>
      <div className="np-item-body">
        <div className="np-item-title">{n.title}</div>
        <div className="np-item-desc">{n.body}</div>
      </div>
      <span className="np-item-time">{formatTime(n.timestamp)}</span>
    </div>
  )
}

export interface NotificationPanelProps {
  isOpen: boolean
  notifications: AppNotification[]
  unreadCount: number
  onMarkAllRead: () => void
  onClearAll: () => void
  onClose: () => void
  titleLabel?: string
  markAllReadLabel?: string
  clearAllLabel?: string
  emptyLabel?: string
}

export default function NotificationPanel({
  isOpen,
  notifications,
  unreadCount,
  onMarkAllRead,
  onClearAll,
  onClose,
  titleLabel = 'Notifications',
  markAllReadLabel = 'Mark all read',
  clearAllLabel = 'Clear all',
  emptyLabel = 'No notifications yet',
}: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return undefined
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const visible = notifications.slice(0, 20)

  return (
    <div ref={panelRef} className="np-panel">
      <div className="np-header">
        <span className="np-header-title">
          {titleLabel}
          {unreadCount > 0 && <span className="np-header-count">({unreadCount})</span>}
        </span>
        <div className="np-header-actions">
          {unreadCount > 0 && (
            <button onClick={onMarkAllRead} className="np-action np-action--primary">
              {markAllReadLabel}
            </button>
          )}
          {notifications.length > 0 && (
            <button onClick={onClearAll} className="np-action np-action--muted">
              {clearAllLabel}
            </button>
          )}
        </div>
      </div>

      <div className="np-list">
        {visible.length === 0 ? (
          <div className="np-empty">{emptyLabel}</div>
        ) : (
          visible.map((n) => <NotificationItem key={n.id} n={n} />)
        )}
      </div>
    </div>
  )
}
