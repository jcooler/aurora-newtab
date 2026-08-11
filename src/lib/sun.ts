// NOAA solar position calculation — equation of time + declination from the
// Julian century (the Meeus-based formulas behind gml.noaa.gov/grad/solcalc/,
// NOAA's own solar calculator), then hour angle at the requested zenith.
// Rise/set use zenith 90.833° (geometric horizon + atmospheric refraction +
// the sun's apparent radius); golden hour uses 84° (the sun's center at +6°
// elevation). PURE — no `Date.now()`, no `new Date()` with no arguments;
// every input comes from the `date` argument the caller passes.

export interface SunTimes {
  sunrise: Date
  sunset: Date
  goldenHour: Date | null
}

const deg2rad = (deg: number): number => (deg * Math.PI) / 180
const rad2deg = (rad: number): number => (rad * 180) / Math.PI

// Julian day number at 0h UT of the given LOCAL calendar year/month(1-12)/day
// — Meeus's algorithm (treats Jan/Feb as months 13/14 of the previous year).
function julianDay(year: number, month: number, day: number): number {
  let y = year
  let m = month
  if (m <= 2) {
    y -= 1
    m += 12
  }
  const a = Math.floor(y / 100)
  const b = 2 - a + Math.floor(a / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5
}

function julianCentury(jd: number): number {
  return (jd - 2451545.0) / 36525.0
}

function geomMeanLongSun(t: number): number {
  const l0 = (280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360
  return l0 < 0 ? l0 + 360 : l0
}

function geomMeanAnomalySun(t: number): number {
  return 357.52911 + t * (35999.05029 - 0.0001537 * t)
}

function eccentricityEarthOrbit(t: number): number {
  return 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
}

function sunEqOfCenter(t: number): number {
  const mRad = deg2rad(geomMeanAnomalySun(t))
  return (
    Math.sin(mRad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mRad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mRad) * 0.000289
  )
}

function sunApparentLong(t: number): number {
  const trueLong = geomMeanLongSun(t) + sunEqOfCenter(t)
  const omega = 125.04 - 1934.136 * t
  return trueLong - 0.00569 - 0.00478 * Math.sin(deg2rad(omega))
}

function obliquityCorrection(t: number): number {
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))
  const meanObliquity = 23 + (26 + seconds / 60) / 60
  const omega = 125.04 - 1934.136 * t
  return meanObliquity + 0.00256 * Math.cos(deg2rad(omega))
}

// Solar declination, in degrees.
function sunDeclination(t: number): number {
  const e = obliquityCorrection(t)
  const lambda = sunApparentLong(t)
  return rad2deg(Math.asin(Math.sin(deg2rad(e)) * Math.sin(deg2rad(lambda))))
}

// Equation of time, in minutes.
function equationOfTime(t: number): number {
  const epsilon = obliquityCorrection(t)
  const l0 = geomMeanLongSun(t)
  const e = eccentricityEarthOrbit(t)
  const m = geomMeanAnomalySun(t)

  let y = Math.tan(deg2rad(epsilon) / 2)
  y *= y

  const sin2l0 = Math.sin(2 * deg2rad(l0))
  const sinm = Math.sin(deg2rad(m))
  const cos2l0 = Math.cos(2 * deg2rad(l0))
  const sin4l0 = Math.sin(4 * deg2rad(l0))
  const sin2m = Math.sin(2 * deg2rad(m))

  const eTime = y * sin2l0 - 2 * e * sinm + 4 * e * y * sinm * cos2l0 - 0.5 * y * y * sin4l0 - 1.25 * e * e * sin2m
  return rad2deg(eTime) * 4
}

// Hour angle (radians, always >= 0) at which the sun's center reaches
// `zenithDeg` from vertical that day at `latDeg`/`declDeg` — or `null` if it
// never does (polar day/night at zenith 90.833°; the sun never climbing to
// 6° elevation for golden hour's zenith 84°).
function hourAngle(latDeg: number, declDeg: number, zenithDeg: number): number | null {
  const latRad = deg2rad(latDeg)
  const declRad = deg2rad(declDeg)
  const zenithRad = deg2rad(zenithDeg)
  const cosHA = Math.cos(zenithRad) / (Math.cos(latRad) * Math.cos(declRad)) - Math.tan(latRad) * Math.tan(declRad)
  if (cosHA < -1 || cosHA > 1) return null
  return Math.acos(cosHA)
}

const RISE_SET_ZENITH = 90.833
const GOLDEN_HOUR_ZENITH = 84

/** NOAA solar calculation for sunrise, sunset, and evening golden hour (the
 *  moment the sun's center descends through +6° elevation). Solved in UTC
 *  for the LOCAL calendar day of `date` (this machine's timezone), returned
 *  as absolute `Date`s that display correctly wherever they're formatted.
 *  Returns `null` for polar day/night (no sunrise or no sunset that day at
 *  `lat`). `goldenHour` is `null` when the sun's elevation never reaches 6°
 *  that day (its noon peak stays below it) even though it still rises and
 *  sets. PURE — no `Date.now()`; the caller passes `date`. */
export function sunTimes(date: Date, lat: number, lon: number): SunTimes | null {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  const t = julianCentury(julianDay(year, month, day))
  const eqTime = equationOfTime(t)
  const decl = sunDeclination(t)

  const riseSetHA = hourAngle(lat, decl, RISE_SET_ZENITH)
  if (riseSetHA === null) return null

  const solarNoonUTCmin = 720 - 4 * lon - eqTime
  const sunriseMin = solarNoonUTCmin - 4 * rad2deg(riseSetHA)
  const sunsetMin = solarNoonUTCmin + 4 * rad2deg(riseSetHA)

  const goldenHA = hourAngle(lat, decl, GOLDEN_HOUR_ZENITH)
  const goldenMin = goldenHA === null ? null : solarNoonUTCmin + 4 * rad2deg(goldenHA)

  const dayStartUTC = Date.UTC(year, month - 1, day)
  const toDate = (minutesUTC: number): Date => new Date(dayStartUTC + minutesUTC * 60_000)

  return {
    sunrise: toDate(sunriseMin),
    sunset: toDate(sunsetMin),
    goldenHour: goldenMin === null ? null : toDate(goldenMin),
  }
}
