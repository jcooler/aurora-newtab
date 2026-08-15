// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
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
    expect(anchor?.getAttribute('target')).toBeNull()
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
})
