import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMetricSamples } from '../src/handlers/update.js';
import { saveMetricsHistory } from '../src/database/schema.js';
import { buildHistoryId } from '../src/database/indexOptimization.js';

test('normalizeMetricSamples clamps future timestamps (s/ms) and clears future boot_time', () => {
  const before = Date.now();
  const futureMs = before + 8 * 3600 * 1000;
  const futureSec = Math.floor(futureMs / 1000);
  const pastMs = before - 3600 * 1000;
  const pastBoot = String(before - 24 * 3600 * 1000);

  const result = normalizeMetricSamples({
    samples: [
      { ts: futureMs, metrics: { cpu: 100, boot_time: String(futureMs) } },
      { ts: futureSec, metrics: { cpu: 50, boot_time: String(futureSec) } },
      { ts: pastMs, metrics: { cpu: 10, boot_time: pastBoot } }
    ]
  });
  const after = Date.now();

  assert.equal(result.length, 3);
  assert.equal(result[0].ts, pastMs);
  assert.equal(result[0].metrics.boot_time, pastBoot);

  for (const item of result.slice(1)) {
    assert.ok(item.ts >= before && item.ts <= after, `expected clamped ts in [${before}, ${after}], got ${item.ts}`);
    assert.equal(item.metrics.boot_time, '');
  }
});

test('normalizeMetricSamples sanitizes future boot_time in single metrics fallback', () => {
  const now = Date.now();
  const futureMs = now + 5 * 3600 * 1000;
  const result = normalizeMetricSamples({
    metrics: { timestamp: futureMs, cpu: 12, boot_time: String(futureMs) }
  });
  assert.equal(result.length, 1);
  assert.ok(result[0].ts <= Date.now() + 1000);
  assert.equal(result[0].metrics.boot_time, '');
});

test('saveMetricsHistory clamps future timestamp for both historyId and row timestamp, and drops future boot_time', async () => {
  const boundCalls = [];
  const db = {
    prepare() {
      return {
        bind(...args) {
          boundCalls.push(args);
          return { async run() { return { success: true }; } };
        }
      };
    }
  };

  const before = Date.now();
  const futureMs = before + 8 * 3600 * 1000;
  await saveMetricsHistory(db, 'srv-1', 7, { cpu: 99, boot_time: String(futureMs) }, 'CN', futureMs, 'v1.1.4');
  const after = Date.now();

  assert.equal(boundCalls.length, 1);
  const args = boundCalls[0];
  const [historyId, serverId, savedTs] = args;
  assert.equal(serverId, 'srv-1');
  assert.ok(savedTs >= before && savedTs <= after, `savedTs ${savedTs} should be clamped`);
  assert.equal(historyId, buildHistoryId(7, savedTs));
  assert.ok(!args.includes(String(futureMs)), 'future boot_time must not be written to D1');
});
