import { useId, useState } from 'react'
import PublicPageContainer from '../components/wireframe/PublicPageContainer'
import '../styles/static.css'
import { FAQ_ITEMS } from '../content/faq'

/**
 * Faq — `/faq`. Task-centered by design: value visibility, forecasts,
 * sources, Lab, bundles, AQI scale (page-specs/about-faq-notfound.md §5).
 * Account/login/payment questions are absent on purpose — AirLens has no
 * accounts and no billing. Faq.test.tsx asserts zero account/payment
 * keywords across the rendered content, so keep new FAQ entries within that
 * constraint (edit src/content/faq.ts, not this component).
 */
export default function Faq() {
  const [openId, setOpenId] = useState<string | null>(null)
  const idPrefix = useId()

  return (
    <PublicPageContainer tier="text" className="static-page">
      <header className="static-page__header">
        <h1 className="h-hero">Frequently asked questions</h1>
        <p className="static-page__thesis t-lede">
          Answers to what you’re trying to do — check a value, understand a forecast, verify a source, use the
          Lab, or open a bundle.
        </p>
      </header>

      <div className="faq-list">
        {FAQ_ITEMS.map((item) => {
          const open = openId === item.id
          const panelId = `${idPrefix}-${item.id}-panel`
          return (
            <div key={item.id} className="faq-item">
              <button
                type="button"
                className="faq-item__trigger"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenId(open ? null : item.id)}
              >
                <span className="h-3" style={{ margin: 0 }}>{item.question}</span>
                <span className="faq-item__icon" aria-hidden="true">{open ? '−' : '+'}</span>
              </button>
              {open ? (
                <div id={panelId} className="faq-item__panel">
                  <p className="t-body">{item.answer}</p>
                  <div className="faq-item__links">
                    {item.links.map((link) => (
                      <a key={link.href} href={link.href}>{link.label}</a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </PublicPageContainer>
  )
}
