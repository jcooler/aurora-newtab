import type { TodoItem, TodoList } from '../../../lib/storage/schema'
import { isMetricDateKey } from '../../../metrics/history'

export type TodoAction =
  | { type: 'addList'; name: string }
  | { type: 'renameList'; listId: string; name: string }
  | { type: 'removeList'; listId: string }
  | { type: 'addItem'; listId: string; text: string; today: string }
  | { type: 'toggleItem'; listId: string; itemId: string; today: string }
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
      if (!isMetricDateKey(action.today)) throw new Error('todo_date_invalid')
      const text = action.text.trim()
      if (!text) return lists
      const item: TodoItem = { id: crypto.randomUUID(), text, done: false, createdOn: action.today }
      return mapList(lists, action.listId, (l) => ({ ...l, items: [...l.items, item] }))
    }
    case 'toggleItem': {
      if (!isMetricDateKey(action.today)) throw new Error('todo_date_invalid')
      return mapList(lists, action.listId, (l) => ({
        ...l,
        items: l.items.map((item) => {
          if (item.id !== action.itemId) return item
          if (!item.done) return { ...item, done: true, completedOn: action.today }
          const { completedOn: _completedOn, ...reopened } = item
          return { ...reopened, done: false }
        }),
      }))
    }
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
