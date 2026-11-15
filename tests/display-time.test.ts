import test from 'node:test';
import assert from 'node:assert/strict';
import { formatOperationalDate, formatOperationalTimestamp } from '../src/lib/display-time';

test('operational dates and timestamps retain the same UTC day across runtime timezones', () => {
  const original = process.env.TZ;
  try {
    for (const zone of ['America/New_York', 'Pacific/Honolulu', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      const instant = '2026-11-15T00:30:00.000Z';
      assert.equal(formatOperationalDate(instant), 'Nov 15, 2026');
      assert.equal(formatOperationalTimestamp(instant), 'Nov 15, 2026, 12:30 AM UTC');
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
