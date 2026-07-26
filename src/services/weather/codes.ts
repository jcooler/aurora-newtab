const TABLE: [codes: number[], label: string, icon: string][] = [
  [[0], 'Clear', '☀️'],
  [[1], 'Mostly clear', '🌤️'],
  [[2], 'Partly cloudy', '⛅'],
  [[3], 'Overcast', '☁️'],
  [[45, 48], 'Fog', '🌫️'],
  [[51, 53, 55, 56, 57], 'Drizzle', '🌦️'],
  [[61, 63, 65, 66, 67], 'Rain', '🌧️'],
  [[71, 73, 75, 77], 'Snow', '🌨️'],
  [[80, 81, 82], 'Showers', '🌧️'],
  [[85, 86], 'Snow showers', '🌨️'],
  [[95, 96, 99], 'Thunderstorm', '⛈️'],
]

export function describeCode(code: number): { label: string; icon: string } {
  for (const [codes, label, icon] of TABLE) {
    if (codes.includes(code)) return { label, icon }
  }
  return { label: 'Cloudy', icon: '☁️' }
}
