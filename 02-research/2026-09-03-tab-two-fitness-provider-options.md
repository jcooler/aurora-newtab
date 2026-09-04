# Tab Two Fitness Provider Options

**Date:** 2026-09-03

**Status:** Research only. No provider is approved for implementation, paid-MVP
scope, registration, permissions, credentials, hosted state, cost, advertising,
or launch dependency.

## Quick summary

Strava should remain on hold and should not be silently replaced in the paid
MVP. Fitbit is the best first provider to investigate for broad daily activity
metrics, while WHOOP and Polar are credible device-specific alternatives with
clearer current developer paths. MyFitnessPal is better treated as a future
nutrition expansion because its API is private and available only to approved
partners.

No fitness connector is required for the paid MVP. PM-P9 stabilization should
continue while any future fitness provider moves through a separate commercial,
privacy, design, and owner-approval track.

## Evaluation criteria

Each candidate was checked against Tab Two's current requirements:

- A supported OAuth flow for third-party customer accounts.
- Read-only daily aggregates or workout summaries without GPS routes.
- A credible path for a paid commercial product.
- Self-service development or a realistic production-review path.
- Low initial cost compatible with a USD 1.99 monthly product.
- Narrow scopes, deletion support, and no need to place secrets in the extension.
- Compatibility with a Chrome extension plus the existing Supabase broker.

## Ranked candidates

| Rank | Provider | Current fit | Why it matters | Main blocker or gate |
|---|---|---|---|---|
| 1 | Fitbit | Best first diligence candidate | Public Web API, self-service application registration, OAuth, daily activity summaries, time series, subscriptions, and a single `activity` scope can provide steps, distance, calories, elevation, and active minutes without intraday or route access. Current platform terms permit external applications and do not contain Strava's blanket prohibition on charging users. | Obtain written confirmation that Tab Two may place its own cross-signal summaries behind a paid plan. Use daily aggregates only, satisfy source attribution and account-link requirements, and complete the required privacy, retention, and deletion disclosures. |
| 2 | WHOOP | Strong premium-product fit | Public OAuth API has narrow read scopes for workouts, cycles, recovery, and sleep. Current terms explicitly allow charging for application functionality that WHOOP itself does not provide. API access is currently free, and development supports up to ten WHOOP members before app approval. | The developer must have a WHOOP account and device. Production beyond ten members requires review, and Tab Two must avoid permanent raw-data copies and obey provider cache controls. |
| 3 | Polar | Strong low-cost technical fallback | Any registered Polar Flow user can create an AccessLink client. The current v4 API has granular scopes such as `activity:read` and `training_sessions:read`; access is currently free, and the agreement contemplates proprietary applications and services. | Device-specific audience, provider attribution, consent and deletion obligations, and future fee risk. Confirm that paid Tab Two summaries fit the license before implementation. |
| 4 | MyFitnessPal | Valuable separate nutrition expansion | OAuth partner API can expose diary, measurement, and exercise resources. Nutrition consistency could add a distinct daily signal rather than duplicate workout tracking. | The API is private and limited to approved developers. MyFitnessPal directs applicants to email company and use-case details and separately request current API terms. It is not a dependable near-term Strava replacement. |
| 5 | Withings | Possible health-measurement expansion | OAuth-accessible health and body measurements could support wellness trends. | Standard terms prohibit unattended API queries unless otherwise agreed in writing, which conflicts with automatic background metrics. It is not the first choice for Tab Two's current UX. |

## Providers not recommended now

| Provider | Disposition | Reason |
|---|---|---|
| Garmin | Hold | The Health API requires application approval and a commercial license fee. Its public positioning is oriented toward corporate wellness, population health, and patient monitoring. |
| COROS | Hold | The multi-user Partner API currently requires an established platform, demonstrated user base, registered company, and authorized technical representative. |
| Oura | Reject for paid connector under current terms | Although the API is technically strong and free to call, the API agreement effective 2026-06-08 prohibits charging users for functionality related to the Oura API or platform. This recreates the Strava conflict. |
| Apple Health | Not browser-compatible | HealthKit data access requires an iOS or watchOS application and Apple capabilities. A future native companion could change this assessment. |
| Health Connect | Not browser-compatible | Health Connect is an Android-only on-device API. A future Android companion could change this assessment. |
| Terra | Economically unsuitable now | It covers many providers through one API, but the current direct plan starts at USD 499 monthly or USD 399 monthly when billed annually. That is incompatible with the current MVP price and scale. |

## What this means

The strongest product sequence is:

1. Keep fitness outside the paid-MVP launch gate and complete PM-P9.
2. Ask Fitbit for written commercial confirmation using an exact, minimized
   proposal: customer-authorized daily activity totals, no routes, no raw
   provider history in Supabase, no data resale, and Tab Two-owned cross-signal
   summaries.
3. In parallel only after owner approval, confirm whether WHOOP or Polar test
   hardware and accounts are realistically available. Do not buy hardware for
   provider evaluation without a separate cost gate.
4. Treat MyFitnessPal as a later nutrition opportunity. Contact it only after a
   nutrition-specific value proposition is approved, because its application
   requires company and use-case information.
5. Bring one provider back through architectural design, original-resolution UI
   approval, least-privilege scope approval, local TDD, and a separately listed
   hosted activation gate.

## Risks and caveats

- Fitbit's posted platform terms were last revised in 2021. The public API is
  active, but written commercial confirmation is prudent before making it a
  paid-only feature.
- WHOOP and Oura expose provider-generated scores. Tab Two must not imply that
  these scores are medical advice or recreate a provider's own product.
- Health and fitness data is sensitive even when reduced to daily aggregates.
  Provider disconnect and account deletion must remove provider-derived data
  within the provider's required deadline, including encrypted synced copies.
- A public API and a development credential do not prove production approval.
- Provider terms, pricing, review limits, and endpoints can change. Revalidate
  them immediately before any design or registration gate.

## Recommended decision

Do not add any replacement to the paid MVP. Preserve the current two-provider
launch scope and move to PM-P9. For post-MVP fitness work, approve Fitbit as the
first commercial-clarification target, with WHOOP and Polar as the next two
technical candidates. Keep MyFitnessPal on the opportunity list as a separate
nutrition connector rather than a direct Strava substitute.

## Official sources

- Strava API Policy: <https://www.strava.com/legal/api_policy>
- Fitbit Web API Explorer: <https://dev.fitbit.com/build/reference/web-api/explore/>
- Fitbit Platform Terms: <https://dev.fitbit.com/new-developer/>
- Fitbit Intraday access boundary: <https://dev.fitbit.com/build/reference/web-api/intraday/get-activity-intraday-by-date-range/>
- WHOOP API terms: <https://developer.whoop.com/api-terms-of-use/>
- WHOOP app approval: <https://developer.whoop.com/docs/developing/app-approval/>
- WHOOP developer support: <https://developer.whoop.com/docs/developing/support/>
- Polar AccessLink v4: <https://www.polar.com/polar-api-v4/>
- Polar API license: <https://www.polar.com/en/legal/polar-api-agreement>
- MyFitnessPal Developer Portal: <https://www.myfitnesspal.com/apps/api/version>
- MyFitnessPal partner API documentation: <https://myfitnesspalapi.com/docs/partner-authentication/>
- Withings API terms: <https://www.withings.com/in/fr/legal/api-terms-of-use>
- Garmin Health API: <https://developer.garmin.com/gc-developer-program/health-api/>
- COROS Partner API access: <https://support.coros.com/hc/en-us/articles/53181766856724-Partner-API-Access>
- Oura API agreement: <https://cloud.ouraring.com/legal/api-agreement>
- Apple HealthKit capability: <https://developer.apple.com/documentation/xcode/configuring-healthkit-access>
- Android Health Connect availability: <https://developer.android.com/health-and-fitness/health-connect/availability>
- Terra pricing: <https://tryterra.co/pricing>
