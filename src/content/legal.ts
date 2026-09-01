/**
 * legal.ts — content for the 6 `/legal/*` documents (Legal.tsx).
 *
 * All 6 are "V0.1 DRAFT — under review": no counsel review has happened yet
 * (page-specs/trust-center-and-legal.md §4, §6). Structure and factual claims
 * are honest and grounded in what this repo actually does (no accounts, no
 * server storage, no payments — see WEB_ARCHITECTURE.md §4.1) but the legal
 * *language* itself has not been drafted or reviewed by counsel. Do not treat
 * this copy as a finished legal document.
 *
 * en/ko equal-force requirement (page-specs D7): both language versions must
 * carry the same "last updated" date and be revised together. Korean has not
 * been written yet — each doc says so honestly rather than shipping a
 * mistranslation or a silent placeholder.
 */

export type LegalDocId = 'privacy' | 'terms' | 'ai-disclaimer' | 'aup' | 'data-contribution' | 'model-card'

export interface LegalDoc {
  id: LegalDocId
  order: number
  title: string
  /** ISO date — must match across en/ko once ko exists (D7 simultaneous-revision rule). */
  lastUpdated: string
  /** Plain-language summary shown above the body — not legal language, an orientation aid. */
  summary: string
  body: string[]
}

export const KOREAN_PENDING_NOTICE =
  'Korean version pending. This document currently exists in English only; the Korean translation has not been written yet.'

export const LEGAL_DOCS: LegalDoc[] = [
  {
    id: 'privacy',
    order: 1,
    title: 'Privacy',
    lastUpdated: '2026-09-01',
    summary: 'What AirLens collects, and what it deliberately does not.',
    body: [
      'AirLens has no user accounts. There is no sign-up, no email address on file, and no persistent device identifier tied to a person.',
      'Location used to center the map or a forecast is coarse and opt-in — it is used in the browser to pick what to show, and AirLens does not log precise coordinates against a visitor.',
      'Anything you build in the Lab (queries, saved views, exported bundles) is stored locally in your browser. Nothing in the Lab is transmitted to an AirLens server as part of normal use.',
      'If you submit a bundle to Research Commons, the submission carries only what you choose to attach — a display name and contact are optional, and no account identifier is issued or required.',
      'This build ships no analytics or tracking code at all — the analytics module in the codebase is a documented no-op with no vendor wired in, so nothing about your visit is sent anywhere to be recorded.',
      'Because there is no account, there is no "delete my account" flow to offer. Data saved in your browser is under your control — clearing site storage removes it.',
    ],
  },
  {
    id: 'terms',
    order: 2,
    title: 'Terms',
    lastUpdated: '2026-09-01',
    summary: 'The service is web-only, free, and does not involve a contract you sign up for.',
    body: [
      'This document covers the AirLens web product only. There is no companion mobile app covered here.',
      'AirLens is free to use and involves no payment, subscription, or billing relationship of any kind.',
      'Public API and MCP access is offered as-is; rate limits and acceptable use are described in the AUP.',
      'If you export or submit a research bundle, you retain responsibility for the content of that bundle — see Data Contribution and AUP for submission conditions.',
      'Because there are no accounts, AirLens keeps no per-user record of activity. This limits AirLens’s ability to identify a specific submitter in a dispute — that limitation is disclosed here rather than glossed over.',
      'This is a V0.1 draft and has not been reviewed by counsel (see the banner on every legal page).',
    ],
  },
  {
    id: 'ai-disclaimer',
    order: 3,
    title: 'AI Disclaimer',
    lastUpdated: '2026-09-01',
    summary: 'What each deployed model actually claims, and its limits — only for models that render values on this site.',
    body: [
      'This disclaimer covers only the models that currently render a value on airlens-web. Models under research or planned for a future mobile app are not listed here — listing a model that produces nothing on this site would misrepresent what is actually live.',
      'PM2.5 forecast grid (Globe / Weather): a satellite-derived, model-based estimate. It is not a ground measurement. Every rendered value ships with a p10–p90 uncertainty band and a DQSS quality grade — see Glossary.',
      'SDID / policy impact estimate (Insights): a statistical causal-inference estimate (synthetic difference-in-differences), not an observed fact. It answers "what likely changed," with an uncertainty range, not "what definitely changed."',
      'No model on this site is intended for medical, legal, or investment decisions. Values described as forecast or inferred are estimates, and this site says so at the value, not only in this document.',
      'Where a value cannot be produced with acceptable confidence, AirLens withholds it rather than guessing — see the Glossary entry for "withheld."',
    ],
  },
  {
    id: 'aup',
    order: 4,
    title: 'Acceptable Use Policy',
    lastUpdated: '2026-09-01',
    summary: 'Rules for the public API, MCP access, and research bundle submissions.',
    body: [
      'Automated access to the public REST/MCP endpoints must respect published rate limits. Do not attempt to circumvent them.',
      'Scraping the site to reconstruct a private copy of the underlying datasets, rather than using the public API, is not permitted.',
      'Research bundle (`.airlens`) submissions to Research Commons must meet the publication receipt requirements — license clarity, reproducibility, and a complete 5-section structure. Submissions that fail these checks are rejected, not silently degraded.',
      'Anonymous submissions are still subject to abuse review; repeated bad-faith submissions may be blocked at the network level even though no account exists to suspend.',
      'Denial-of-service attempts, automated credential stuffing (not applicable — there are no credentials), and any attempt to disrupt availability for other visitors are prohibited.',
    ],
  },
  {
    id: 'data-contribution',
    order: 5,
    title: 'Data Contribution',
    lastUpdated: '2026-09-01',
    summary: 'What happens if you submit a bundle to Research Commons — no account, no profile toggles.',
    body: [
      'There is no account and no profile settings page. Contribution here means submitting a research bundle to Research Commons, and this document describes only that flow.',
      'Purpose receipt: when you submit, you are shown what the submission will be used for (public, versioned publication to Research Commons) before it is sent.',
      'Only coarse location, if any, travels with a submission — never precise device coordinates.',
      'Retention: published bundles are immutable once accepted (Research Commons publications are not silently edited or deleted later; see Terms on supersede/versioning).',
      'Withdrawal works differently without an account: the only guaranteed control point is not submitting in the first place. Once a bundle is accepted and published, it is difficult to reliably retract — this document says so plainly rather than implying an account-style deletion request will work.',
      'Anonymous submitter identifiers are not tracking identifiers — they exist only to distinguish one submission from another, not to build a profile of the submitter.',
    ],
  },
  {
    id: 'model-card',
    order: 6,
    title: 'Model Card',
    lastUpdated: '2026-09-01',
    summary: 'Regulatory-style disclosure for models actually deployed on airlens-web — nothing planned, nothing from the mobile app.',
    body: [
      'This card lists only models whose output is rendered somewhere on airlens-web today. A model with no route producing its output on this site is not listed here — see page-specs/trust-center-and-legal.md §5 Rule 1.',
      'Each entry below states where the model is used, what kind of value it produces (its "nature," per the Glossary), and links to the technical model card on Hugging Face where the training and evaluation detail actually lives — this document does not duplicate that detail.',
      'Fields marked TBD are genuinely not yet finalized. TBD never means the field is silently blank or filled with a placeholder number.',
    ],
  },
]

export interface DeployedModelCardEntry {
  name: string
  usedAt: { label: string; href: string }
  nature: string
  hfCardUrl: string | null
  lastPublished: string | null
  contentHash: string | null
  status: 'published' | 'tbd'
}

/**
 * Model Card §5 Rule 1: only models that actually render a value on
 * airlens-web today. Camera AI / MoodCast / RAG Chat / TFT / sky segmentation
 * are App PRD territory with no route here and are deliberately absent.
 */
export const DEPLOYED_MODELS: DeployedModelCardEntry[] = [
  {
    name: 'PM2.5 forecast grid (AOD → PM2.5)',
    usedAt: { label: 'Globe', href: '/globe' },
    nature: 'satellite-derived / forecast',
    hfCardUrl: null,
    lastPublished: null,
    contentHash: null,
    status: 'tbd',
  },
  {
    name: 'Weather-linked PM2.5 forecast',
    usedAt: { label: 'Weather', href: '/weather' },
    nature: 'forecast',
    hfCardUrl: null,
    lastPublished: null,
    contentHash: null,
    status: 'tbd',
  },
  {
    name: 'SDID policy impact (ROI)',
    usedAt: { label: 'Insights', href: '/insights' },
    nature: 'inferred / policy',
    hfCardUrl: null,
    lastPublished: null,
    contentHash: null,
    status: 'tbd',
  },
]
