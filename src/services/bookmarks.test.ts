import { describe, expect, it } from 'vitest'
import { toBarModel, type ChromeBookmarkNode } from './bookmarks'

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
