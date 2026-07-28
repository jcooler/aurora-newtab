/** True for a plain object — not null, not an array. Shared by every
 *  structural-shape check that needs to safely read named properties off an
 *  `unknown` value before trusting its shape (backup validation, storage
 *  migrations). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
