import type { ReactNode } from 'react'

export interface MarkdownBodyProps {
  body: string
}

function isHeadingParagraph(p: string): boolean {
  return /^#{1,6}\s/.test(p) || /^\*\*[^*]+\*\*$/.test(p)
}

function headingText(p: string): string {
  return p.replace(/^#{1,6}\s/, '').replace(/^\*\*|\*\*$/g, '')
}

/** `**bold**` spans → React nodes, built directly (never `dangerouslySetInnerHTML`) so there is no HTML-injection surface regardless of feed content. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

/**
 * Minimal, dependency-free markdown → paragraph renderer for Field Note
 * bodies. This repo has no markdown/sanitize package installed (adding one
 * is a dependency decision outside this task's scope), so rendering goes
 * through React elements only — never raw HTML — which makes injection
 * impossible by construction rather than by a sanitizer's allowlist.
 */
export default function MarkdownBody({ body }: MarkdownBodyProps) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== '')

  return (
    <div className="content-body">
      {paragraphs.map((p, i) =>
        isHeadingParagraph(p) ? (
          <h3 key={i} className="content-body__heading t-body">
            {headingText(p)}
          </h3>
        ) : (
          <p key={i} className="content-body__para t-body">
            {renderInline(p, `p${i}`)}
          </p>
        ),
      )}
    </div>
  )
}
