import AirLensMark from '../components/AirLensMark'
import { LEGAL_DOCS } from '../content/legal'
import { NAV_GROUPS, navGroupItems } from './nav'

/**
 * SiteFooter — global site footer (PR-N2). Renders on every `chrome: 'site'`
 * route (SiteChrome.tsx); absent on `'overlay'` (/globe — a 100vh immersive
 * stage with no scroll-to-footer) and `'bare'` (/landing, /design, /probe).
 *
 * Columns are derived from `NAV_GROUPS` (nav.ts) rather than hand-authored —
 * this is what keeps `NAV_ORPHAN_EXCEPTIONS` honest: `/about`, `/faq`, and
 * every `/legal/:doc` id are deliberately absent from GlobalNav because this
 * component is their coverage (see nav.test.ts's orphan check and
 * SiteFooter.test.tsx's matching link-existence test).
 *
 * The mockup's footer draft (§02) shows illustrative column content (e.g. a
 * "Countries" link under Map) that doesn't correspond to a real route — this
 * renders only real hrefs from `NAV_GROUPS`/`LEGAL_DOCS`, not the mockup's
 * placeholder copy, so the footer never links to a page that doesn't exist.
 */
export default function SiteFooter() {
  const year = new Date().getFullYear()
  const legalDocs = [...LEGAL_DOCS].sort((a, b) => a.order - b.order)

  return (
    <footer className="chrome-footer">
      <div className="chrome-footer__grid">
        <div className="chrome-footer__col chrome-footer__col--brand">
          <a className="chrome-footer__logo" href="/" aria-label="AirLens home">
            <AirLensMark size={22} />
            <span className="chrome-footer__wordmark">AirLens</span>
          </a>
          <p className="chrome-footer__tagline">
            Satellite and ground observation, fused — every estimate ships with its uncertainty.
          </p>
          <p className="chrome-footer__feed">
            <span className="chrome-footer__feed-dot" aria-hidden="true" />
            LIVE FEED · HF DATASET
          </p>
        </div>

        {NAV_GROUPS.map((group) =>
          group.items.length === 0 ? (
            // Zero-item group (Map): its single destination is the group's
            // own href, so the column header doubles as the only link
            // instead of repeating a redundant "Overview" row underneath.
            // A heading-only column reads as broken next to five populated
            // ones (mostly blank below the heading), so a short descriptive
            // line fills that space — real copy, not a placeholder link.
            <div key={group.key} className="chrome-footer__col">
              <h4 className="chrome-footer__heading">
                <a href={group.href}>{group.label}</a>
              </h4>
              <p className="chrome-footer__tagline">
                Station and satellite PM2.5 readings on an interactive globe.
              </p>
            </div>
          ) : (
            <div key={group.key} className="chrome-footer__col">
              <h4 className="chrome-footer__heading">{group.label}</h4>
              <ul className="chrome-footer__links">
                {navGroupItems(group).map((item) => (
                  <li key={item.href}>
                    <a href={item.href}>
                      {item.label}
                      {item.beta && <span className="chrome-nav__beta">Beta</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>

      <div className="chrome-footer__base">
        <span className="chrome-footer__copyright">
          © {year} AirLens · <a href="/about">About</a> · <a href="/faq">FAQ</a>
        </span>
        <span className="chrome-footer__legal">
          {legalDocs.map((doc, index) => (
            <span key={doc.id}>
              {index > 0 && ' · '}
              <a href={`/legal/${doc.id}`}>{doc.title}</a>
            </span>
          ))}
        </span>
      </div>
    </footer>
  )
}
