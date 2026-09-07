// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { createStorage } from '../../lib/storage'
import { memoryDriver } from '../../lib/storage/driver'
import { StorageProvider } from '../../lib/storage/context'
import GraphAppearanceControl from './GraphAppearanceControl'

it('changes only the selected graph palette and retains connector state and all existing colors', async () => {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.update('settings', value => ({ ...value, panelColor: '#713f83', widgetTextColor: '#f2e7cc', photoClockColor: '#86cafa' }))
  await storage.set('connectors', { github: { enabled: true, username: 'review', token: 'synthetic', views: { commitGraph: true, pulls: false, issues: true, notifications: true } } })
  const settings = await storage.get('settings')
  const connectors = await storage.get('connectors')
  const snapshots = await storage.get('connectorSnapshots')
  const update = vi.spyOn(storage, 'update')
  render(<StorageProvider storage={storage}><GraphAppearanceControl connector="github" storage={storage} /></StorageProvider>)
  await waitFor(() => expect((screen.getByLabelText('Contribution color') as HTMLSelectElement).disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('Contribution color'), { target: { value: 'green' } })
  await waitFor(() => expect((screen.getByLabelText('Contribution color') as HTMLSelectElement).value).toBe('green'))
  expect(await storage.get('settings')).toEqual({ ...settings, graphColors: { github: 'green', gitlab: 'orange' } })
  expect(await storage.get('connectors')).toEqual(connectors)
  expect(await storage.get('connectorSnapshots')).toEqual(snapshots)
  expect(update.mock.calls.map(([key]) => key)).toEqual(['settings'])
})
