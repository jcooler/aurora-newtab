export function formatClock(d: Date, use24Hour: boolean): string {
  const minutes = String(d.getMinutes()).padStart(2, '0')
  if (use24Hour) return `${String(d.getHours()).padStart(2, '0')}:${minutes}`
  const hours = d.getHours() % 12 || 12
  return `${hours}:${minutes}`
}

export function formatDayContext(d: Date, detail: 'compact' | 'long'): string {
  return new Intl.DateTimeFormat('en-US', detail === 'compact'
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { weekday: 'long', month: 'long', day: 'numeric' }).format(d)
}

export function greetingFor(hour: number, name: string): string {
  const part =
    hour >= 5 && hour < 12
      ? 'Good morning'
      : hour >= 12 && hour < 18
        ? 'Good afternoon'
        : 'Good evening'
  return name ? `${part}, ${name}.` : `${part}.`
}
