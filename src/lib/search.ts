export const ENGINES = {
  google: { label: 'Google', url: 'https://www.google.com/search?q=' },
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=' },
} as const

export function searchUrl(engine: keyof typeof ENGINES, query: string): string {
  return ENGINES[engine].url + encodeURIComponent(query.trim())
}
