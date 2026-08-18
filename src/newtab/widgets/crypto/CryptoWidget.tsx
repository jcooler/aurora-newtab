import { useStoredKey } from '../../../lib/hooks/useStoredKey'
import { useConnectorSnapshot } from '../../../lib/hooks/useConnectorSnapshot'
import { fetchCrypto, type CoinRow, type CryptoData } from '../../../services/connectors/crypto'
import type { CryptoConfig } from '../../../services/connectors/types'
import type { CanvasSize } from '../../../lib/layout/canvasTypes'
import DockLine from '../shared/DockLine'

// CryptoConfig caps at 5 coins (types.ts's own comment) and the service's
// own PER_PAGE mirrors it — this is a defensive re-slice at the display
// boundary, same belt-and-braces idiom as VercelWidget's MAX_DEPLOYMENTS
// re-slice of a service result that's already capped.
const MAX_COINS = 5

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
  const { data } = useConnectorSnapshot<CryptoData>('crypto', crypto, (prev) =>
    fetchCrypto(coins, prev),
  )
  if (!data) return null

  // fetchCrypto already reorders its rows to the CONFIGURED id order (see
  // crypto.ts's own doc comment) — this widget renders that order as-is
  // rather than re-sorting, same division of labor as every other connector
  // widget (the service owns ordering, the widget owns display).
  const rows = (data.coins ?? []).slice(0, canvasSize === 'compact' ? 1 : MAX_COINS)
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
    // A slim floating STRIP, not a panel — no bg-panel-solid/shadow/rounded
    // card surface (unlike GithubWidget/VercelWidget/etc.): the fixed width
    // here (w-88 = 22rem) sizes the strip itself. Centering is NOT this
    // widget's or the PositionedBlock className's job anymore — it comes
    // from the bottom band's own `<aside data-zone="bottom">` (App.tsx:
    // `flex w-fit flex-col items-center gap-2`), whose `items-center`
    // centers this strip (and the quote below it) as flex children. The
    // crypto PositionedBlock's className now carries only the `hidden
    // taller:block` height-tier gate — see App.tsx's own comment on the
    // crypto PositionedBlock for the tier rationale.
    <section aria-label="Crypto" data-canvas-size={canvasSize} className="w-88 text-center">
      {empty ? (
        <p className="text-photo text-sm text-canvas-fg-muted">No prices right now.</p>
      ) : (
        <div className="flex flex-nowrap items-baseline justify-center gap-4">
          {rows.map((coin) => (
            <CoinCell key={coin.id} coin={coin} />
          ))}
        </div>
      )}
    </section>
  )
}

/** `{SYMBOL} {price} {±x.x%}` — a single-line cell, never wrapped and never
 *  truncated (numeric data truncating mid-digit would be actively
 *  misleading, unlike a headline title). The symbol/price share the
 *  baseline `text-photo` legibility shadow (index.css's @utility, a
 *  text-shadow only — it carries no color of its own) plus the fixed
 *  `text-canvas-fg` photo ink (Task 60 fix round: this strip floats on the
 *  photo, so its ink must NOT follow the panelColor-adaptive --fg), so it
 *  composes cleanly with the change span's own tint below; the change span is
 *  the ONLY part with a state-driven color. */
function CoinCell({ coin }: { coin: CoinRow }) {
  return (
    <span className="text-photo text-canvas-fg flex items-baseline gap-1 text-sm font-medium">
      <span className="uppercase">{coin.symbol}</span>
      <span>{formatPrice(coin.price)}</span>
      <span className={tintClass(coin.change24h)}>{formatChange(coin.change24h)}</span>
    </span>
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
  return 'text-canvas-fg-muted'
}
