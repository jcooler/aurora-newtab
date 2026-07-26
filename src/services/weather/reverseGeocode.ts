/** One-time reverse geocode used ONLY when the user picks "Use my location",
 *  so the widget can show a real place name instead of "My location".
 *  BigDataCloud's client endpoint is free and keyless. Failure is soft —
 *  callers fall back to a generic label. */
export async function reverseGeocode(
  lat: number,
  lon: number,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${lat}&longitude=${lon}&localityLanguage=en`
  try {
    const res = await fetchFn(url)
    if (!res.ok) return null
    const data = await res.json()
    return data.city || data.locality || data.principalSubdivision || null
  } catch {
    return null
  }
}
