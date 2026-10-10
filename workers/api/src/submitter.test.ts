import { describe, expect, it } from 'vitest';

import { submitterHash } from './submitter';

describe('submitterHash', () => {
  it('produces a 64-char lowercase hex string', async () => {
    // Arrange
    const now = new Date('2026-08-20T10:00:00.000Z');

    // Act
    const hash = await submitterHash('secret', '1.2.3.4', 'ua-a', now);

    // Assert
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same hash for the same (day, ip, ua)', async () => {
    // Arrange
    const now = new Date('2026-08-20T10:00:00.000Z');

    // Act
    const a = await submitterHash('secret', '1.2.3.4', 'ua-a', now);
    const b = await submitterHash('secret', '1.2.3.4', 'ua-a', now);

    // Assert
    expect(a).toBe(b);
  });

  it('produces a different hash for a different UTC day', async () => {
    // Arrange
    const day1 = new Date('2026-08-20T23:59:59.000Z');
    const day2 = new Date('2026-08-21T00:00:01.000Z');

    // Act
    const a = await submitterHash('secret', '1.2.3.4', 'ua-a', day1);
    const b = await submitterHash('secret', '1.2.3.4', 'ua-a', day2);

    // Assert
    expect(a).not.toBe(b);
  });

  it('produces a different hash for a different ip', async () => {
    // Arrange
    const now = new Date('2026-08-20T10:00:00.000Z');

    // Act
    const a = await submitterHash('secret', '1.2.3.4', 'ua-a', now);
    const b = await submitterHash('secret', '5.6.7.8', 'ua-a', now);

    // Assert
    expect(a).not.toBe(b);
  });
});
