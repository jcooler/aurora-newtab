export default function PermissionCleanupAlert({
  pendingPatterns,
  onRetry,
  retrying,
}: {
  pendingPatterns: readonly string[]
  onRetry: () => void
  retrying: boolean
}) {
  if (pendingPatterns.length === 0) return null

  return (
    <div role="alert" className="mb-4 rounded-xl border border-control-border p-3 text-xs text-fg-muted">
      <p>A site permission could not be removed yet. Tab Two will keep it only until cleanup succeeds.</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-2 rounded px-2 py-1 text-accent hover:text-fg disabled:opacity-50 max-[420px]:min-h-9 max-[420px]:min-w-9"
      >
        Retry permission cleanup
      </button>
    </div>
  )
}
