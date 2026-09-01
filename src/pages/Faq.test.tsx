// FAQ is task-centered by design: account, login, and payment questions
// don't exist because AirLens has no accounts and no billing
// (page-specs/about-faq-notfound.md §2, §9 acceptance test 3). This asserts
// zero matches for that keyword family, both at the content-source level
// (guards future additions to src/content/faq.ts) and after every item is
// expanded in the rendered DOM.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import Faq from './Faq'
import { FAQ_ITEMS } from '../content/faq'

afterEach(cleanup)

// "account" itself is not on this list: item 4 ("Do I need an account?")
// exists specifically to say no, and stripping the word would make that
// answer unreadable. What must never appear is any of the mechanics of an
// actual account system — signing in, registering, a password, or a
// billing relationship — because none of those exist on this site.
const FORBIDDEN = /\b(log ?in|sign ?up|password|subscription|payment|billing|credit card|checkout)\b/i

describe('Faq content', () => {
  it('contains zero account/payment keywords across question, answer, and link labels', () => {
    for (const item of FAQ_ITEMS) {
      const text = [item.question, item.answer, ...item.links.map((l) => l.label)].join(' ')
      expect(text).not.toMatch(FORBIDDEN)
    }
  })

  it('has at least one internal link per item', () => {
    for (const item of FAQ_ITEMS) {
      expect(item.links.length).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('Faq render', () => {
  it('renders zero account/payment keywords once every item is expanded', () => {
    const { container } = render(<Faq />)
    const triggers = screen.getAllByRole('button')
    for (const trigger of triggers) {
      fireEvent.click(trigger)
    }
    expect(container.textContent).not.toMatch(FORBIDDEN)
  })
})
