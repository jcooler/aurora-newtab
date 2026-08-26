import type { GeoMatch } from '../../../services/weather/types'

const US_REGION_CODES: Readonly<Record<string, string>> = Object.freeze({
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
  'american samoa': 'AS', guam: 'GU', 'northern mariana islands': 'MP', 'puerto rico': 'PR',
  'united states minor outlying islands': 'UM', 'u.s. virgin islands': 'VI',
  'united states virgin islands': 'VI',
})

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function formatGeoMatchLabel(match: GeoMatch): string {
  const city = clean(match.name)
  const region = clean(match.admin1)
  const country = clean(match.country)
  const us = /^(united states(?: of america)?|us|usa)$/i.test(country)
  const regionLabel = us ? US_REGION_CODES[region.toLocaleLowerCase('en-US')] ?? region : region
  const suffix = regionLabel || (country.toLocaleLowerCase('en-US') === city.toLocaleLowerCase('en-US') ? '' : country)
  return suffix ? `${city}, ${suffix}` : city
}
