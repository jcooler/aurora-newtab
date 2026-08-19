/** Curated CoinGecko picklist (owner direction 2026-08-18: "picklists for
 *  this data, not typing them in comma separated"). A STATIC catalog — no
 *  request, no key — of well-known ids in CoinGecko's own id vocabulary;
 *  the settings picklist renders these as checkboxes and any saved id
 *  outside the catalog as a removable "(custom)" entry, so hand-configured
 *  or backup-restored coins are never lost. Display order in the widget is
 *  the user's SELECTION order, not this list's order. */
export interface CryptoCatalogEntry {
  /** CoinGecko id — the stored/config vocabulary. */
  id: string
  symbol: string
  name: string
}

export const CRYPTO_CATALOG: readonly CryptoCatalogEntry[] = Object.freeze([
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'solana', symbol: 'SOL', name: 'Solana' },
  { id: 'ripple', symbol: 'XRP', name: 'XRP' },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano' },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB' },
  { id: 'tron', symbol: 'TRX', name: 'TRON' },
  { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche' },
  { id: 'polkadot', symbol: 'DOT', name: 'Polkadot' },
  { id: 'chainlink', symbol: 'LINK', name: 'Chainlink' },
  { id: 'litecoin', symbol: 'LTC', name: 'Litecoin' },
  { id: 'shiba-inu', symbol: 'SHIB', name: 'Shiba Inu' },
  { id: 'uniswap', symbol: 'UNI', name: 'Uniswap' },
  { id: 'stellar', symbol: 'XLM', name: 'Stellar' },
  { id: 'monero', symbol: 'XMR', name: 'Monero' },
  { id: 'cosmos', symbol: 'ATOM', name: 'Cosmos' },
  { id: 'bitcoin-cash', symbol: 'BCH', name: 'Bitcoin Cash' },
  { id: 'near', symbol: 'NEAR', name: 'NEAR' },
  { id: 'arbitrum', symbol: 'ARB', name: 'Arbitrum' },
  { id: 'optimism', symbol: 'OP', name: 'Optimism' },
  { id: 'pepe', symbol: 'PEPE', name: 'Pepe' },
  { id: 'tether', symbol: 'USDT', name: 'Tether' },
  { id: 'usd-coin', symbol: 'USDC', name: 'USD Coin' },
])

export const CRYPTO_CATALOG_IDS: ReadonlySet<string> = new Set(CRYPTO_CATALOG.map((entry) => entry.id))
