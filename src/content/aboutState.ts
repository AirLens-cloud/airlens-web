/**
 * aboutState.ts — About's verifiable current/target state table
 * (page-specs/about-faq-notfound.md §4.1 point 5, D8: manual editing, with a
 * "last verified" column so a stale row is visible rather than silently
 * drifting from reality). This table is hand-maintained — update the
 * `lastVerified` date whenever a row's status changes.
 */

export type RoadmapStageStatus = 'not-started' | 'in-progress' | 'done'

export interface RoadmapStageRow {
  stage: string
  outcome: string
  status: RoadmapStageStatus
  statusNote: string
  lastVerified: string
}

export const ROADMAP_STATE: RoadmapStageRow[] = [
  {
    stage: 'B0',
    outcome: 'Remove false numbers, names, and statuses',
    status: 'in-progress',
    statusNote: 'A few known items remain to be cleaned up',
    lastVerified: '2026-09-01',
  },
  {
    stage: 'B1',
    outcome: 'Publish the Evidence Contract producer',
    status: 'not-started',
    statusNote: 'Not started',
    lastVerified: '2026-09-01',
  },
  {
    stage: 'B2',
    outcome: 'Observatory Shell — cursor, Evidence Rail, view parity',
    status: 'not-started',
    statusNote: 'Only a partial "now" readout exists so far',
    lastVerified: '2026-09-01',
  },
  {
    stage: 'D1',
    outcome: 'Data Product publishing and real health status',
    status: 'not-started',
    statusNote: 'Not started',
    lastVerified: '2026-09-01',
  },
  {
    stage: 'L0–L2',
    outcome: 'Lab: feasibility → alpha → Learn',
    status: 'not-started',
    statusNote: 'Not started',
    lastVerified: '2026-09-01',
  },
  {
    stage: 'P1',
    outcome: 'Research Commons',
    status: 'not-started',
    statusNote: 'Not started',
    lastVerified: '2026-09-01',
  },
]

export const THREE_PRODUCTS = [
  { name: 'Observatory', surface: 'Today · Globe · Country Profile · Insights', description: 'See a scene and check its evidence.' },
  { name: 'Local Research Studio', surface: 'Lab · Learn', description: 'Open the same scene into a query and an analysis.' },
  { name: 'Research Commons', surface: 'Research', description: 'Read verified results in a reproducible form.' },
] as const

export const TWO_INFRA = [
  { name: 'Data plane', role: 'Producer — publishes manifests, source registry, and product health.' },
  { name: 'Web (this app)', role: 'Consumer only — no collection, no inference, no database query of its own; reads published data.' },
] as const

export const OPERATING_PRINCIPLES = [
  'No accounts.',
  'Every feature is free — no payments.',
  'Static publishing on Cloudflare and Hugging Face is the primary delivery path.',
  'Models are published as batch results, not called as a live API.',
  'Model provenance lives in Hugging Face model cards with content-addressed manifests, not a separate MLOps tracker.',
  'Four data sources: OpenAQ, Sensor.Community, Open-Meteo, and NASA satellite products.',
  'Admin functions sit behind Cloudflare Access, for operators only.',
] as const
