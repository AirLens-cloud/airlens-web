import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { findGlossaryTerm } from '../../content/glossaryTerms'
import UnitSafeText from './UnitSafeText'

export interface TermLinkProps {
  /** Glossary termId this link explains (see src/content/glossaryTerms.ts). */
  termId: string
  /** Visible label — defaults to the term's display name if omitted. */
  children?: ReactNode
  className?: string
}

/**
 * TermLink — global inline definition trigger
 * (page-specs/methodology-glossary-knowledge-system.md §4.3).
 *
 * Click or keyboard Enter/Space opens a small popover with definition +
 * example + links to the full Glossary entry and its Methodology section.
 * Escape closes it and returns focus to the trigger. If `termId` has no
 * matching catalog entry, this renders a dev-only console warning (spec §7
 * "termId 미등록") and falls back to plain text — it never throws and never
 * shows a broken-looking control to a real visitor.
 */
export default function TermLink({ termId, children, className }: TermLinkProps) {
  const term = findGlossaryTerm(termId)
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const wrapperRef = useRef<HTMLSpanElement | null>(null)
  const popoverId = useId()

  useEffect(() => {
    if (!term && import.meta.env.DEV) {
      console.warn(`TermLink: unregistered termId "${termId}" — add it to src/content/glossaryTerms.ts`)
    }
  }, [term, termId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    // Click/tap anywhere outside this TermLink closes the popover without
    // moving focus (Escape is still the keyboard path that returns focus to
    // the trigger, per the trigger's aria-describedby contract above).
    const onPointerDown = (e: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  if (!term) {
    return <span className={className}>{children ?? termId}</span>
  }

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen((v) => !v)
    }
  }

  const classes = ['knowledge-termlink']
  if (className) classes.push(className)

  return (
    <span ref={wrapperRef} className={classes.join(' ')}>
      <button
        ref={triggerRef}
        type="button"
        className="knowledge-termlink__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        {children ?? term.term}
      </button>
      {open ? (
        <span id={popoverId} role="dialog" className="knowledge-termlink__popover t-caption">
          <span className="knowledge-termlink__popover-title t-tag">{term.term}</span>
          <span className="knowledge-termlink__popover-def">{term.definition}</span>
          <span className="knowledge-termlink__popover-example t-micro">
            <UnitSafeText text={term.example} />
          </span>
          <span className="knowledge-termlink__popover-links">
            <a href={`/glossary#${term.termId}`}>Full entry in Glossary →</a>
            {term.methodRef ? <a href={`/methodology#${term.methodRef}`}>See method →</a> : null}
          </span>
        </span>
      ) : null}
    </span>
  )
}
