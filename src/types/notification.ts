/**
 * AppNotification — local type for the ported NotificationPanel.
 * Ported from AirLens-platform apps/web/src/types/notification.ts (trimmed
 * to the fields NotificationPanel actually consumes).
 */
export interface AppNotification {
  id: string
  type: 'alert' | 'info' | 'update'
  title: string
  body: string
  /** ISO timestamp string. */
  timestamp: string
  read: boolean
}
