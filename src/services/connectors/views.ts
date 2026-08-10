// src/services/connectors/views.ts — the ONE generic behind every connector's
// per-section view toggles. Wave 1 shipped this logic once, inline, as
// github.ts's resolveGithubViews (Task 71/72); wave 2 generalizes it so
// gitlab/jira/vercel share the exact same resolution rule rather than each
// hand-rolling their own copy.
//
// The rule (unchanged from wave 1): every key comes from `defaults` UNLESS
// `stored` carries an actual boolean for that key. A missing key, an absent/
// null `stored` container, or a corrupted non-boolean value (a hand-edited
// backup JSON) all fall back to the default — so a section can never vanish
// for lack of a key or a bad value, and a config saved before a new view
// existed still resolves every field.
export function resolveViews<V extends Record<string, boolean>>(
  defaults: V,
  stored: Partial<V> | null | undefined,
): V {
  const result = { ...defaults }
  for (const key of Object.keys(defaults) as (keyof V)[]) {
    const value = stored?.[key]
    if (typeof value === 'boolean') result[key] = value as V[keyof V]
  }
  return result
}
