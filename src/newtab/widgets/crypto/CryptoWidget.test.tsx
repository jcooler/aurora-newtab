// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { createStorage, type AuroraStorage } from '../../../lib/storage/index'
import { memoryDriver } from '../../../lib/storage/driver'
import { StorageProvider } from '../../../lib/storage/context'
import type { CryptoData } from '../../../services/connectors/crypto'
import type { CryptoConfig } from '../../../services/connectors/types'
import { connectorSnapshotScope } from '../../../services/connectors/snapshotIdentity'
import { __resetInFlight } from '../../../lib/hooks/useConnectorSnapshot'
import CryptoWidget, { formatPrice } from './CryptoWidget'

// The snapshot hook's in-flight dedupe map is module-level and survives
// across cases; reset it so one test's refresh can't dedupe the next — same
// discipline as every other connector widget test.
beforeEach(() => __resetInFlight())
afterEach(() => __resetInFlight())

const DATA: CryptoData = {
  coins: [
    // Deliberately NOT market-cap order here — this is what fetchCrypto's
    // own reorder would have already produced (the CONFIGURED order, below),
    // and the widget must render it AS-IS rather than re-sorting.
    { id: 'dogecoin', symbol: 'doge', name: 'Dogecoin', price: 0.1234, change24h: 5.6 },
    { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', price: 67_412, change24h: 2.4 },
    { id: 'ethereum', symbol: 'eth', name: 'Ethereum', price: 3_245, change24h: -1.2 },
  ],
}

const CONNECTED: CryptoConfig = { enabled: true, coins: ['dogecoin', 'bitcoin', 'ethereum'] }

/** Storage seeded with a CONNECTED crypto connector and a FRESH snapshot
 *  (fetchedAt now) so useConnectorSnapshot treats it as fresh and never
 *  calls the real fetchCrypto — the widget renders straight from cache, no
 *  network. */
async function seededStorage(
  config: CryptoConfig,
  data: CryptoData | null = DATA,
): Promise<AuroraStorage> {
  const storage = createStorage(memoryDriver())
  await storage.init()
  await storage.set('connectors', { crypto: config })
  if (data) {
    await storage.set('connectorSnapshots', {
      crypto: { scope: await connectorSnapshotScope('crypto', config), fetchedAt: Date.now(), data },
    })
  }
  return storage
}

function mount(storage: AuroraStorage, props: { canvasSize?: 'compact' | 'standard'; docked?: boolean } = {}) {
  return render(
    <StorageProvider storage={storage}>
      <CryptoWidget {...props} />
    </StorageProvider>,
  )
}

describe('CryptoWidget', () => {
  it('preserves the exact frame while the first snapshot is loading', async () => {
    mount(await seededStorage(CONNECTED, null), { canvasSize: 'compact' })
    const frame = await screen.findByRole('region', { name: 'Crypto' })
    expect(frame.getAttribute('data-tier-frame')).toBe('compact')
    expect(frame.getAttribute('data-tier-frame-state')).toBe('loading')
  })

  it('Docked renders one dense line with the first coin cell and no strip (NL-P5 batch 2)', async () => {
    const storage = await seededStorage(CONNECTED)
    render(
      <StorageProvider storage={storage}>
        <CryptoWidget docked />
      </StorageProvider>,
    )
    const line = await screen.findByLabelText('Crypto: DOGE $0.1234')
    expect(line.getAttribute('data-dock-line')).toBe('')
    // The dense line replaces the strip entirely — no other coin cells.
    expect(screen.queryByText('btc')).toBeNull()
    expect(screen.queryByText('$67,412')).toBeNull()
  })

  it.each([
    ['compact', 1],
    ['standard', 3],
  ] as const)('uses the exact %s authored frame with complete market rows', async (canvasSize, expectedRows) => {
    mount(await seededStorage(CONNECTED), { canvasSize })
    await screen.findByText('doge')
    const frame = screen.getByRole('region', { name: 'Crypto' })
    expect(frame.getAttribute('data-tier-frame')).toBe(canvasSize)
    expect(frame.getAttribute('data-tier-frame-state')).toBe('ready')
    expect(screen.getByRole('list', { name: 'Selected cryptocurrency prices' })).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(expectedRows)
    expect(frame.className).not.toMatch(/overflow-(?:y-)?(?:auto|scroll)/)
    expect(frame.querySelector('[class*="overflow-y-auto"], [class*="overflow-y-scroll"]')).toBeNull()
  })

  it('renders each Standard coin as one structured row with a truthful direction mark', async () => {
    mount(await seededStorage(CONNECTED), { canvasSize: 'standard' })
    await screen.findByText('doge')

    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.getAttribute('data-crypto-direction'))).toEqual(['up', 'up', 'down'])
    expect(rows.every((row) => row.querySelector('[data-crypto-trend]'))).toBe(true)
    expect(rows[0]!.textContent).toContain('doge')
    expect(rows[0]!.textContent).toContain('$0.1234')
    expect(rows[0]!.textContent).toContain('+5.6%')
  })

  it('renders one cell per seeded coin (symbol, price, change) in the CONFIGURED order, not market-cap order', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)

    // The symbol's textContent stays the lowercase CoinGecko casing ('doge')
    // — `uppercase` (asserted separately below) is a CSS text-transform,
    // which never changes the underlying text node, only its painted glyphs.
    await screen.findByText('doge')
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual(['doge', 'btc', 'eth'])
    expect(screen.getByText('$67,412')).toBeTruthy()
    expect(screen.getByText('$0.1234')).toBeTruthy()
    expect(screen.getByText('$3,245')).toBeTruthy()
  })

  it('symbols carry the `uppercase` CSS transform regardless of the lowercase CoinGecko symbol casing', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)
    const symbol = await screen.findByText('doge')
    expect(symbol.className).toContain('uppercase')
  })

  it('formats the 24h change with one decimal, a leading sign, and a REAL minus sign (not a hyphen) for negatives', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage)
    await screen.findByText('doge')
    expect(screen.getByText('+5.6%')).toBeTruthy()
    expect(screen.getByText('+2.4%')).toBeTruthy()
    const negative = screen.getByText('−1.2%') // U+2212 MINUS SIGN
    expect(negative).toBeTruthy()
    expect(negative.textContent).not.toContain('-') // no ASCII hyphen-minus anywhere in it
  })

  it('tints the change span: positive emerald, negative red, exactly zero muted', async () => {
    const zeroData: CryptoData = {
      coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', price: 100, change24h: 0 }],
    }
    const storage = await seededStorage({ enabled: true, coins: ['bitcoin'] }, zeroData)
    mount(storage)
    const zeroChip = await screen.findByText('0.0%')
    expect(zeroChip.className).toContain('text-fg-muted')

    // Re-mount fresh for the positive/negative cases (the DOGE/BTC/ETH fixture).
    document.body.innerHTML = ''
    const storage2 = await seededStorage(CONNECTED)
    mount(storage2)
    await screen.findByText('doge')
    expect(screen.getByText('+5.6%').className).toContain('text-emerald-300')
    expect(screen.getByText('−1.2%').className).toContain('text-red-400')
  })

  it('shows the empty-connected copy exactly when connected but the API returned no rows', async () => {
    const storage = await seededStorage(CONNECTED, { coins: [] })
    mount(storage)
    const message = await screen.findByText('No prices right now.')
    expect(message.className).toContain('text-fg-muted')
    expect(screen.getByRole('region', { name: 'Crypto' }).getAttribute('data-tier-frame-state')).toBe('empty')
    expect(screen.getByText('3 selected')).toBeTruthy()
  })

  it('keeps Standard to four complete rows while reporting all five selected coins', async () => {
    const many: CryptoData = {
      coins: Array.from({ length: 5 }, (_, i) => ({
        id: `coin-${i}`,
        symbol: `c${i}`,
        name: `Coin ${i}`,
        price: 10 + i,
        change24h: 0,
      })),
    }
    const storage = await seededStorage(
      { enabled: true, coins: many.coins.map((c) => c.id) },
      many,
    )
    mount(storage, { canvasSize: 'standard' })
    await screen.findByText('c0')
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.queryByText('c4')).toBeNull()
    expect(screen.getByText('5 selected')).toBeTruthy()
  })

  it('uses Compact for one useful primary coin instead of shrinking every selected price into the same strip', async () => {
    const storage = await seededStorage(CONNECTED)
    mount(storage, { canvasSize: 'compact' })
    expect(await screen.findByText('doge')).toBeTruthy()
    expect(screen.queryByText('btc')).toBeNull()
  })

  it('renders nothing — and never runs the snapshot refresh — when the connector is disabled', async () => {
    const storage = await seededStorage({ ...CONNECTED, enabled: false }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    // The gate returns before useConnectorSnapshot mounts, so no refresh
    // wrote a snapshot — the "zero hooks in the gate" proof.
    expect((await storage.get('connectorSnapshots')).crypto).toBeUndefined()
  })

  it('renders nothing when enabled but no coins are configured', async () => {
    const storage = await seededStorage({ enabled: true, coins: [] }, null)
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).crypto).toBeUndefined()
  })

  it('survives a hand-edited backup restoring { enabled: true } with no coins field — renders nothing, never throws', async () => {
    const storage = createStorage(memoryDriver())
    await storage.init()
    await storage.set('connectors', { crypto: { enabled: true } as never })
    const { container } = mount(storage)
    await act(async () => {})

    expect(container.firstChild).toBeNull()
    expect((await storage.get('connectorSnapshots')).crypto).toBeUndefined()
  })
})

describe('formatPrice', () => {
  it('a whole-dollar-plus price (BTC-style) formats with thousands separators and no cents', () => {
    expect(formatPrice(67_412)).toBe('$67,412')
  })

  it('a sub-$1 price (DOGE-style) formats with up to 4 fraction digits so it stays meaningfully non-zero', () => {
    expect(formatPrice(0.1234)).toBe('$0.1234')
  })
})
