/**
 * Learn — /learn. Guided Projects index (page-specs/learn-guided-projects.md
 * §4-A, Wave C-1).
 *
 * The five projects are fixed by the approved reframing decision (spec §4-C /
 * §8.6) — this file does not invent new ones. `/learn/:slug` (the step-by-step
 * workspace) is Lab-dependent (spec §6 L1 inheritance gate) and out of scope
 * here, so each card's only action is a link to the dataset it needs, not a
 * "Start" button that would open a route that does not exist yet.
 */
import type { CSSProperties } from 'react'
import ProjectCard from '../components/research/ProjectCard'
import PublicPageContainer from '../components/wireframe/PublicPageContainer'
import '../styles/research.css'

interface Project {
  question: string
  difficulty: string
  estimatedTime: string
  requiredData: string
  caveat: string
}

const PROJECTS: Project[] = [
  {
    question: 'How does Seoul PM2.5 move with wind direction?',
    difficulty: 'Beginner',
    estimatedTime: '~20 min',
    requiredData: 'Ground-station PM2.5 + wind direction, rose plot, lag analysis',
    caveat: 'Correlation, not causation — a lag correlation is not proof that wind causes the PM2.5 change.',
  },
  {
    question: 'How does humidity distort a low-cost PM10 sensor?',
    difficulty: 'Intermediate',
    estimatedTime: '~30 min',
    requiredData: 'Raw + bias-corrected PM10 (dual storage), co-located reference/low-cost pair',
    caveat: 'Never merge raw and bias-corrected readings into one value — keep the dual storage split visible.',
  },
  {
    question: 'How far apart are the model (CAMS) and the station, by region and season?',
    difficulty: 'Intermediate',
    estimatedTime: '~30 min',
    requiredData: 'CAMS model output + station observations, region/season/concentration slices',
    caveat: 'Aggregate error hides the worst cases — stratify by region, season, and concentration before reporting.',
  },
  {
    question: 'What bias does satellite AOD missingness introduce into ground estimates?',
    difficulty: 'Advanced',
    estimatedTime: '~40 min',
    requiredData: 'Satellite AOD coverage + missingness map',
    caveat: 'Interpolating over missing coverage hides the gap — treat coverage itself as a first-class result, not something to smooth over.',
  },
  {
    question: 'Did PM2.5 actually change after a specific policy?',
    difficulty: 'Advanced',
    estimatedTime: '~45 min',
    requiredData: 'Pre/post policy PM2.5 series, donor pool, pre-trend and placebo test',
    caveat: 'A before/after comparison alone proves nothing — pair it with a pre-trend check and a placebo test, and state the assumption explicitly.',
  },
]

export default function Learn() {
  return (
    <PublicPageContainer tier="hub" className="lrn-page">
      <div className="lrn-shell">
        <header className="lrn-header fluid-enter" style={{ '--enter-i': 0 } as CSSProperties}>
          <p className="lrn-header__eyebrow t-micro">LEARN · GUIDED PROJECTS · 5 PROJECTS · LAB REQUIRED FOR STEPS</p>
          <h1 className="lrn-header__title h-2">Guided Projects</h1>
          <p className="lrn-header__thesis t-lede">
            Five real air-quality questions, each with the dataset, the technique, and the trap that makes a
            first-pass answer wrong.
          </p>
        </header>

        <section className="lrn-grid fluid-enter" style={{ '--enter-i': 1 } as CSSProperties} aria-label="Guided projects">
          {PROJECTS.map((project) => (
            <ProjectCard
              key={project.question}
              question={project.question}
              difficulty={project.difficulty}
              estimatedTime={project.estimatedTime}
              requiredData={project.requiredData}
              caveat={project.caveat}
              datasetHref="/datasets"
            />
          ))}
        </section>

        <footer className="lrn-footer fluid-enter" style={{ '--enter-i': 2 } as CSSProperties}>
          <p className="lrn-footer__note t-caption">
            Step-by-step mode opens with the Lab — until then each card links its dataset on /datasets.
          </p>
          <a className="lrn-footer__link" href="/lab">
            Open Lab ↗
          </a>
        </footer>
      </div>
    </PublicPageContainer>
  )
}
