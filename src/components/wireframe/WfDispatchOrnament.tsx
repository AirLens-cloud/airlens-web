interface Props {
  no: number
  label?: string
}

/**
 * WfDispatchOrnament — editorial "issue number" ornament.
 * Ported verbatim from AirLens-platform apps/web/src/components/wireframe/WfDispatchOrnament.tsx.
 */
export default function WfDispatchOrnament({ no, label = 'NO.' }: Props) {
  const num = String(no).padStart(2, '0')
  return (
    <span className="wf-ornament" aria-hidden="true">
      <span className="wf-ornament__dots">●●●</span>
      <span className="wf-ornament__rule">─────</span>
      <span className="wf-ornament__bracket">
        [{label} {num}]
      </span>
    </span>
  )
}
