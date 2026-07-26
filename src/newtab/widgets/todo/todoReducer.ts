import type { TodoItem, TodoList } from '../../../lib/storage/schema'

export type TodoAction =
  | { type: 'addList'; name: string }
  | { type: 'renameList'; listId: string; name: string }
  | { type: 'removeList'; listId: string }
  | { type: 'addItem'; listId: string; text: string }
  | { type: 'toggleItem'; listId: string; itemId: string }
  | { type: 'removeItem'; listId: string; itemId: string }
  | { type: 'moveItem'; listId: string; from: number; to: number }
  | { type: 'clearDone'; listId: string }

function mapList(
  lists: TodoList[],
  listId: string,
  fn: (list: TodoList) => TodoList,
): TodoList[] {
  let touched = false
  const next = lists.map((l) => {
    if (l.id !== listId) return l
    touched = true
    return fn(l)
  })
  return touched ? next : lists
}

export function todoReducer(lists: TodoList[], action: TodoAction): TodoList[] {
  switch (action.type) {
    case 'addList':
      return [
        ...lists,
        { id: crypto.randomUUID(), name: action.name.trim() || 'List', items: [] },
      ]
    case 'renameList':
      return mapList(lists, action.listId, (l) => ({
        ...l,
        name: action.name.trim() || l.name,
      }))
    case 'removeList':
      return lists.filter((l) => l.id !== action.listId)
    case 'addItem': {
      const text = action.text.trim()
      if (!text) return lists
      const item: TodoItem = { id: crypto.randomUUID(), text, done: false }
      return mapList(lists, action.listId, (l) => ({ ...l, items: [...l.items, item] }))
    }
    case 'toggleItem':
      return mapList(lists, action.listId, (l) => ({
        ...l,
        items: l.items.map((i) => (i.id === action.itemId ? { ...i, done: !i.done } : i)),
      }))
    case 'removeItem':
      return mapList(lists, action.listId, (l) => ({
        ...l,
        items: l.items.filter((i) => i.id !== action.itemId),
      }))
    case 'moveItem':
      return mapList(lists, action.listId, (l) => {
        const { from, to } = action
        if (from < 0 || from >= l.items.length || to < 0 || to >= l.items.length) return l
        const items = [...l.items]
        const [moved] = items.splice(from, 1)
        items.splice(to, 0, moved)
        return { ...l, items }
      })
    case 'clearDone':
      return mapList(lists, action.listId, (l) => ({
        ...l,
        items: l.items.filter((i) => !i.done),
      }))
  }
}
