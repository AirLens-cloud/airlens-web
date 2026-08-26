interface Props {
  ko: string
  en: string
}

/**
 * BilingualLabel — Korean headline + English mono subtitle pair.
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/BilingualLabel.tsx.
 */
export default function BilingualLabel({ ko, en }: Props) {
  return (
    <div className="wf-bi-label">
      <span className="wf-bi-label__ko">{ko}</span>
      <span className="wf-bi-label__en">{en}</span>
    </div>
  )
}
