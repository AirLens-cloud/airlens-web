/**
 * faq.ts — the 6 `/faq` items (Faq.tsx).
 *
 * Task-centered by design (page-specs/about-faq-notfound.md §5.1): value
 * visibility, forecasts, sources, Lab, bundles, AQI scale. Account, login,
 * and payment questions do not exist in this list on purpose — AirLens has
 * no accounts and no billing (see about-faq-notfound.md §2 "비협상 원칙").
 * Faq.test.tsx asserts zero account/payment keyword matches across this
 * file's rendered text — keep new entries within that constraint.
 */

export interface FaqLink {
  label: string
  href: string
}

export interface FaqItem {
  id: string
  question: string
  answer: string
  links: FaqLink[]
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'value-not-showing',
    question: 'Why is this value not showing right now?',
    answer:
      'A value can be withheld when AirLens does not have enough confidence to show it, or marked stale when the last known reading is older than expected. Both are shown honestly, with the reason and the last-known time where available, instead of being hidden or guessed.',
    links: [
      { label: 'Glossary: withheld', href: '/glossary#withheld' },
      { label: 'Glossary: stale', href: '/glossary#stale' },
    ],
  },
  {
    id: 'forecast-source',
    question: 'How are the forecast numbers made?',
    answer:
      'Forecasts come from a verified batch model run, not a live API call made on the spot. Every forecast value is a "forecast"-nature estimate and ships with an uncertainty range rather than a single confident-looking number.',
    links: [
      { label: 'Methodology', href: '/methodology#forecast' },
      { label: 'Model Card', href: '/legal/model-card' },
    ],
  },
  {
    id: 'data-origin',
    question: 'Where does this data come from?',
    answer:
      'AirLens combines four public sources: OpenAQ and Sensor.Community for ground measurements, Open-Meteo for weather, and NASA satellite products for wide-area coverage. Each source carries its own coverage and quality tier.',
    links: [{ label: 'Data Sources', href: '/data-sources' }],
  },
  {
    id: 'what-is-lab',
    question: 'What is the Lab? Do I need an account?',
    answer:
      'The Lab is a workspace for querying and analyzing the same data you see on the map — no account is needed. What you build there is saved in your browser and is not sent to an AirLens server as part of normal use.',
    links: [{ label: 'Lab', href: '/lab' }],
  },
  {
    id: 'open-bundle',
    question: 'How do I open a `.airlens` bundle?',
    answer:
      'A bundle is a downloadable analysis package — a manifest plus figures and code — that you can import directly into the Lab to reproduce or continue an analysis.',
    links: [{ label: 'Lab', href: '/lab' }],
  },
  {
    id: 'aqi-scale',
    question: 'What AQI scale does AirLens use?',
    answer:
      'AirLens uses EPA breakpoint-based AQI tiers. One AirLens-specific threshold used in a couple of surfaces is not drawn from a published standard, and this site says so directly rather than presenting it as an official cutoff.',
    links: [{ label: 'Glossary: AQI', href: '/glossary#aqi' }],
  },
]
