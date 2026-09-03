import { describe, expect, it } from 'vitest'
import { todoReducer } from './todoReducer'
import type { TodoList } from '../../../lib/storage/schema'

const seed: TodoList[] = [
  {
    id: 'list-1',
    name: 'Today',
    items: [
      { id: 'i1', text: 'Write report', done: false },
      { id: 'i2', text: 'Review PR', done: true },
    ],
  },
  {
    id: 'list-2',
    name: 'Later',
    items: [{ id: 'i3', text: 'Plan trip', done: false }],
  },
]

describe('addList', () => {
  it('appends a new list with a generated id', () => {
    const out = todoReducer([], { type: 'addList', name: 'Groceries' })
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Groceries')
    expect(out[0].id).toBeTruthy()
    expect(out[0].items).toEqual([])
  })

  it('trims the name', () => {
    const out = todoReducer([], { type: 'addList', name: '  Chores  ' })
    expect(out[0].name).toBe('Chores')
  })

  it('falls back to "List" for an empty name', () => {
    const out = todoReducer([], { type: 'addList', name: '   ' })
    expect(out[0].name).toBe('List')
  })
})

describe('addItem', () => {
  it('appends an undone item to the target list', () => {
    const out = todoReducer(seed, { type: 'addItem', listId: 'list-2', text: 'Book flights', today: '2026-09-02' })
    const list = out.find((l) => l.id === 'list-2')!
    expect(list.items).toHaveLength(2)
    expect(list.items[1]).toMatchObject({ text: 'Book flights', done: false, createdOn: '2026-09-02' })
    expect(list.items[1]!.id).toBeTruthy()
  })

  it('rejects an invalid provenance date without changing the list', () => {
    expect(() => todoReducer(seed, {
      type: 'addItem', listId: 'list-2', text: 'Book flights', today: '2026-02-30',
    })).toThrow('todo_date_invalid')
  })
})

describe('toggleItem', () => {
  it('records a completion date and flips only the matching item', () => {
    const out = todoReducer(seed, { type: 'toggleItem', listId: 'list-1', itemId: 'i1', today: '2026-09-02' })
    const list = out.find((l) => l.id === 'list-1')!
    expect(list.items.find((i) => i.id === 'i1')).toMatchObject({ done: true, completedOn: '2026-09-02' })
    expect(list.items.find((i) => i.id === 'i2')!.done).toBe(true) // untouched
  })

  it('removes completion provenance when an item is reopened', () => {
    const dated: TodoList[] = [{
      id: 'list-1', name: 'Today', items: [{
        id: 'i1', text: 'Write report', done: true, createdOn: '2026-09-01', completedOn: '2026-09-02',
      }],
    }]
    const out = todoReducer(dated, { type: 'toggleItem', listId: 'list-1', itemId: 'i1', today: '2026-09-03' })
    expect(out[0]?.items[0]).toEqual({
      id: 'i1', text: 'Write report', done: false, createdOn: '2026-09-01',
    })
  })

  it('accepts legacy items without provenance and rejects invalid action dates', () => {
    const completed = todoReducer(seed, {
      type: 'toggleItem', listId: 'list-1', itemId: 'i1', today: '2026-09-02',
    })
    expect(completed[0]?.items[0]).not.toHaveProperty('createdOn')
    expect(completed[0]?.items[0]).toHaveProperty('completedOn', '2026-09-02')
    expect(() => todoReducer(seed, {
      type: 'toggleItem', listId: 'list-1', itemId: 'i1', today: 'not-a-date',
    })).toThrow('todo_date_invalid')
  })
})

describe('removeItem', () => {
  it('removes the item from its list', () => {
    const out = todoReducer(seed, { type: 'removeItem', listId: 'list-1', itemId: 'i1' })
    const list = out.find((l) => l.id === 'list-1')!
    expect(list.items.map((i) => i.id)).toEqual(['i2'])
  })
})

describe('removeList', () => {
  it('removes the list by id', () => {
    const out = todoReducer(seed, { type: 'removeList', listId: 'list-2' })
    expect(out.map((l) => l.id)).toEqual(['list-1'])
  })
})

describe('renameList', () => {
  it('renames and trims the list name', () => {
    const out = todoReducer(seed, { type: 'renameList', listId: 'list-2', name: '  Weekend  ' })
    expect(out.find((l) => l.id === 'list-2')!.name).toBe('Weekend')
  })

  it('keeps the old name when the new name is empty', () => {
    const out = todoReducer(seed, { type: 'renameList', listId: 'list-2', name: '   ' })
    expect(out.find((l) => l.id === 'list-2')!.name).toBe('Later')
  })
})

describe('moveItem', () => {
  it('reorders items within a list', () => {
    const withThree: TodoList[] = [
      {
        id: 'l',
        name: 'L',
        items: [
          { id: 'a', text: 'A', done: false },
          { id: 'b', text: 'B', done: false },
          { id: 'c', text: 'C', done: false },
        ],
      },
    ]
    const out = todoReducer(withThree, { type: 'moveItem', listId: 'l', from: 0, to: 2 })
    expect(out[0]!.items.map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('no-ops on out-of-range indices', () => {
    const out = todoReducer(seed, { type: 'moveItem', listId: 'list-1', from: 5, to: 0 })
    expect(out).toEqual(seed)
  })
})

describe('clearDone', () => {
  it('removes only done items', () => {
    const out = todoReducer(seed, { type: 'clearDone', listId: 'list-1' })
    const list = out.find((l) => l.id === 'list-1')!
    expect(list.items.map((i) => i.id)).toEqual(['i1'])
  })
})

describe('unknown listId', () => {
  it('returns the same array reference when the listId does not match any list', () => {
    const out = todoReducer(seed, { type: 'toggleItem', listId: 'nope', itemId: 'i1', today: '2026-09-02' })
    expect(out).toBe(seed)
  })
})
