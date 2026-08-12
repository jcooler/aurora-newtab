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
})

describe('EntityPickerDialog, checkbox aria-label convention', () => {
  it('checkbox aria-labels are exactly "Show {friendlyName}" / "Action {friendlyName}" (what the model tests above rely on)', () => {
    render(<EntityPickerDialog open states={STATES} entities={[]} actions={[]} onCancel={() => {}} onSave={() => {}} />)
    expect(screen.getByRole('checkbox', { name: 'Show Kitchen' }).getAttribute('aria-label')).toBe('Show Kitchen')
    expect(screen.getByRole('checkbox', { name: 'Action Fan' }).getAttribute('aria-label')).toBe('Action Fan')
    expect(screen.getByRole('checkbox', { name: 'Action Movie night' }).getAttribute('aria-label')).toBe(
      'Action Movie night',
    )
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
