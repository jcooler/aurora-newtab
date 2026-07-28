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

/** Thin chrome.bookmarks wrapper — one of the chrome.* touches in this module
 *  (requires the optional 'bookmarks' permission declared in
 *  src/manifest.ts — see ensureBookmarksPermission below). Tests import
 *  `toBarModel` directly and never call this, so importing the pure half of
 *  this module never executes chrome.* code. */
export async function loadBarModel(): Promise<BarModel> {
  const tree = await chrome.bookmarks.getTree()
  return toBarModel(tree)
}

/** True if the extension currently holds the optional 'bookmarks'
 *  permission — either because the user granted it via
 *  ensureBookmarksPermission below, or (for anyone who had Aurora installed
 *  before it became optional) because Chrome carries a previously-granted
 *  permission forward across an update. chrome.permissions calls, alongside
 *  chrome.bookmarks.getTree above, are the only chrome.* touches in this
 *  module — the carve-out that keeps every other file free of chrome.*. */
export async function hasBookmarksPermission(): Promise<boolean> {
  return chrome.permissions.contains({ permissions: ['bookmarks'] })
}

/** Requests the optional 'bookmarks' permission. MUST be called directly
 *  from within a user gesture (e.g. a click handler) — chrome.permissions.request
 *  only shows its prompt when called that way, and any await inserted before
 *  it (even a fast one, like a hasBookmarksPermission() pre-check) is an IPC
 *  round-trip that can land outside the gesture window and break the prompt.
 *  So this calls request() straight away, with no pre-check: request()
 *  already resolves true with no prompt at all when the permission is
 *  already held, which is the same outcome a pre-check would have produced,
 *  just without the extra await in front of the gesture-consuming call.
 *  Resolves to whether the permission is held once this settles: true if it
 *  was already granted or the user approves the prompt, false if the user
 *  denies it. Callers should also expect this to reject (not just resolve
 *  false) — e.g. if the gesture context was somehow already lost — and
 *  handle that the same way as an explicit denial. */
export async function ensureBookmarksPermission(): Promise<boolean> {
  return chrome.permissions.request({ permissions: ['bookmarks'] })
}
