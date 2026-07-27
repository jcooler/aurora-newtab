export interface BookmarkItem {
  id: string
  title: string
  url: string
}

export interface BookmarkFolder {
  id: string
  title: string
  items: BookmarkItem[]
  folders: BookmarkFolder[]
}

export interface BarModel {
  folders: BookmarkFolder[]
  loose: BookmarkItem[]
}

/** The minimal shape `toBarModel` needs from a real
 *  chrome.bookmarks.BookmarkTreeNode — deliberately NOT that type itself,
 *  since it also requires fields (e.g. `syncing`) that are irrelevant here
 *  and would force every test fixture to carry them. A real
 *  BookmarkTreeNode[] (from chrome.bookmarks.getTree()) is structurally a
 *  superset, so it's still assignable straight into `loadBarModel` below. */
export interface ChromeBookmarkNode {
  id: string
  title: string
  url?: string
  folderType?: string
  children?: ChromeBookmarkNode[]
}

function mapFolder(node: ChromeBookmarkNode): BookmarkFolder {
  const items: BookmarkItem[] = []
  const folders: BookmarkFolder[] = []
  for (const child of node.children ?? []) {
    if (child.url) {
      items.push({ id: child.id, title: child.title, url: child.url })
    } else if (child.children) {
      folders.push(mapFolder(child))
    }
    // else: neither a bookmark (has url) nor a folder (has children) —
    // a malformed/unsupported node type. Dropped.
  }
  return { id: node.id, title: node.title.trim() ? node.title : 'Folder', items, folders }
}

/** Pure: locates the bookmarks-bar node among the tree's root children
 *  (preferring `folderType === 'bookmarks-bar'`, then id `'1'`, then the
 *  first child that isn't itself a bookmark) and splits its direct children
 *  into subfolders (mapped recursively) and loose bookmarks. Never touches
 *  chrome.* — fully testable with plain fixtures. */
export function toBarModel(tree: ChromeBookmarkNode[]): BarModel {
  const topChildren = tree[0]?.children ?? []
  const barNode =
    topChildren.find((n) => n.folderType === 'bookmarks-bar') ??
    topChildren.find((n) => n.id === '1') ??
    topChildren.find((n) => !n.url)
  if (!barNode) return { folders: [], loose: [] }
  const mapped = mapFolder(barNode)
  return { folders: mapped.folders, loose: mapped.items }
}

/** Thin chrome.bookmarks wrapper — the only chrome.* touch in this module
 *  (requires the 'bookmarks' permission declared in src/manifest.ts). Tests
 *  import `toBarModel` directly and never call this, so importing the pure
 *  half of this module never executes chrome.* code. */
export async function loadBarModel(): Promise<BarModel> {
  const tree = await chrome.bookmarks.getTree()
  return toBarModel(tree)
}
