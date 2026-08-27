/** Future licensing hook: everything premium gates on this one function.
 *  Hardcoded `true` today — layout editing was the first feature to read
 *  it, and it should stay the ONLY switch any future paid-tier check needs
 *  to flip. Every layout-editing entry point (currently `useLongPress`;
 *  NL-P3's live edit session next) calls this — never a local copy of the
 *  same idea. */
export function isPremium(): boolean {
  return true
}
