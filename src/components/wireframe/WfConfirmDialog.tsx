import { useCallback, useEffect, useId, useRef, type KeyboardEvent } from 'react'
import WfButton from './WfButton'
import type { WfConfirmDialogProps } from './types'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * WfConfirmDialog — destructive-action confirmation primitive (paper/ink doctrine).
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/WfConfirmDialog.tsx.
 *
 * WAI-ARIA alertdialog pattern: focus starts on Cancel (not Confirm), Tab is
 * trapped inside the panel, Esc cancels, focus restores to the trigger on close.
 * `busy` blocks Esc/backdrop dismissal so an in-flight action is never silently
 * discarded by the UI.
 *
 * CSS: src/styles/wireframe.css `.wf-confirm`.
 */
export default function WfConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive,
  busy,
  confirmDisabled,
  children,
  className,
}: WfConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descId = useId()

  const dismiss = useCallback(() => {
    if (busy) return
    onCancel()
  }, [busy, onCancel])

  useEffect(() => {
    if (!open) return

    restoreRef.current = document.activeElement as HTMLElement | null
    panelRef.current
      ?.querySelector<HTMLButtonElement>('[data-testid="wf-confirm-cancel"]')
      ?.focus()

    return () => {
      restoreRef.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      dismiss()
      return
    }
    if (e.key !== 'Tab') return

    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    )
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement

    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const classes = ['wf-confirm']
  if (className) classes.push(className)

  return (
    <div className={classes.join(' ')} onKeyDown={onKeyDown}>
      <div className="wf-confirm__backdrop" onClick={dismiss} aria-hidden="true" />
      <div
        ref={panelRef}
        className="wf-confirm__panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
      >
        <h2 id={titleId} className="wf-confirm__title h-3">
          {title}
        </h2>
        {description ? (
          <div id={descId} className="wf-confirm__body t-body">
            {description}
          </div>
        ) : null}
        {children ? <div className="wf-confirm__extra">{children}</div> : null}
        <div className="wf-confirm__actions">
          <WfButton
            variant="outline"
            family="square"
            onClick={dismiss}
            disabled={busy}
            testId="wf-confirm-cancel"
          >
            {cancelLabel}
          </WfButton>
          <WfButton
            variant={destructive ? 'danger' : 'primary'}
            family="square"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            testId="wf-confirm-accept"
          >
            {confirmLabel}
          </WfButton>
        </div>
      </div>
    </div>
  )
}
