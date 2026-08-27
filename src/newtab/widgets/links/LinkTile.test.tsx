// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import LinkTile from './LinkTile'

vi.mock('./linksLogic', () => ({ faviconUrl: (url: string) => `favicon:${url}` }))

describe('LinkTile navigation', () => {
  it('renders the Quick Link as a current-tab anchor', () => {
    const { container } = render(
      <LinkTile
        link={{ id: 'link-1', title: 'Destination', url: 'https://example.test/path' }}
        index={0}
        count={1}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onDragStart={vi.fn()}
        onDropOn={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    )
    const anchor = container.querySelector('a')
    expect(anchor?.getAttribute('href')).toBe('https://example.test/path')
    expect(anchor?.getAttribute('aria-label')).toBe('Destination')
    expect(anchor?.getAttribute('target')).toBeNull()
    expect(anchor?.dataset.quickLinkPresentation).toBe('free')
    for (const token of ['rounded-panel', 'border', 'bg-panel-solid', 'shadow-lg', 'backdrop-blur-[var(--panel-blur)]']) {
      expect(anchor?.classList.contains(token)).toBe(false)
    }
  })

  it('renders no anchor or favicon for an unsafe legacy stored URL', () => {
    const { container } = render(
      <LinkTile
        link={{ id: 'link-unsafe', title: 'Unsafe', url: 'javascript:payload@example.com' }}
        index={0}
        count={1}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onDragStart={vi.fn()}
        onDropOn={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    )
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('uses a meaningful path label as readable Standard stack destination copy', () => {
    render(
      <LinkTile
        link={{ id: 'mail', title: 'Mail', url: 'https://mail.example.com/inbox' }}
        index={0}
        count={1}
        canvasSize="standard"
        presentation="stack"
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onDragStart={vi.fn()}
        onDropOn={vi.fn()}
        onDragEnd={vi.fn()}
      />,
    )
    expect(screen.getByText('inbox')).toBeTruthy()
    expect(screen.queryByText('mail.example.com')).toBeNull()
  })

  it.each(['https:example.com', 'https:/example.com'])(
    'renders nothing for malformed stored HTTP(S) URL %s',
    (url) => {
      const { container } = render(
        <LinkTile
          link={{ id: 'link-malformed', title: 'Malformed', url }}
          index={0}
          count={1}
          onMove={vi.fn()}
          onRemove={vi.fn()}
          onDragStart={vi.fn()}
          onDropOn={vi.fn()}
          onDragEnd={vi.fn()}
        />,
      )
      expect(container.innerHTML).toBe('')
    },
  )
})
