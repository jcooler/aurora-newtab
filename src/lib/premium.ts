/** Future licensing hook: everything premium gates on this one function.
 *  Hardcoded `true` today — arrange mode is the first feature to read it,
 *  and it should stay the ONLY switch any future paid-tier check needs to
 *  flip. Every arrange-mode entry point (currently: `useLongPress`, plus a
 *  defensive re-check in `ArrangeController.beginDrag`) calls this — never
 *  a local copy of the same idea. */
export function isPremium(): boolean {
  return true
}
