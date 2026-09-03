import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import ChatMessageBubble from './ChatMessageBubble'
import type { ChatMessage } from '../../types/chat'

afterEach(() => cleanup())

function assistant(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { role: 'assistant', content: 'PM2.5 is measured in µg/m³.', timestamp: 0, ...overrides }
}

describe('ChatMessageBubble', () => {
  it('renders no DQSS badge on an assistant answer', () => {
    // A document-grounded answer has no data-quality grade — there is no
    // sensor reading behind it to score. The ported bubble hardcoded
    // `dqss="unknown"`, which rendered a "—" pill and announced "DQSS — —
    // Unknown" (role="status", DqssBadge.tsx:66-69) on every single answer:
    // a quality claim about a quantity that does not exist here.
    // Spec: page-specs/ask-assistant.md §11-6.
    // Arrange / Act
    const { container } = render(<ChatMessageBubble message={assistant()} />)
    // Assert
    expect(container.querySelector('.dqss-badge')).toBeNull()
    expect(container.querySelector('[data-dqss]')).toBeNull()
  })

  it('still renders the assistant header and body around the removed badge', () => {
    // Guard against "fixing" the badge by deleting the header with it.
    // Arrange / Act
    const { container, getByText } = render(<ChatMessageBubble message={assistant()} />)
    // Assert
    expect(container.querySelector('.msg-asst-head')).not.toBeNull()
    expect(getByText('Field Assistant')).not.toBeNull()
    expect(getByText('PM2.5 is measured in µg/m³.')).not.toBeNull()
  })

  it('renders citations when the answer carries them', () => {
    // Arrange
    const message = assistant({
      citations: [
        { source_title: 'Methodology', source_url: 'https://example.test/m', relevance: 0.8 },
      ],
    })
    // Act
    const { container } = render(<ChatMessageBubble message={message} />)
    // Assert
    expect(container.querySelectorAll('.msg-cites li, .msg-cites > *').length).toBeGreaterThan(0)
  })

  it('renders a user turn without the assistant chrome', () => {
    // Arrange / Act
    const { container, getByText } = render(
      <ChatMessageBubble message={{ role: 'user', content: 'what is pm2.5?', timestamp: 0 }} />,
    )
    // Assert
    expect(getByText('YOU')).not.toBeNull()
    expect(container.querySelector('.msg-asst-head')).toBeNull()
    expect(container.querySelector('.dqss-badge')).toBeNull()
  })
})
