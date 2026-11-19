import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOperationalDate, formatOperationalTimestamp, parseStoredDate } from '../src/lib/display-time';

test('operational dates and timestamps retain the same UTC day across runtime timezones', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['America/New_York', 'Pacific/Honolulu', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      const instant = '2026-11-15T00:30:00.000Z';
      assert.equal(formatOperationalDate(instant), 'Nov 15, 2026');
      assert.equal(formatOperationalDate('2026-12-15'), 'Dec 15, 2026', 'calendar renewal dates must not shift to the previous day');
      assert.equal(formatOperationalTimestamp(instant), 'Nov 15, 2026, 12:30 AM UTC');
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('legacy D1 date text and new ISO writes yield a valid member year', () => {
  const epoch = Date.UTC(2026, 10, 15);
  assert.equal(parseStoredDate(String(epoch))?.getUTCFullYear(), 2026);
  assert.equal(parseStoredDate(`${epoch}.0`)?.getUTCFullYear(), 2026);
  assert.equal(parseStoredDate(new Date(epoch).toISOString())?.getUTCFullYear(), 2026);
  assert.equal(parseStoredDate(new Date(NaN)), null);
  assert.equal(parseStoredDate('invalid'), null);
});
