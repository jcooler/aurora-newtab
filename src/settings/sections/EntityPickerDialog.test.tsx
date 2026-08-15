// @vitest-environment jsdom
// EntityPickerDialog.test.tsx - Task 100 (W3-SP5). Pure presentational
// checklist dialog: searchable, domain-grouped, hard-capped at
// MAX_CHIP_ENTITIES/MAX_ACTIONS. No network/storage mocking needed: the
// component never touches either (that's Task 101's job).
//
// fireEvent (not userEvent) throughout: @testing-library/user-event isn't a
// project dependency (absent from package.json and node_modules), and both
// sibling dialog/form suites in this codebase, ResetLayoutDialog.test.tsx
// and TokenConnectForm.test.tsx, already exercise clicks/typing purely via
// fireEvent. The brief's two model tests are ported 1:1 onto that same
// toolset: `userEvent.click(x)` -> `fireEvent.click(x)`, `userEvent.type`
// -> `fireEvent.change` with `target.value`. Functionally equivalent for the
// plain checkbox/button/text-input interactions exercised here.
//
// Matchers: this project has no jest-dom setup (vitest.config.ts has no
// setupFiles registering it), so assertions use the house idiom already in
// ResetLayoutDialog.test.tsx / TokenConnectForm.test.tsx (.toBeTruthy(),
// .toBeNull(), .toBe(...)) rather than jest-dom's .toBeInTheDocument().
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import EntityPickerDialog from './EntityPickerDialog'
import type { HaAction, HaEntityRef, HaState } from '../../services/connectors/homeassistant'

afterEach(() => {
  cleanup()
})

// Verbatim from the brief.
const STATES: HaState[] = [
  { id: 'sensor.kitchen_temp', state: '21.5', unit: '°C', friendlyName: 'Kitchen', domain: 'sensor' },
  { id: 'switch.fan', state: 'off', unit: null, friendlyName: 'Fan', domain: 'switch' },
  { id: 'scene.movie_night', state: 'scening', unit: null, friendlyName: 'Movie night', domain: 'scene' },
]

describe('EntityPickerDialog, model tests (verbatim from the brief)', () => {
  it('Save calls onSave with picked refs carrying friendly_name captured at pick time', () => {
    const onSave = vi.fn()
    render(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={onSave} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /show kitchen/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /action movie night/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      [{ id: 'sensor.kitchen_temp', name: 'Kitchen' }],
      [{ id: 'scene.movie_night', name: 'Movie night', domain: 'scene' }],
    )
  })

  it('offers an action checkbox ONLY for scene/script/switch rows', () => {
    render(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={() => {}} />)
    expect(screen.queryByRole('checkbox', { name: /action kitchen/i })).toBeNull()
    expect(screen.getByRole('checkbox', { name: /action fan/i })).toBeTruthy()
  })
})

describe('EntityPickerDialog, grouping and fuzzy search', () => {
  it('groups entities by domain with an eyebrow per group, in alphabetical domain order (scene, sensor, switch, not input order)', () => {
    render(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={() => {}} />)

    const scene = screen.getByText('Scene')
    const sensor = screen.getByText('Sensor')
    const switchLabel = screen.getByText('Switch')

    expect(scene.compareDocumentPosition(sensor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(sensor.compareDocumentPosition(switchLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('filters via fuzzy match over `${friendlyName} ${id}` (matches on id fragments too) and shows "No matches" when nothing matches', () => {
    render(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={() => {}} />)
    const search = screen.getByRole('searchbox')

    fireEvent.change(search, { target: { value: 'kitchen' } })
    expect(screen.getByRole('checkbox', { name: /show kitchen/i })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /show fan/i })).toBeNull()

    // Matches on the entity id fragment, not just the friendly name.
    fireEvent.change(search, { target: { value: 'movie_night' } })
    expect(screen.getByRole('checkbox', { name: /show movie night/i })).toBeTruthy()

    fireEvent.change(search, { target: { value: 'zzzznomatch' } })
    expect(screen.getByText('No matches')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

describe('EntityPickerDialog, hard caps, enforced visibly, never silently dropped', () => {
  const CHIP_CAP_STATES: HaState[] = Array.from({ length: 7 }, (_, i) => ({
    id: `sensor.s${i}`,
    state: '0',
    unit: null,
    friendlyName: `Sensor ${i}`,
    domain: 'sensor',
  }))

  it('at 6 picked chips, unchecked entity checkboxes are disabled and the count line reads "6 of 6 chips"', () => {
    render(
      <EntityPickerDialog open states={CHIP_CAP_STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={() => {}} />,
    )
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`show sensor ${i}\\b`, 'i') }))
    }

    expect(screen.getByText(/6 of 6 chips/)).toBeTruthy()

    const seventh = screen.getByRole('checkbox', { name: /show sensor 6/i }) as HTMLInputElement
    expect(seventh.disabled).toBe(true)

    // A CHECKED box stays enabled at the cap, so the user can free a slot.
    const first = screen.getByRole('checkbox', { name: /show sensor 0/i }) as HTMLInputElement
    expect(first.disabled).toBe(false)
  })

  const ACTION_CAP_STATES: HaState[] = Array.from({ length: 4 }, (_, i) => ({
    id: `switch.a${i}`,
    state: 'off',
    unit: null,
    friendlyName: `Switch ${i}`,
    domain: 'switch',
  }))

  it('at 3 picked actions, unchecked action checkboxes are disabled and the count line reads "3 of 3 actions" (chip checkboxes unaffected)', () => {
    render(
      <EntityPickerDialog open states={ACTION_CAP_STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={() => {}} />,
    )
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`action switch ${i}\\b`, 'i') }))
    }

    expect(screen.getByText(/3 of 3 actions/)).toBeTruthy()

    const fourthAction = screen.getByRole('checkbox', { name: /action switch 3/i }) as HTMLInputElement
    expect(fourthAction.disabled).toBe(true)

    const firstAction = screen.getByRole('checkbox', { name: /action switch 0/i }) as HTMLInputElement
    expect(firstAction.disabled).toBe(false)

    // The chip (Show) cap is independent of the action cap.
    const fourthChip = screen.getByRole('checkbox', { name: /show switch 3/i }) as HTMLInputElement
    expect(fourthChip.disabled).toBe(false)
  })
})

describe('EntityPickerDialog, dialog shell behavior', () => {
  it('Escape calls onCancel via the shared dialog stack', () => {
    const onCancel = vi.fn()
    render(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={onCancel} onSave={() => {}} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('focus lands on the search input when opened', () => {
    render(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole('searchbox'))
  })

  it('open={false} renders nothing', () => {
    render(<EntityPickerDialog open={false} states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('clicking Cancel calls onCancel, not onSave', () => {
    const onCancel = vi.fn()
    const onSave = vi.fn()
    render(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={onCancel} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('clicking the backdrop calls onCancel', () => {
    const onCancel = vi.fn()
    const { container } = render(
      <EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={onCancel} onSave={() => {}} />,
    )
    const backdrop = container.ownerDocument.querySelector('[aria-hidden]') as HTMLElement
    fireEvent.click(backdrop)
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('uses a visible h2 to name the dialog and real h3 headings to name each semantic domain group', () => {
    render(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={() => {}} />)

    const dialog = screen.getByRole('dialog', { name: 'Pick entities' })
    const dialogHeading = screen.getByRole('heading', { level: 2, name: 'Pick entities' })
    expect(dialog.getAttribute('aria-labelledby')).toBe(dialogHeading.id)
    for (const domain of ['Scene', 'Sensor', 'Switch']) {
      const heading = screen.getByRole('heading', { level: 3, name: domain })
      const group = screen.getByRole('group', { name: domain })
      expect(group.getAttribute('aria-labelledby')).toBe(heading.id)
      expect(group.contains(heading)).toBe(true)
    }
  })

  it('restores the actual external Choose entities trigger after Cancel, Escape, backdrop, and Save', () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Choose entities</button>
          <EntityPickerDialog
            open={open}
            states={STATES}
            entities={[]}
            actions={[]}
            onCancel={() => setOpen(false)}
            onSave={() => setOpen(false)}
          />
        </>
      )
    }

    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Choose entities' })
    const reopen = () => {
      trigger.focus()
      fireEvent.click(trigger)
      expect(document.activeElement).toBe(screen.getByRole('searchbox'))
    }
    const expectRestored = () => {
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    }

    reopen()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expectRestored()
    reopen()
    fireEvent.keyDown(document, { key: 'Escape' })
    expectRestored()
    reopen()
    fireEvent.click(document.querySelector('[aria-hidden]') as HTMLElement)
    expectRestored()
    reopen()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expectRestored()
  })
})

describe('EntityPickerDialog, checkbox relationships', () => {
  it('uses visible column purposes plus the full visible friendly name and entity ID exactly once in each checkbox name', () => {
    render(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={() => {}} />)
    expect(screen.getByText('Show')).toBeTruthy()
    expect(screen.getByText('Action')).toBeTruthy()
    expect(screen.getByText('Entity')).toBeTruthy()

    for (const [purpose, friendlyName, id] of [
      ['Show', 'Kitchen', 'sensor.kitchen_temp'],
      ['Show', 'Fan', 'switch.fan'],
      ['Action', 'Fan', 'switch.fan'],
      ['Action', 'Movie night', 'scene.movie_night'],
    ]) {
      const checkbox = screen.getByRole('checkbox', { name: `${purpose} ${friendlyName} ${id}` })
      const ids = checkbox.getAttribute('aria-labelledby')?.split(/\s+/) ?? []
      const resolved = ids.map((labelId) => document.getElementById(labelId)?.textContent).join(' ')
      expect(resolved.split(purpose).length - 1).toBe(1)
      expect(resolved.split(friendlyName).length - 1).toBe(1)
      expect(resolved.split(id).length - 1).toBe(1)
    }
  })

  it('gives search, every checkbox label, Cancel, and Save local 36px target floors', () => {
    render(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={() => {}} />)

    expect(screen.getByRole('searchbox').className).toContain('h-9')
    for (const checkbox of screen.getAllByRole('checkbox')) {
      const target = checkbox.closest('label')
      expect(target?.className).toContain('min-h-9')
      expect(target?.className).toContain('min-w-9')
    }
    for (const name of ['Cancel', 'Save']) {
      const button = screen.getByRole('button', { name })
      expect(button.className).toContain('min-h-9')
      expect(button.className).toContain('min-w-9')
    }
  })
})

describe('EntityPickerDialog, seeding from already-picked props', () => {
  it('seeds initial checked state from entities/actions props, and Save preserves an already-picked entity absent from the current states poll', () => {
    const onSave = vi.fn()
    const seededEntities: HaEntityRef[] = [
      { id: 'switch.fan', name: 'Fan' },
      { id: 'sensor.gone', name: 'Long gone' },
    ]
    const seededActions: HaAction[] = [{ id: 'switch.fan', name: 'Fan', domain: 'switch' }]
    render(
      <EntityPickerDialog
        open
        states={STATES}
        entities={seededEntities}
        actions={seededActions}
        onCancel={() => {}}
        onSave={onSave}
      />,
    )

    expect((screen.getByRole('checkbox', { name: /show fan/i }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /action fan/i }) as HTMLInputElement).checked).toBe(true)
    // sensor.gone isn't in the current states poll, so it renders no row at
    // all: no crash, nothing to check, nothing visibly wrong.
    expect(screen.queryByText(/gone/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      [
        { id: 'switch.fan', name: 'Fan' },
        { id: 'sensor.gone', name: 'Long gone' },
      ],
      [{ id: 'switch.fan', name: 'Fan', domain: 'switch' }],
    )
  })
})

// Review fix (round 1): handleSave used to hardcode `domain: 'switch'` for
// any picked action id it couldn't resolve through either `states` or the
// seeded `actions` prop. That gap is reachable: `states` (and `actions`) can
// change value while the SAME dialog instance stays open (a live re-poll
// landing mid-session), so a freshly-toggled scene/script action can vanish
// from `states` before Save fires, with no seeded entry to fall back to
// either. Hardcoding 'switch' there would later fire `switch.toggle`
// against a scene/script entity — simply wrong. Both cases below simulate
// that live prop change with `rerender` on the SAME element (not a fresh
// `render`), so local pick state survives across it exactly as it would
// against a real re-poll.
describe('EntityPickerDialog, Save-time fallback domain when a fresh pick vanishes mid-session (review fix)', () => {
  it('a freshly-picked scene action whose entity vanishes from states before Save is still saved with domain "scene", never fabricated as switch', () => {
    const onSave = vi.fn()
    const initialStates: HaState[] = [
      ...STATES,
      { id: 'scene.bedtime', state: 'scening', unit: null, friendlyName: 'Bedtime', domain: 'scene' },
    ]
    const { rerender } = render(
      <EntityPickerDialog open states={initialStates} entities={[]} actions={[]} onCancel={() => {}} onSave={onSave} />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: /action bedtime/i }))

    // The parent re-polls mid-session: scene.bedtime has dropped out of the
    // live states array before Save fires.
    rerender(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith([], [{ id: 'scene.bedtime', name: 'scene.bedtime', domain: 'scene' }])
  })

  it('an id whose own prefix is not an eligible action domain, present in neither the live states nor the live actions prop, is dropped rather than fabricated', () => {
    const onSave = vi.fn()
    // A hand-edited/malformed stored config could seed an action whose
    // claimed `domain` disagrees with its own id prefix ('light' here, not
    // an ACTION_DOMAINS member) — this is how such an id enters
    // pickedActionIds at all, since the UI itself only ever wires the
    // Action checkbox onto rows already known to have an eligible domain.
    const seededActions: HaAction[] = [{ id: 'light.desk', name: 'Desk lamp', domain: 'switch' }]
    const { rerender } = render(
      <EntityPickerDialog open states={STATES} entities={[]} actions={seededActions} onCancel={() => {}} onSave={onSave} />,
    )

    // The parent's stored config changes mid-session too: by the time Save
    // fires, light.desk is gone from the live actions prop as well as from
    // states — exactly the "resolvable through neither" gap.
    rerender(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith([], [])
  })
})
