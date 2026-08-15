const EXPLICIT_SCHEME = /^([a-z][a-z0-9+.-]*):(.*)$/i

function parsedHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return null
    if (parsed.username || parsed.password) return null
    return parsed
  } catch {
    return null
  }
}

export function isSafeQuickLinkUrl(raw: string): boolean {
  const trimmed = raw.trim()
  return /^https?:\/\//i.test(trimmed) && parsedHttpUrl(trimmed) !== null
}

export function normalizeQuickLinkUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const scheme = trimmed.match(EXPLICIT_SCHEME)
  let candidate: string
  if (!scheme) {
    candidate = `https://${trimmed}`
  } else {
    const name = scheme[1].toLowerCase()
    if (name === 'http' || name === 'https') {
      candidate = trimmed
    } else {
      const rest = scheme[2]
      const isBareHostPort =
        (name === 'localhost' || name.includes('.')) && /^\d+(?:[/?#]|$)/.test(rest)
      if (!isBareHostPort) return null
      candidate = `https://${trimmed}`
    }
  }

  return parsedHttpUrl(candidate) ? candidate : null
}
