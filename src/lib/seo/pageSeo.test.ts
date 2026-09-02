// Ported from AirLens-platform apps/web `src/lib/seo/pageSeo.test.ts` (Wave 1,
// plan airlens-airlens-web-2-curious-chipmunk). Dropped: the `withLocale` /
// `/ko`-tree describe block and every per-language (`lang` arg) test case —
// this repo has no `/ko` routes, so `pageSeo.ts` here is English-only and
// takes no `lang` parameter at all.
import { describe, it, expect } from 'vitest'
import { escapeHtml, ldScriptJson, newsArticleJsonLd, type ArticleSeoInput } from './jsonld'
import {
  articlePageSeo,
  blogListPageSeo,
  countryPageSeo,
  dispatchListPageSeo,
  todayPageSeo,
  insightsPageSeo,
  shouldIndexArticle,
  type CountryRegistry,
  type CountryImpact,
} from './pageSeo'
import { POLICY_IMPACT_BASE } from '../config/dataSources'

const ARTICLE: ArticleSeoInput = {
  slug: 'seoul-pm25-falls',
  title: 'Seoul PM2.5 falls 18% after diesel ban',
  summary: 'raw rss description',
  summary_en: 'Seoul reported PM2.5 dropped to 21 µg/m³ in March, an 18% year-on-year fall linked to a downtown diesel ban.',
  summary_ko: '서울시는 3월 PM2.5가 21 µg/m³로 전년 대비 18% 낮아졌다고 밝혔다.',
  source_name: 'Korea Herald',
  source_url: 'https://koreaherald.com',
  article_url: 'https://koreaherald.com/view/123',
  image_url: 'https://x.supabase.co/img/a.jpg',
  published_at: '2026-03-10T00:00:00Z',
  country_code: 'kr',
}

describe('escapeHtml / ldScriptJson', () => {
  it('escapes HTML-significant chars', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  })
  it('neutralizes </script> breakout in ld+json', () => {
    const json = ldScriptJson({ x: '</script><script>alert(1)' })
    expect(json).not.toContain('</script>')
    expect(json).toContain('\\u003c')
  })
})

describe('newsArticleJsonLd', () => {
  it('emits NewsArticle with honest source attribution', () => {
    const ld = newsArticleJsonLd(ARTICLE, 'https://airlens.cloud/news/seoul-pm25-falls', 'desc')
    const obj = JSON.parse(ld)
    expect(obj['@type']).toBe('NewsArticle')
    expect(obj.headline).toBe(ARTICLE.title)
    expect(obj.isBasedOn).toBe(ARTICLE.article_url) // credits the original, not authored
    expect(obj.sourceOrganization.name).toBe('Korea Herald')
    expect(obj.publisher.name).toBe('AirLens')
    expect(obj.datePublished).toBe(ARTICLE.published_at)
  })
})

describe('articlePageSeo', () => {
  it('builds title, description and indexable robots when a summary exists', () => {
    const seo = articlePageSeo(ARTICLE, 'seoul-pm25-falls')
    expect(seo.title).toContain('Seoul PM2.5 falls 18%')
    expect(seo.title).toContain('AirLens')
    expect(seo.canonicalUrl).toBe('https://airlens.cloud/news/seoul-pm25-falls')
    expect(seo.robots).toBe('index, follow')
    expect(seo.ogType).toBe('article')
    expect(seo.ogImage).toBe(ARTICLE.image_url)
    expect(seo.jsonLd.join(' ')).toContain('NewsArticle')
    expect(seo.jsonLd.join(' ')).toContain('BreadcrumbList')
  })

  it('crawler body carries the title, AirLens summary, country cross-link and source link', () => {
    const seo = articlePageSeo(ARTICLE, 'seoul-pm25-falls')
    expect(seo.bodyHtml).toContain('AirLens summary')
    expect(seo.bodyHtml).toContain('Seoul reported PM2.5 dropped') // summary_en preferred
    expect(seo.bodyHtml).toContain('/country/KR') // differentiation cross-link, uppercased
    expect(seo.bodyHtml).toContain('koreaherald.com/view/123')
    expect(seo.bodyHtml).toContain('/dispatch')
  })

  it('falls back to summary_ko when summary_en is missing (never blank)', () => {
    const koOnly: ArticleSeoInput = { ...ARTICLE, summary_en: null }
    expect(articlePageSeo(koOnly, 'x').bodyHtml).toContain('서울시는 3월 PM2.5')
  })

  it('honesty gate: noindex when no summary at all (content-pending)', () => {
    const pending: ArticleSeoInput = { ...ARTICLE, summary: null, summary_en: null, summary_ko: null }
    expect(shouldIndexArticle(pending)).toBe(false)
    expect(articlePageSeo(pending, 'x').robots).toBe('noindex, follow')
  })

  it('differentiation gate: noindex when summary exists but no AirLens anchor (pure restatement)', () => {
    // A faithful summary alone is still "restatement of other sources" (Google
    // scaled-content) — without a country/policy anchor it stays noindex.
    const bare: ArticleSeoInput = { ...ARTICLE, country_code: null, related_policy_id: null }
    expect(shouldIndexArticle(bare)).toBe(false)
    expect(articlePageSeo(bare, 'x').robots).toBe('noindex, follow')
  })

  it('differentiation gate: index when summary + related_policy_id anchor (no country_code)', () => {
    const policyAnchored: ArticleSeoInput = { ...ARTICLE, country_code: null, related_policy_id: 'pol-1' }
    expect(shouldIndexArticle(policyAnchored)).toBe(true)
    expect(articlePageSeo(policyAnchored, 'x').robots).toBe('index, follow')
  })

  it('escapes a malicious title in the crawler body', () => {
    const evil: ArticleSeoInput = { ...ARTICLE, title: '<img src=x onerror=alert(1)>' }
    const seo = articlePageSeo(evil, 'x')
    expect(seo.bodyHtml).not.toContain('<img src=x')
    expect(seo.bodyHtml).toContain('&lt;img')
  })

  it('first-party block: inlines a reliable SDID effect + observed PM2.5 trend', () => {
    const impact: CountryImpact = {
      att: -3.2,
      ci_95: [-5.1, -1.3],
      p_value: 0.01,
      significant: true,
      synthetic_control: [
        { date: '2012', pm25: 30 },
        { date: '2020', pm25: 21 },
      ],
    }
    const seo = articlePageSeo(ARTICLE, 'seoul-pm25-falls', { impact })
    expect(seo.bodyHtml).toContain('-3.2 µg/m³') // AirLens's own number, inline
    expect(seo.bodyHtml).toContain('95% CI -5.1 to -1.3')
    expect(seo.bodyHtml).toContain('30→21') // observed PM2.5 trend, first→last
    expect(seo.bodyHtml).toContain('/country/KR')
  })

  it('first-party block: Glass-box withholds the number for an inconclusive country (no fabrication)', () => {
    const gated: CountryImpact = { att: null, significant: false, synthetic_control: [] }
    const seo = articlePageSeo(ARTICLE, 'x', { impact: gated })
    // No fabricated effect headline / trend (the summary itself may mention µg/m³).
    expect(seo.bodyHtml).not.toContain('SDID-estimated annual PM2.5 change')
    expect(seo.bodyHtml).not.toContain('AirLens-tracked PM2.5')
    expect(seo.bodyHtml).toContain('/country/KR') // still the differentiation anchor
  })

  it('first-party block: skips an implausible magnitude (|att|>30 → unstable, withheld)', () => {
    const unstable: CountryImpact = { att: 70.2, ci_95: [10, 130], p_value: 0, significant: false }
    const seo = articlePageSeo(ARTICLE, 'x', { impact: unstable })
    expect(seo.bodyHtml).not.toContain('70.2 µg/m³') // |att|>30 → unstable → withheld
  })

  it('NewsArticle JSON-LD links the story to a COMPLETE country policy dataset (about)', () => {
    const ld = newsArticleJsonLd(ARTICLE, 'https://airlens.cloud/news/seoul-pm25-falls', 'desc')
    const obj = JSON.parse(ld)
    expect(obj.about['@type']).toBe('Dataset')
    expect(obj.about.url).toBe('https://airlens.cloud/country/KR')
    // A nested Dataset must be self-described — name+url alone is invalid.
    expect(obj.about.name).toBeTruthy()
    expect(typeof obj.about.description).toBe('string')
    expect(obj.about.description.length).toBeGreaterThan(0)
    expect(obj.about.creator.name).toBe('AirLens')
    expect(obj.about.license).toBe('https://airlens.cloud/legal/terms')
  })

  it('NewsArticle JSON-LD drops a non-http(s) source URL (scheme whitelist)', () => {
    const evil: ArticleSeoInput = { ...ARTICLE, article_url: 'javascript:alert(1)', source_url: null }
    const obj = JSON.parse(newsArticleJsonLd(evil, 'https://airlens.cloud/news/x', 'desc'))
    expect(obj.isBasedOn).toBeUndefined()
  })
})

describe('countryPageSeo', () => {
  const REG: CountryRegistry = {
    countryCode: 'KR',
    countryName: 'South Korea',
    flag: '🇰🇷',
    totalPolicies: 2,
    policies: [
      { name: 'Seasonal Fine Dust Management', type: 'standard', adoptedDate: '2019-01-01', pollutants: ['PM2.5'] },
      { name: 'Clean Air Conservation Act', type: 'act', adoptedDate: '1990-08-01' },
    ],
    standards: [{ name: 'Seasonal Fine Dust Management', type: 'standard', adoptedDate: '2019-01-01' }],
  }

  it('builds an indexable country hub with Dataset + breadcrumb JSON-LD', () => {
    const seo = countryPageSeo(REG, null)
    expect(seo.title).toContain('South Korea')
    expect(seo.canonicalUrl).toBe('https://airlens.cloud/country/KR')
    expect(seo.robots).toBe('index, follow')
    expect(seo.jsonLd.join(' ')).toContain('Dataset')
    expect(seo.jsonLd.join(' ')).toContain('BreadcrumbList')
    expect(seo.bodyHtml).toContain('Seasonal Fine Dust Management')
    expect(seo.bodyHtml).toContain('/insights?country=KR')
  })

  it('honestly renders no policy list when the registry carries none (this repo has no per-policy feed)', () => {
    const bare: CountryRegistry = { countryCode: 'KR', countryName: 'South Korea', totalPolicies: 0, policies: [] }
    const seo = countryPageSeo(bare, null)
    expect(seo.bodyHtml).not.toContain('tracked policies')
  })

  it('Glass-box: shows disclaimer (not a number) when effect is inconclusive', () => {
    const seo = countryPageSeo(REG, { att: null, significant: false, data_quality: { disclaimer: 'no clean controls' } })
    expect(seo.bodyHtml).toContain('not yet conclusive')
    expect(seo.bodyHtml).toContain('no clean controls')
  })

  it('Glass-box: shows the SDID estimate with CI when significant', () => {
    const impact: CountryImpact = { att: -3.2, ci_95: [-5.1, -1.3], p_value: 0.01, significant: true }
    const seo = countryPageSeo(REG, impact)
    expect(seo.bodyHtml).toContain('-3.2 µg/m³')
    expect(seo.bodyHtml).toContain('95% CI -5.1 to -1.3')
  })

  const META_IMPACT: CountryImpact = {
    att: 0.522,
    ci_95: [0.1, 0.94],
    p_value: 0.0146,
    significant: true,
    method: 'sdid',
    treatment_year: 2015,
    se: 0.21,
    robustness: { parallel_trend: { p_value: 0.4, pass: true }, placebo: { mean: 0.1, pass: true } },
    data_quality: { dqss_score: 72, station_count: 40, coverage_years: 12, data_source: 'merged' },
    generated_at: '2026-06-20T07:43:12Z',
  }

  it('E-E-A-T: renders a methodology block with technique + robustness tests', () => {
    const seo = countryPageSeo(REG, META_IMPACT)
    expect(seo.bodyHtml).toContain('Methodology')
    expect(seo.bodyHtml).toContain('Synthetic Difference-in-Differences (SDID)')
    expect(seo.bodyHtml).toContain('Treatment year: 2015')
    expect(seo.bodyHtml).toContain('Parallel-trend test: pass')
    expect(seo.bodyHtml).toContain('Placebo test: pass')
    expect(seo.bodyHtml).toContain('/methodology')
  })

  it('E-E-A-T: renders a citable reference line with generation date', () => {
    const seo = countryPageSeo(REG, META_IMPACT)
    expect(seo.bodyHtml).toContain('Citation')
    expect(seo.bodyHtml).toContain('AirLens (2026). South Korea clean-air policy impact (SDID).')
    expect(seo.bodyHtml).toContain('https://airlens.cloud/country/KR')
  })

  it('Dataset JSON-LD is enriched (variableMeasured / technique / distribution)', () => {
    const ld = countryPageSeo(REG, META_IMPACT).jsonLd.join(' ')
    expect(ld).toContain('variableMeasured')
    expect(ld).toContain('Synthetic Difference-in-Differences')
    expect(ld).toContain('DataDownload')
    expect(ld).toContain('dateModified')
    expect(ld).toContain('https://airlens.cloud/legal/terms')
    expect(ld).toContain('"creator"')
  })

  // Code review finding (Wave 1 SSR port): `distribution.contentUrl` once
  // pointed at `${CANONICAL_ORIGIN}/data/policy-impact/KR.json` — a static
  // path this repo never publishes, so the link always 404s. It must be the
  // real, live HF URL — the same one `functions/_lib/data.ts` and
  // `src/api/policy.ts` actually fetch from — not a guessed same-origin path.
  it('Dataset JSON-LD distribution.contentUrl is the real, fetchable HF policy-impact URL (not a 404 static path)', () => {
    const ld = countryPageSeo(REG, META_IMPACT).jsonLd.join(' ')
    expect(ld).toContain(`"contentUrl":"${POLICY_IMPACT_BASE}/KR.json"`)
    expect(ld).not.toContain('/data/policy-impact/')
  })

  it('honesty: methodology still renders for a gated country, but the effect stays a disclaimer', () => {
    const gated: CountryImpact = {
      att: null,
      significant: false,
      method: 'sdid',
      treatment_year: 2018,
      data_quality: { disclaimer: 'pre-fit too poor', dqss_score: 0, data_source: 'sample' },
      generated_at: '2026-06-20T00:00:00Z',
    }
    const seo = countryPageSeo(REG, gated)
    expect(seo.bodyHtml).toContain('not yet conclusive') // effect withheld
    expect(seo.bodyHtml).toContain('Methodology') // but the method is still disclosed
    expect(seo.bodyHtml).toContain('Synthetic Difference-in-Differences (SDID)')
  })
})

describe('blogListPageSeo / dispatchListPageSeo (list SSR)', () => {
  it('renders blog list items with escaped titles and per-post links', () => {
    // Arrange
    const rows = [
      { slug: 'clean-air-act', title_en: 'Clean Air <Act>', dek_en: 'A & B', author: 'Desk', published_at: '2026-07-01T00:00:00Z' },
      { slug: 'second', title_en: 'Second', title_ko: '두 번째' },
    ]
    // Act
    const seo = blogListPageSeo(rows)
    // Assert
    expect(seo.canonicalUrl).toBe('https://airlens.cloud/blog')
    expect(seo.robots).toBe('index, follow')
    expect(seo.bodyHtml).toContain('href="/blog/clean-air-act"')
    expect(seo.bodyHtml).toContain('Clean Air &lt;Act&gt;') // escaped
    expect(seo.bodyHtml).toContain('두 번째') // ko-first title resolution
    expect(seo.jsonLd.some((ld) => ld.includes('"CollectionPage"'))).toBe(true)
  })

  it('noindexes an empty blog list (thin shell)', () => {
    // Arrange + Act
    const seo = blogListPageSeo([])
    // Assert
    expect(seo.robots).toBe('noindex, follow')
  })

  it('dispatch list never emits links for slug-less legacy rows', () => {
    // Arrange
    const rows = [
      { slug: 'real-article', title: 'Real', summary_en: 'sum', source_name: 'Reuters', published_at: '2026-07-01' },
      { slug: null, title: 'Legacy pre-slug row' },
    ]
    // Act
    const seo = dispatchListPageSeo(rows)
    // Assert
    expect(seo.bodyHtml).toContain('href="/news/real-article"')
    expect(seo.bodyHtml).not.toContain('Legacy pre-slug row')
    expect(seo.canonicalUrl).toBe('https://airlens.cloud/dispatch')
    expect(seo.jsonLd.some((ld) => ld.includes('"ItemList"'))).toBe(true)
  })

  it('per-row summary prefers summary_en, falling back to summary_ko', () => {
    // Arrange
    const rows = [
      { slug: 'a', title: 'A', summary_en: 'english digest', summary_ko: '한국어 요약', published_at: '2026-07-01' },
      { slug: 'b', title: 'B', summary_ko: '두번째 요약', published_at: '2026-07-02' },
    ]
    // Act
    const seo = dispatchListPageSeo(rows)
    // Assert
    expect(seo.description).toContain('Air-quality reporting')
    expect(seo.bodyHtml).toContain('english digest')
    expect(seo.bodyHtml).toContain('두번째 요약') // falls back when summary_en is absent
  })
})

describe('todayPageSeo (deterministic SSR)', () => {
  it('indexes with FAQPage JSON-LD and no fabricated readings', () => {
    const seo = todayPageSeo()
    expect(seo.robots).toBe('index, follow')
    expect(seo.canonicalUrl).toBe('https://airlens.cloud/today')
    expect(seo.jsonLd.some((s) => s.includes('"FAQPage"'))).toBe(true)
    expect(seo.jsonLd.some((s) => s.includes('"BreadcrumbList"'))).toBe(true)
    // Crawler copy explains the instrument — it never carries a live number.
    expect(seo.bodyHtml).toContain('p10-p90')
    expect(seo.bodyHtml).toContain('DQSS')
  })
})

describe('insightsPageSeo (deterministic SSR)', () => {
  it('indexes with methodology FAQPage JSON-LD and no fabricated results', () => {
    const seo = insightsPageSeo()
    expect(seo.robots).toBe('index, follow')
    expect(seo.canonicalUrl).toBe('https://airlens.cloud/insights')
    expect(seo.jsonLd.some((s) => s.includes('"FAQPage"'))).toBe(true)
    expect(seo.jsonLd.some((s) => s.includes('"BreadcrumbList"'))).toBe(true)
    // Crawler copy explains the method — ATT/CI/DQSS vocabulary, never a result.
    expect(seo.bodyHtml).toContain('ATT')
    expect(seo.bodyHtml).toContain('95% confidence interval')
    expect(seo.bodyHtml).toContain('DQSS')
  })
})
