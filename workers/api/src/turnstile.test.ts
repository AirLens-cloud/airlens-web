import { afterEach, describe, expect, it, vi } from 'vitest';

import { sanitizeTurnstileErrorCodes, verifyTurnstile } from './turnstile';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verifyTurnstile', () => {
  it('returns success on a passing siteverify response', async () => {
    // Arrange
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    );

    // Act
    const result = await verifyTurnstile('secret', 'tok', '1.2.3.4');

    // Assert
    expect(result).toEqual({ success: true, errorCodes: [] });
  });

  it('returns failure with error codes on a failing siteverify response', async () => {
    // Arrange
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
            status: 200,
          }),
      ),
    );

    // Act
    const result = await verifyTurnstile('secret', 'tok', '1.2.3.4');

    // Assert
    expect(result).toEqual({ success: false, errorCodes: ['invalid-input-response'] });
  });

  it('fails closed when the network request throws', async () => {
    // Arrange
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    // Act
    const result = await verifyTurnstile('secret', 'tok', '1.2.3.4');

    // Assert
    expect(result).toEqual({ success: false, errorCodes: ['verify_unavailable'] });
  });

  it('fails closed on a non-2xx response', async () => {
    // Arrange
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('server error', { status: 500 })),
    );

    // Act
    const result = await verifyTurnstile('secret', 'tok', '1.2.3.4');

    // Assert
    expect(result).toEqual({ success: false, errorCodes: ['verify_unavailable'] });
  });
});

describe('sanitizeTurnstileErrorCodes', () => {
  it('passes allowlisted codes through unchanged', () => {
    // Arrange / Act
    const result = sanitizeTurnstileErrorCodes(['invalid-input-response']);

    // Assert
    expect(result).toEqual(['invalid-input-response']);
  });

  it('passes both allowlisted codes through when both are present', () => {
    // Arrange / Act
    const result = sanitizeTurnstileErrorCodes(['invalid-input-response', 'timeout-or-duplicate']);

    // Assert
    expect(result.sort()).toEqual(['invalid-input-response', 'timeout-or-duplicate']);
  });

  it('generalizes a non-allowlisted code to verification_failed', () => {
    // Arrange / Act
    const result = sanitizeTurnstileErrorCodes(['invalid-input-secret']);

    // Assert
    expect(result).toEqual(['verification_failed']);
  });

  it('generalizes our own verify_unavailable code (not exposed as-is)', () => {
    // Arrange / Act
    const result = sanitizeTurnstileErrorCodes(['verify_unavailable']);

    // Assert
    expect(result).toEqual(['verification_failed']);
  });

  it('deduplicates when a mix of unsafe codes all collapse to verification_failed', () => {
    // Arrange / Act
    const result = sanitizeTurnstileErrorCodes(['internal-error', 'invalid-input-secret']);

    // Assert
    expect(result).toEqual(['verification_failed']);
  });

  it('keeps the safe code and generalizes the unsafe one when mixed', () => {
    // Arrange / Act
    const result = sanitizeTurnstileErrorCodes(['invalid-input-response', 'internal-error']);

    // Assert
    expect(result.sort()).toEqual(['invalid-input-response', 'verification_failed']);
  });

  it('returns verification_failed for an empty code list', () => {
    // Arrange / Act
    const result = sanitizeTurnstileErrorCodes([]);

    // Assert
    expect(result).toEqual(['verification_failed']);
  });
});
