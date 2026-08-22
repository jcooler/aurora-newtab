# At-a-glance Provider Research

**Date:** 2026-08-22  
**Audience:** Aurora product and engineering  
**Scope:** On This Day, Public Holidays, Aurora & Kp, and severe-weather enrichment inside Weather

## TL;DR

All four approved capabilities are viable as direct, keyless browser requests with no new dependency. On This Day should use English Wikipedia's per-wiki REST route because Wikimedia began a gradual deprecation program for `api.wikimedia.org` in July 2026. Severe-weather alerts require their own NWS point request and freshness authority; Open-Meteo does not supply the official alert contract Aurora promised.

## Provider findings

### 1. On This Day

- Wikimedia documents the On This Day route as `GET /api/rest_v1/feed/onthisday/{type}/{MM}/{DD}` on each wiki domain. Month and day must be zero-padded. The `all` response supplies selected events, events, births, deaths, holidays, and linked page metadata.
- Wikimedia's centralized `api.wikimedia.org/feed/v1/...` route still works, but the official 2026 migration notice puts that host into gradual deprecation and maps it to the per-wiki equivalent.
- Aurora should therefore use `https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/{MM}/{DD}` and normalize a small bounded result. The local calendar day is the cache identity.
- Source quality: first-party Wikimedia documentation and migration notice.

Sources: [Wikifeeds API](https://www.mediawiki.org/wiki/Wikifeeds_API), [Wikimedia API Portal deprecation and endpoint map](https://wikitech.wikimedia.org/wiki/API_Portal/Deprecation)

### 2. Public Holidays

- Nager.Date exposes keyless HTTPS JSON endpoints for available countries and year/country public holidays. The public API response includes the English name, local name, date, global applicability, subdivision codes, and holiday types.
- A single-year request cannot answer the next-holiday question near year end, so Aurora must request the current and next local year together.
- This first wave should show national holidays only. Subdivision entries are unsafe to present without a user-selected subdivision, and the provider does not expose a complete friendly subdivision catalog through the same simple setup flow.
- Country choice is explicit. Aurora does not infer it from browser locale or Weather location.
- Source quality: first-party project repository and live public API response.

Source: [Nager.Date official repository](https://github.com/nager/Nager.Date)

### 3. Aurora & Kp

- NOAA SWPC publishes a small `noaa-planetary-k-index-forecast.json` product containing timestamped observed, estimated, and predicted Kp values plus the NOAA geomagnetic storm scale where applicable.
- Kp is a three-hour global geomagnetic activity index. It is not a promise that aurora will be visible at a specific address. Cloud, darkness, light pollution, and geomagnetic latitude still matter.
- Aurora should present current/estimated Kp, the next forecast peak, the three-day trend, and truthful activity guidance. It should not claim a location-specific visibility probability from Kp alone.
- The much larger OVATION aurora grid is not justified for this first glance widget.
- Source quality: first-party NOAA SWPC product index, live product, and K-index explainer.

Sources: [NOAA SWPC product index](https://services.swpc.noaa.gov/products/), [NOAA planetary K-index forecast JSON](https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json), [NOAA K-index explainer](https://www.swpc.noaa.gov/sites/default/files/images/u2/TheK-index.pdf)

### 4. Severe weather inside Weather

- NWS documents `GET https://api.weather.gov/alerts/active?point={lat},{lon}` as the point query that resolves both county and forecast-zone alerts. It is the official direct source for active US watches, warnings, and advisories.
- The response includes bounded public facts Aurora can use: event, severity, urgency, headline, affected area, onset/effective/expiry, description, instruction, and canonical alert URL.
- NWS alert freshness is materially shorter than Aurora's 30-minute forecast cache. Alerts need an independent five-minute cache and refresh schedule so Aurora does not refetch the full forecast and environmental feeds every five minutes.
- NWS coverage is regional. A point outside supported coverage must degrade silently to unsupported, not become a global Weather failure and not display a false `No alerts` claim.
- This corrects the expansion catalog's earlier assumption that severe alerts could use the accepted Weather provider without another origin. The capability remains absorbed into Weather, but it owns one separate optional request/cache.
- Source quality: first-party NWS API documentation and alert geolocation guide.

Sources: [NWS API Web Service](https://www.weather.gov/documentation/services-web-api), [NWS Alerts Geolocation Guide](https://www.weather.gov/media/documentation/docs/NWS_Geolocation.pdf)

## Product synthesis

The three new widgets fit Aurora's existing connector snapshot authority even though they require no credential. That authority already provides mounted-only refresh, stale retention, exact config scope, cache exclusion from backup, and one data owner. They should appear to users under a new `At a glance` category, not as credential setup.

Weather alerts are different because Weather already owns the identity and interaction surface. A fourth widget would duplicate data ownership and violate the accepted design. A separate `weatherAlertCache` top-level cache, excluded from backup, gives alerts their correct freshness without changing the byte-compatible Open-Meteo forecast identity.

## Open questions resolved by design

- Language: English only for the first On This Day packet. Multilingual feeds are a later setting.
- Holiday subdivisions: national holidays only until Aurora can offer a friendly explicit subdivision picker.
- Aurora visibility: activity guidance, not a probability or guaranteed local sighting.
- Severe-weather geography: official NWS alerts where supported; no false global coverage.
- Images: On This Day remains text-first in this wave. Provider images do not justify extra layout weight or remote-image policy complexity.
