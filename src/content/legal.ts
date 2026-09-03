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
    lastUpdated: '2026-09-03',
    summary: 'What AirLens collects, and what it deliberately does not.',
    body: [
      'AirLens has no user accounts. There is no sign-up, no email address on file, and no account identifier tied to a person.',
      'Location used to center the map or a forecast is coarse and opt-in — it is used in the browser to pick what to show, and AirLens does not log precise coordinates against a visitor.',
      'Anything you build in the Lab (queries, saved views, exported bundles) is stored locally in your browser. Nothing in the Lab is transmitted to an AirLens server as part of normal use.',
      'If you submit a bundle to Research Commons, the submission carries only what you choose to attach — a display name and contact are optional, and no account identifier is issued or required.',
      'The Field Assistant chat is optional and does nothing until you open it and send something. When you do, that message and the recent turns of the same conversation are sent to an AirLens worker running on Cloudflare, which passes them to Cloudflare Workers AI to generate the reply — Cloudflare processes that text on AirLens’s behalf. Text you type into the chat leaves your browser by design, so do not put personal or confidential information into it.',
      'AirLens keeps a copy of those exchanges. Each turn — your question and the assistant’s reply — is stored after personal identifiers are masked, alongside technical details of the exchange: the page and language you asked from, how long the reply took, how closely the documentation search matched, and whether the reply was cut short. The purpose is narrow: finding quality regressions and gaps in the documentation the assistant searches. Nothing you type is linked to you, and no identifier that could be traced back to you is stored with it.',
      'Masking happens in the same request, before anything is written. The filter replaces email addresses, phone numbers, resident and foreign registration numbers, card and bank account numbers, business registration numbers, and passport and vehicle numbers, along with anything in the query string of a link; precise coordinates are rounded to roughly a kilometre rather than removed, so a question about a place still makes sense. That filter is pattern-based and imperfect — it does not attempt to recognise names — which is why the advice above stands: do not type personal or confidential information into the chat. The transfer buffer is cleared within seven days, and stored question and reply text is destroyed after 90 days; the technical details above are kept beyond that.',
      'To stop a single visitor from exhausting the shared daily budget the assistant runs on, the chat worker counts requests against a key derived from your IP address. That key is a salted hash, recomputed each UTC day, so it rotates daily and cannot be read back to an address; the raw IP is not stored, and the counter holds nothing but a number. This is the one place where something derived from your network address is used, and it exists for abuse control only.',
      'This build ships no analytics or tracking code at all — the analytics module in the codebase is a documented no-op with no vendor wired in. Browsing AirLens sends nothing about your visit anywhere to be recorded; the chat described above is the one feature that transmits what you type.',
      'Because there is no account, there is no "delete my account" flow to offer. Data saved in your browser is under your control — clearing site storage removes it.',
      'For the stored chat turns, that cuts both ways, and it is worth stating plainly rather than leaving implied: with nothing tying a conversation to a person, AirLens has no way to verify that a particular stored conversation is yours, and therefore cannot honour a request to delete a specific one. The 90-day destruction and the masking that happens before storage are what stand in for that — they run automatically and are not something you have to ask for.',
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
      'Because there are no accounts, AirLens keeps no per-user record of activity. What is kept is the daily-rotating abuse counters described in Privacy, which hold a count and nothing else, and the masked chat turns described there — neither carries an identifier that points back to a person. This limits AirLens’s ability to identify a specific submitter in a dispute — that limitation is disclosed here rather than glossed over.',
      'This is a V0.1 draft and has not been reviewed by counsel (see the banner on every legal page).',
    ],
  },
  {
    id: 'ai-disclaimer',
    order: 3,
    title: 'AI Disclaimer',
    lastUpdated: '2026-09-03',
    summary: 'What each deployed model actually claims, and its limits — only for models that produce output on this site.',
    body: [
      'This disclaimer covers only the models that currently produce output on airlens-web. Models under research or planned for a future mobile app are not listed here — listing a model that produces nothing on this site would misrepresent what is actually live.',
      'PM2.5 forecast grid (Globe / Weather): a satellite-derived, model-based estimate. It is not a ground measurement. Every rendered value ships with a p10–p90 uncertainty band and a DQSS quality grade — see Glossary.',
      'SDID / policy impact estimate (Insights): a statistical causal-inference estimate (synthetic difference-in-differences), not an observed fact. It answers "what likely changed," with an uncertainty range, not "what definitely changed."',
      'Field Assistant (chat, every page): a language model answering from AirLens documentation it retrieves at question time, not a source of new measurements. It can be wrong, and it can be confidently wrong — check the citations it shows, and treat any number it repeats as coming from the cited page, with that page’s uncertainty band, rather than from the model.',
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
 * Model Card §5 Rule 1: only models that actually produce output on
 * airlens-web today. Camera AI / MoodCast / TFT / sky segmentation are App
 * PRD territory with no route here and are deliberately absent.
 *
 * The Field Assistant used to be on that absent list too — it is not any
 * more: the chat worker went live on this site (SiteChrome mounts ChatWidget
 * on every page), so leaving it out would have understated what runs here.
 * It is listed with `nature: generated text` because, unlike the three
 * forecast/inference entries, it renders prose rather than a number with a
 * p10–p90 band — see the AI Disclaimer for what that answer is and is not.
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
  {
    name: 'Field Assistant (gemma-4-26b-a4b-it via Cloudflare Workers AI)',
    usedAt: { label: 'Chat (every page)', href: '/legal/ai-disclaimer' },
    nature: 'generated text / retrieval-grounded',
    hfCardUrl: null,
    lastPublished: null,
    contentHash: null,
    status: 'tbd',
  },
]
