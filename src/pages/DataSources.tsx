/**
 * DataSources — /data-sources. Live Feed Registry (Wave B-5).
 *
 * The spec (`datasources-live-feed-registry.md`) asks for a published
 * `source_registry` artifact this app does not have yet — the producer is a
 * B1-gated dependency the spec itself marks `[미확인]`/`부재` throughout.
 * Rather than block on that or fabricate the artifact, this page renders a
 * registry derived live from the feeds already fetched elsewhere in this app
 * (`api/registry.ts`) — every row's status/coverage/last-success comes from
 * an actual poll run when the page loads, not a code constant.
 *
 * Self-freshness: the header states when THIS page's own poll last
 * completed ("registry fetched Xm ago") — the spec's "자기 신선도 원칙", since
 * this page is itself a trust surface and must not hide its own staleness.
 */
import { useEffect, useState } from 'react'
import { fetchFeedRegistry, type FeedRegistry, type FeedRegistryEntry, type FeedStatus } from '../api/registry'
import SourceStatusDot from '../components/catalog/SourceStatusDot'
import WfPlaceholder from '../components/wireframe/WfPlaceholder'
import '../styles/catalog.css'

const POLL_MS = 5 * 60 * 1000
const TICK_MS = 30 * 1000

type PageStatus = 'loading' | 'ready' | 'error'

function minutesAgo(iso: string, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60_000))
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 minute ago'
  return `${mins} minutes ago`
}

function readHashId(): string | null {
  if (typeof window === 'undefined') return null
  const h = window.location.hash.replace(/^#/, '')
  return h || null
}

const STATUS_FILTERS: readonly (FeedStatus | 'all')[] = ['all', 'ready', 'stale', 'unavailable']

export default function DataSources() {
  const [status, setStatus] = useState<PageStatus>('loading')
  const [registry, setRegistry] = useState<FeedRegistry | null>(null)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [expanded, setExpanded] = useState<string | null>(() => readHashId())
  const [filter, setFilter] = useState<FeedStatus | 'all'>('all')

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const next = await fetchFeedRegistry()
        if (cancelled) return
        setRegistry(next)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus((s) => (s === 'ready' ? s : 'error'))
      }
    }
    void poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  function toggleRow(id: string): void {
    const next = expanded === id ? null : id
    setExpanded(next)
    if (typeof window === 'undefined') return
    const url = next ? `${window.location.pathname}${window.location.search}#${next}` : `${window.location.pathname}${window.location.search}`
    window.history.replaceState({}, '', url)
  }

  if (status === 'loading') {
    return (
      <main className="cat-page">
        <div className="cat-shell">
          <WfPlaceholder height={220} label="Loading the feed registry…" />
        </div>
      </main>
    )
  }

  if (status === 'error' || !registry) {
    return (
      <main className="cat-page">
        <div className="cat-shell">
          <h1 className="cat-title">Data Sources</h1>
          <p className="cat-error">
            The feed registry could not be checked. This is a failure to poll it, not a
            statement that no feeds exist — nothing is being substituted in its place.
          </p>
        </div>
      </main>
    )
  }

  const rows = registry.feeds.filter((f) => filter === 'all' || f.status === filter)
  const registryAge = minutesAgo(registry.checkedAt, nowMs)
  const anyUnavailable = registry.feeds.some((f) => f.status === 'unavailable')

  return (
    <main className="cat-page">
      <div className="cat-shell">
        <header className="cat-header">
          <div>
            <h1 className="cat-title">Where every number comes from</h1>
            <p className="cat-subtitle">
              The live feeds this app reads from, checked directly — not a status page
              someone remembered to update.
            </p>
          </div>
          <span className="m cat-freshness num" data-testid="registry-freshness">
            REGISTRY FETCHED {registryAge.toUpperCase()}
          </span>
        </header>

        <nav className="cat-filters" aria-label="Filter by status">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`cat-filter-btn${filter === f ? ' cat-filter-btn--active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </nav>

        {anyUnavailable ? (
          <p className="cat-note" role="status">
            One or more feeds did not respond to this poll. Rows below show each feed's
            own last confirmed state, not a page-wide failure.
          </p>
        ) : null}

        <div className="cat-table-wrap">
          <table className="cat-table" data-testid="feed-registry-table">
            <thead>
              <tr>
                <th scope="col">Feed</th>
                <th scope="col">Provider</th>
                <th scope="col">Tier</th>
                <th scope="col">Status</th>
                <th scope="col">License</th>
                <th scope="col">Cadence</th>
                <th scope="col">Last success</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((feed) => (
                <FeedRow
                  key={feed.id}
                  feed={feed}
                  expanded={expanded === feed.id}
                  onToggle={() => toggleRow(feed.id)}
                />
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="cat-note">No feed matches this filter.</p>
          ) : null}
        </div>
      </div>
    </main>
  )
}

function FeedRow({
  feed,
  expanded,
  onToggle,
}: {
  feed: FeedRegistryEntry
  expanded: boolean
  onToggle: () => void
}) {
  const summary = `${feed.provider}, ${feed.tier}, ${feed.status}${
    feed.lastSuccess ? `, updated ${feed.lastSuccess}` : ', no confirmed update'
  }, ${feed.license}.`
  return (
    <>
      <tr
        id={feed.id}
        className="cat-row"
        onClick={onToggle}
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onToggle()
        }}
      >
        <td>
          <span className="a11y-only">{summary}</span>
          <span aria-hidden="true">{feed.label}</span>
        </td>
        <td aria-hidden="true">{feed.provider}</td>
        <td aria-hidden="true">{feed.tier}</td>
        <td aria-hidden="true">
          <SourceStatusDot status={feed.status} />
        </td>
        <td aria-hidden="true">{feed.license}</td>
        <td className="num" aria-hidden="true">{feed.cadence}</td>
        <td className="num" aria-hidden="true">{feed.lastSuccess ?? '—'}</td>
      </tr>
      {expanded ? (
        <tr className="cat-detail-row">
          <td colSpan={7}>
            <dl className="cat-detail">
              <div>
                <dt className="m">COVERAGE</dt>
                <dd>{feed.coverage}</dd>
              </div>
              <div>
                <dt className="m">ATTRIBUTION</dt>
                <dd>{feed.provider}</dd>
              </div>
              {feed.note ? (
                <div>
                  <dt className="m">NOTE</dt>
                  <dd>{feed.note}</dd>
                </div>
              ) : null}
            </dl>
          </td>
        </tr>
      ) : null}
    </>
  )
}
