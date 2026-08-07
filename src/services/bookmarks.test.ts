import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  toBarModel,
  hasBookmarksPermission,
  ensureBookmarksPermission,
  type ChromeBookmarkNode,
} from './bookmarks'

// chrome.bookmarks.getTree() always resolves to a single-element array: the
// root node ('0'), whose children are the top-level folders (Bookmarks bar,
// Other bookmarks, Mobile bookmarks, ...).
function root(children: ChromeBookmarkNode[]): ChromeBookmarkNode[] {
  return [{ id: '0', title: '', children }]
}

describe('toBarModel', () => {
  it("splits the bookmarks-bar node's direct children into folders and loose bookmarks", () => {
    const tree = root([
      {
        id: '1',
        title: 'Bookmarks bar',
        folderType: 'bookmarks-bar',
        children: [
          { id: '10', title: 'Work', children: [] },
          { id: '11', title: 'GitHub', url: 'https://github.com' },
        ],
      },
    ])
    expect(toBarModel(tree)).toEqual({
      folders: [{ id: '10', title: 'Work', items: [], folders: [] }],
      loose: [{ id: '11', title: 'GitHub', url: 'https://github.com' }],
    })
  })

  it('maps nested subfolders recursively', () => {
    const tree = root([
      {
        id: '1',
        title: 'Bookmarks bar',
        folderType: 'bookmarks-bar',
        children: [
          {
            id: '10',
            title: 'Work',
            children: [
              { id: '11', title: 'Repo', url: 'https://repo.example' },
              {
                id: '12',
                title: 'Archive',
                children: [{ id: '13', title: 'Old', url: 'https://old.example' }],
              },
            ],
          },
        ],
      },
    ])
    expect(toBarModel(tree)).toEqual({
      folders: [
        {
          id: '10',
          title: 'Work',
          items: [{ id: '11', title: 'Repo', url: 'https://repo.example' }],
          folders: [
            {
              id: '12',
              title: 'Archive',
              items: [{ id: '13', title: 'Old', url: 'https://old.example' }],
              folders: [],
            },
          ],
        },
      ],
      loose: [],
    })
  })

  it('defaults an untitled folder\'s name to "Folder" (nested too)', () => {
    const tree = root([
      {
        id: '1',
        title: 'Bookmarks bar',
        folderType: 'bookmarks-bar',
        children: [
          { id: '10', title: '', children: [{ id: '11', title: '', children: [] }] },
        ],
      },
    ])
    const model = toBarModel(tree)
    expect(model.folders[0]?.title).toBe('Folder')
    expect(model.folders[0]?.folders[0]?.title).toBe('Folder')
  })

  // Folders have had an untitled fallback since the start (above); bookmarks
  // did not, and Chrome lets you save one with an empty title. That used to
  // be merely a blank label in a chip; since the compact pass it is a chip
  // with NO name at all — a nameless circle, unreadable and unhoverable,
  // with nothing for the `title` attribute or the accessible name to carry.
  // The host is the one thing a bookmark always has.
  it('falls back to a bookmark\'s hostname when Chrome hands us an empty title', () => {
    const tree = root([
      {
        id: '1',
        title: 'Bookmarks bar',
        folderType: 'bookmarks-bar',
        children: [
          { id: '10', title: '', url: 'https://www.example.com/deep/path?q=1' },
          { id: '11', title: '   ', url: 'https://news.ycombinator.com/' },
          // Not a URL the URL parser can take a host from — the raw string
          // is still better than nothing.
          { id: '12', title: '', url: 'javascript:void(0)' },
          // A real title is never second-guessed, whitespace and all.
          { id: '13', title: ' Spaced ', url: 'https://spaced.example/' },
        ],
      },
    ])
    const model = toBarModel(tree)
    // `www.` is noise on a chip this small — every host has it or doesn't.
    expect(model.loose[0]?.title).toBe('example.com')
    expect(model.loose[1]?.title).toBe('news.ycombinator.com')
    expect(model.loose[2]?.title).toBe('javascript:void(0)')
    expect(model.loose[3]?.title).toBe(' Spaced ')
  })

  it('an empty bookmarks bar produces empty folders/loose arrays', () => {
    const tree = root([
      { id: '1', title: 'Bookmarks bar', folderType: 'bookmarks-bar', children: [] },
    ])
    expect(toBarModel(tree)).toEqual({ folders: [], loose: [] })
  })

  it('falls back to id "1" when no top-level child has folderType "bookmarks-bar"', () => {
    const tree = root([
      {
        id: '1',
        title: 'Bookmarks bar',
        children: [{ id: '20', title: 'X', url: 'https://x.example' }],
      },
      {
        id: '2',
        title: 'Other bookmarks',
        children: [{ id: '21', title: 'Y', url: 'https://y.example' }],
      },
    ])
    expect(toBarModel(tree).loose).toEqual([{ id: '20', title: 'X', url: 'https://x.example' }])
  })

  it('falls back to the first non-url child when neither folderType nor id "1" match', () => {
    const tree = root([
      { id: '9', title: 'Custom bar', children: [{ id: '30', title: 'Z', url: 'https://z.example' }] },
      { id: '99', title: 'Other', children: [] },
    ])
    expect(toBarModel(tree).loose).toEqual([{ id: '30', title: 'Z', url: 'https://z.example' }])
  })

  it('no qualifying bookmarks-bar node (e.g. every top-level child is itself a bookmark) yields an empty model', () => {
    const tree = root([{ id: '5', title: 'Odd', url: 'https://odd.example' }])
    expect(toBarModel(tree)).toEqual({ folders: [], loose: [] })
  })

  it('drops children with neither a url nor a children array', () => {
    const tree = root([
      {
        id: '1',
        title: 'Bookmarks bar',
        folderType: 'bookmarks-bar',
        children: [
          { id: '40', title: 'Malformed' }, // neither url nor children — dropped
          { id: '41', title: 'Kept', url: 'https://kept.example' },
        ],
      },
    ])
    expect(toBarModel(tree)).toEqual({
      folders: [],
      loose: [{ id: '41', title: 'Kept', url: 'https://kept.example' }],
    })
  })

  it('a missing/empty tree yields an empty model', () => {
    expect(toBarModel([])).toEqual({ folders: [], loose: [] })
  })
})

describe('hasBookmarksPermission / ensureBookmarksPermission (chrome.permissions wrappers)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('hasBookmarksPermission forwards to chrome.permissions.contains', async () => {
    const contains = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { contains } })

    await expect(hasBookmarksPermission()).resolves.toBe(true)
    expect(contains).toHaveBeenCalledWith({ permissions: ['bookmarks'] })
  })

  it('ensureBookmarksPermission calls chrome.permissions.request directly — no contains() pre-check, so no extra await lands between the click and the gesture-consuming call', async () => {
    const contains = vi.fn()
    const request = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('chrome', { permissions: { contains, request } })

    await expect(ensureBookmarksPermission()).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith({ permissions: ['bookmarks'] })
    expect(contains).not.toHaveBeenCalled()
  })

  it('ensureBookmarksPermission forwards a denial (request resolving false) rather than swallowing it', async () => {
    const request = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('chrome', { permissions: { request } })

    await expect(ensureBookmarksPermission()).resolves.toBe(false)
  })
})
