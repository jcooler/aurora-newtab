import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { fetchCrypto, type CoinRow, type CryptoData } from '../../../services/connectors/crypto'
import type { CryptoConfig } from '../../../services/connectors/types'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import DockLine from '../shared/DockLine'
import TierFrame, { ResourceFrameStatus, resourceFrameState } from '../shared/TierFrame'

// CryptoConfig can contain five selected coins, while the approved Standard
// frame has room for four complete market rows. The header still reports the
// configured total; the display never wraps or scrolls a partial fifth row.
const MAX_STANDARD_ROWS = 4

export default function CryptoWidget({ canvasSize = 'standard', docked }: { canvasSize?: CanvasSize; docked?: boolean } = {}) {
  // Zero-hooks-in-the-gate split, same as every other connector widget: the
  // one useStoredKey read runs every render (Rules of Hooks stay satisfied),
  // but a disabled connector, or an enabled one with no coins configured yet,
  // never mounts CryptoInner and therefore never runs useConnectorSnapshot's
  // subscribe/refresh. Array.isArray is load-bearing, not paranoia (same
  // rationale as RssWidget's own feeds check): backup import validates
  // connector configs only structurally (`enabled` alone), so a hand-edited
  // backup can legally restore { crypto: { enabled: true } } with no coins
  // array at all.
  const [connectors] = useStoredKey('connectors')
  const crypto = connectors?.crypto as CryptoConfig | undefined
  if (!crypto?.enabled || !Array.isArray(crypto.coins) || crypto.coins.length === 0) return null
  return <CryptoInner crypto={crypto} canvasSize={canvasSize} docked={docked} />
}

function CryptoInner({ crypto, canvasSize, docked }: { crypto: CryptoConfig; canvasSize: CanvasSize; docked?: boolean }) {
  const { coins } = crypto
  // Stale-while-refreshing: the hook returns the cached snapshot immediately
  // and refreshes once per mount, carrying `prev` so fetchCrypto's
  // quiet-failure path keeps it (no ETag round-trip here — see crypto.ts's
  // own doc comment). No cached data yet (first-ever load still in flight,
  // or a total failure) renders nothing rather than an empty shell — same
  // as every other connector widget.
  const { data, state } = useConnectorSnapshot<CryptoData>('crypto', crypto, (prev) =>
    fetchCrypto(coins, prev),
  )
  if (!data) {
    if (docked) return null
    const frameState = resourceFrameState(state)
    return <ResourceFrameStatus label="Crypto" tier={canvasSize} state={frameState === 'hard-error' ? 'hard-error' : 'loading'} />
  }

  // fetchCrypto already reorders its rows to the CONFIGURED id order (see
  // crypto.ts's own doc comment) — this widget renders that order as-is
  // rather than re-sorting, same division of labor as every other connector
  // widget (the service owns ordering, the widget owns display).
  const rows = (data.coins ?? []).slice(0, canvasSize === 'compact' ? 1 : MAX_STANDARD_ROWS)
  const empty = rows.length === 0

  // Docked tier (NL-P5 batch 2): the first configured coin's own cell strings
  // as one dense fact — same snapshot-ordered rows, no second fetch. The
  // symbol is uppercased in JS here because the strip's `uppercase` is a CSS
  // paint-time transform the dock line doesn't carry; no rows -> no fact ->
  // DockLine renders nothing (the no-whitespace law).
  if (docked) {
    const first = rows[0]
    return <DockLine label="Crypto" facts={[first && `${first.symbol.toUpperCase()} ${formatPrice(first.price)}`]} />
  }

  return (
    <TierFrame
      label="Crypto"
      tier={canvasSize}
      state={resourceFrameState(state, empty)}
      data-canvas-size={canvasSize}
      className="flex min-h-0 flex-col text-left"
    >
      <header className="flex min-h-8 items-center justify-between gap-3 border-b border-hairline px-3 py-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]">Crypto</h2>
        <span className="text-[11px] text-fg-muted">{coins.length} selected</span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden px-3 pb-2">
        {empty ? (
          <p className="grid h-full place-items-center text-sm text-fg-muted">No prices right now.</p>
        ) : (
          <div
            role="list"
            aria-label="Selected cryptocurrency prices"
            className="grid h-full min-h-0 content-center"
          >
            {rows.map((coin) => (
              <CoinMarketRow key={coin.id} coin={coin} />
            ))}
          </div>
        )}
      </div>
    </TierFrame>
  )
}

/** One structured market row: symbol, price, 24h movement, and a truthful
 * directional mark. Numeric values stay on one line and only the movement
 * value/mark carry state color. */
function CoinMarketRow({ coin }: { coin: CoinRow }) {
  const direction = coin.change24h > 0 ? 'up' : coin.change24h < 0 ? 'down' : 'flat'
  const trendClass = direction === 'up'
    ? 'border-emerald-300 text-emerald-300'
    : direction === 'down'
      ? 'border-red-400 text-red-400'
      : 'border-fg-muted/50 text-fg-muted'
  return (
    <div
      role="listitem"
      data-crypto-row=""
      data-crypto-direction={direction}
      className="grid min-h-8 min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_3rem_2rem] items-center gap-1.5 border-t border-hairline text-[11px] text-fg"
    >
      <strong className="truncate font-mono font-semibold uppercase" title={coin.name}>{coin.symbol}</strong>
      <span className="min-w-0 text-right font-mono font-semibold tabular-nums">{formatPrice(coin.price)}</span>
      <span className={`text-right font-mono tabular-nums ${tintClass(coin.change24h)}`}>{formatChange(coin.change24h)}</span>
      <span
        aria-hidden="true"
        data-crypto-trend=""
        className={`h-3 w-7 justify-self-end border-r border-t ${trendClass}`}
        style={{ transform: direction === 'up' ? 'skewX(-28deg)' : direction === 'down' ? 'skewX(28deg)' : 'none' }}
      />
    </div>
  )
}

/** Pure, exported for direct unit testing (same pattern as vercel.ts's
 *  relAge): USD currency formatting via Intl, with the fraction-digit cap
 *  depending on the coin's own price magnitude — a sub-$1 coin (DOGE-style)
 *  needs its decimals to stay meaningfully non-zero (0.1234, not $0), while
 *  a whole-dollar-plus coin (BTC-style) is more readable with no cents at
 *  all (67,412, not 67,412.37) — a single global fraction-digit count could
 *  never serve both. */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: price < 1 ? 4 : 0,
  }).format(price)
}

/** One decimal, always signed — including a REAL minus sign (U+2212), not
 *  the ASCII hyphen-minus a bare template literal would produce. Typographic
 *  minus signs are visually distinct (slightly longer, vertically centered
 *  on the digit height rather than sitting on the punctuation baseline) and
 *  are the correct Unicode codepoint for a mathematical sign rather than a
 *  word-joining hyphen — the same distinction Aurora's other numeric/negative
 *  displays are expected to honor. Exact zero reads as unsigned '0.0%'
 *  (tintClass below renders it muted, not red/green) rather than '+0.0%',
 *  since a flat 24h change isn't a "gain" no matter which sign convention
 *  would technically apply to it. */
function formatChange(change: number): string {
  const magnitude = Math.abs(change).toFixed(1)
  if (change > 0) return `+${magnitude}%`
  if (change < 0) return `−${magnitude}%`
  return `${magnitude}%`
}

/** change24h -> tint class: positive emerald, negative red, exactly zero
 *  muted — same three-way shape as vercel.ts's stateClass (READY/ERROR/
 *  else), just keyed off a sign instead of a status string. */
function tintClass(change: number): string {
  if (change > 0) return 'text-emerald-300'
  if (change < 0) return 'text-red-400'
  return 'text-fg-muted'
}
