export type CatalogTier = 'compact' | 'standard' | 'full' | 'docked'
export interface CatalogEntry {
  readonly id: string
  readonly label: string
  readonly tiers: readonly CatalogTier[]
}
export type CatalogContract = Readonly<Partial<Record<CatalogTier, string>>>

export const CATALOG_BATCHES: Readonly<Record<'1' | '2', readonly CatalogEntry[]>>
export const CATALOG_CONTRACTS: Readonly<Record<'1' | '2', Readonly<Record<string, CatalogContract>>>>
export const CODED_DOCK_LINES: ReadonlySet<string>
export function captureTiersFor(
  id: string,
  batches?: Readonly<Record<string, readonly CatalogEntry[]>>,
): readonly CatalogTier[]
