const encoder = new TextEncoder()

function invalid(): never {
  throw new Error('sync_canonical_value_invalid')
}

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid()
    return JSON.stringify(value)
  }
  if (typeof value !== 'object') invalid()
  if (ancestors.has(value)) invalid()

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const entries: string[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) invalid()
        entries.push(serialize(value[index], ancestors))
      }
      return `[${entries.join(',')}]`
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) invalid()
    const record = value as Record<string, unknown>
    const descriptors = Object.getOwnPropertyDescriptors(record)
    const keys = Object.keys(record).sort()
    const entries = keys.map((key) => {
      const descriptor = descriptors[key]
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) invalid()
      return `${JSON.stringify(key)}:${serialize(descriptor.value, ancestors)}`
    })
    return `{${entries.join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

export function canonicalJson(value: unknown): string {
  return serialize(value, new Set())
}

export function canonicalUtf8(value: unknown): Uint8Array {
  return encoder.encode(canonicalJson(value))
}
