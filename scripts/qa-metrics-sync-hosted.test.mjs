import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertSafeHostedMetricsEvidence,
  createMetricBucketEntity,
} from './qa-metrics-sync-hosted.mjs'

test('creates the exact aggregate-only Metrics sync entity', () => {
  const entity = createMetricBucketEntity({
    bucketId: '00000000-0000-4000-8000-000000000002',
    installationId: '00000000-0000-4000-8000-000000000001',
    date: '2026-09-03',
  })

  assert.deepEqual(entity, {
    schemaVersion: 1,
    entityType: 'metric_bucket',
    entityId: '00000000-0000-4000-8000-000000000002',
    value: {
      schemaVersion: 1,
      date: '2026-09-03',
      source: 'tasks',
      sourceInstanceId: 'local-tasks',
      installationId: '00000000-0000-4000-8000-000000000001',
      sequence: 1,
      values: { kind: 'tasks', completed: 2, carriedForward: 1 },
    },
  })
  assert.doesNotMatch(JSON.stringify(entity), /(?:title|name|description|url|token|credential|raw)/iu)
})

test('rejects malformed Metrics fixture identifiers and dates', () => {
  const valid = {
    bucketId: '00000000-0000-4000-8000-000000000002',
    installationId: '00000000-0000-4000-8000-000000000001',
    date: '2026-09-03',
  }
  assert.throws(() => createMetricBucketEntity({ ...valid, bucketId: 'tasks:today' }), /metric_fixture_invalid/u)
  assert.throws(() => createMetricBucketEntity({ ...valid, installationId: 'Desktop' }), /metric_fixture_invalid/u)
  assert.throws(() => createMetricBucketEntity({ ...valid, date: '09\/03\/2026' }), /metric_fixture_invalid/u)
})

test('permits only redacted, metadata-only hosted evidence', () => {
  const evidence = {
    result: 'PASS',
    project: 'ovlobmvxtryitupxwylg',
    account: 'sha256:123456789abc',
    interactions: { aggregatePush: true },
    cleanup: { account: true, authUser: true },
  }
  assert.doesNotThrow(() => assertSafeHostedMetricsEvidence(evidence))
  assert.throws(
    () => assertSafeHostedMetricsEvidence({ ...evidence, ciphertext: 'private' }),
    /hosted_metrics_evidence_unsafe/u,
  )
  assert.throws(
    () => assertSafeHostedMetricsEvidence({ ...evidence, email: 'qa@example.invalid' }),
    /hosted_metrics_evidence_unsafe/u,
  )
})
