/**
 * ProjectCard — one Guided Project card on `/learn`.
 *
 * Static content only (page-specs/learn-guided-projects.md §4-C) — no progress
 * state, no Start button. `/learn/:slug` and the Lab-backed workspace it would
 * open are out of scope until Lab's L1 alpha ships (spec §6), so the only
 * action a card offers is a link to the dataset it needs. The caveat line is
 * mandatory on every card (spec §4-C "함정" column) — it is what stops a
 * correlation lag-plot or an SDID chart from reading as a causal claim.
 */
export interface ProjectCardProps {
  question: string
  difficulty: string
  estimatedTime: string
  requiredData: string
  caveat: string
  datasetHref: string
}

export default function ProjectCard({
  question,
  difficulty,
  estimatedTime,
  requiredData,
  caveat,
  datasetHref,
}: ProjectCardProps) {
  return (
    <article className="lrn-card">
      <p className="lrn-card__eyebrow t-micro">
        {difficulty} · {estimatedTime}
      </p>
      <h2 className="lrn-card__question h-3">{question}</h2>
      <p className="lrn-card__data t-caption">Requires: {requiredData}</p>
      <p className="lrn-card__caveat t-caveat" data-testid="lrn-card-caveat">
        {caveat}
      </p>
      <a className="lrn-card__link t-tag" href={datasetHref}>
        View required dataset →
      </a>
    </article>
  )
}
