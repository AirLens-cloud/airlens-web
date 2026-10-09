import { describe, expect, it } from 'vitest';

import { parseObservation, parseTrainingSample } from './validate';

function validObservation(): Record<string, unknown> {
  return {
    turnstile_token: 'tok-123',
    latitude: 37.5,
    longitude: 127.0,
    pm25_estimate: 12.3,
    sky_condition: 'clear',
    memo: 'hazy today',
  };
}

function validTrainingSample(): Record<string, unknown> {
  return {
    turnstile_token: 'tok-123',
    location_lat: 37.5,
    location_lon: 127.0,
    local_taken_at: '2026-08-20T09:00:00.000Z',
    emotion_score: 3,
    weather: { temp_c: 24 },
    aqi: { pm25: 12 },
    sensory_tags: { dusty: true, clear_sky: false },
    // sky_crop_key intentionally absent — Phase 2b (R2 upload) hasn't
    // shipped, so any provided value is a validation error (see below).
  };
}

describe('parseObservation', () => {
  it('accepts a fully valid observation', () => {
    // Arrange
    const body = validObservation();

    // Act
    const result = parseObservation(body);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.sky_condition).toBe('clear');
      expect(result.data.pm25_estimate).toBe(12.3);
      expect(result.data.memo).toBe('hazy today');
    }
  });

  it('accepts null pm25_estimate and empty memo, normalizing memo to null', () => {
    // Arrange
    const body = { ...validObservation(), pm25_estimate: null, memo: '   ' };

    // Act
    const result = parseObservation(body);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pm25_estimate).toBeNull();
      expect(result.data.memo).toBeNull();
    }
  });

  it('rejects a non-object body', () => {
    // Arrange / Act
    const result = parseObservation('not an object');

    // Assert
    expect(result).toEqual({ ok: false, field: 'body' });
  });

  it('rejects an empty turnstile_token', () => {
    // Arrange
    const body = { ...validObservation(), turnstile_token: '' };

    // Act
    const result = parseObservation(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'turnstile_token' });
  });

  it('rejects out-of-range latitude', () => {
    // Arrange
    const body = { ...validObservation(), latitude: 91 };

    // Act
    const result = parseObservation(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'latitude' });
  });

  it('rejects out-of-range longitude', () => {
    // Arrange
    const body = { ...validObservation(), longitude: -181 };

    // Act
    const result = parseObservation(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'longitude' });
  });

  it('rejects out-of-range pm25_estimate', () => {
    // Arrange
    const body = { ...validObservation(), pm25_estimate: 1001 };

    // Act
    const result = parseObservation(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'pm25_estimate' });
  });

  it('rejects an invalid sky_condition', () => {
    // Arrange
    const body = { ...validObservation(), sky_condition: 'tornado' };

    // Act
    const result = parseObservation(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'sky_condition' });
  });

  it('rejects a memo over 500 chars', () => {
    // Arrange
    const body = { ...validObservation(), memo: 'x'.repeat(501) };

    // Act
    const result = parseObservation(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'memo' });
  });
});

describe('parseTrainingSample', () => {
  it('accepts a fully valid training sample with sky_crop_key omitted', () => {
    // Arrange
    const body = validTrainingSample();

    // Act
    const result = parseTrainingSample(body);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.emotion_score).toBe(3);
      expect(result.data.sky_crop_key).toBeNull();
    }
  });

  it('accepts an explicit null sky_crop_key', () => {
    // Arrange
    const body = { ...validTrainingSample(), sky_crop_key: null };

    // Act
    const result = parseTrainingSample(body);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.sky_crop_key).toBeNull();
    }
  });

  it('rejects a non-object body', () => {
    // Arrange / Act
    const result = parseTrainingSample(null);

    // Assert
    expect(result).toEqual({ ok: false, field: 'body' });
  });

  it('rejects out-of-range location_lat', () => {
    // Arrange
    const body = { ...validTrainingSample(), location_lat: -91 };

    // Act
    const result = parseTrainingSample(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'location_lat' });
  });

  it('rejects an unparsable local_taken_at', () => {
    // Arrange
    const body = { ...validTrainingSample(), local_taken_at: 'not-a-date' };

    // Act
    const result = parseTrainingSample(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'local_taken_at' });
  });

  it('rejects a non-integer emotion_score', () => {
    // Arrange
    const body = { ...validTrainingSample(), emotion_score: 3.5 };

    // Act
    const result = parseTrainingSample(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'emotion_score' });
  });

  it('rejects an out-of-range emotion_score', () => {
    // Arrange
    const body = { ...validTrainingSample(), emotion_score: 6 };

    // Act
    const result = parseTrainingSample(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'emotion_score' });
  });

  it('rejects an array for weather', () => {
    // Arrange
    const body = { ...validTrainingSample(), weather: [1, 2, 3] };

    // Act
    const result = parseTrainingSample(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'weather' });
  });

  it('rejects an oversized aqi payload', () => {
    // Arrange
    const body = { ...validTrainingSample(), aqi: { blob: 'x'.repeat(9000) } };

    // Act
    const result = parseTrainingSample(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'aqi' });
  });

  it('rejects sensory_tags with a non-boolean value', () => {
    // Arrange
    const body = { ...validTrainingSample(), sensory_tags: { dusty: 'yes' } };

    // Act
    const result = parseTrainingSample(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'sensory_tags' });
  });

  it('rejects sensory_tags with more than 50 keys', () => {
    // Arrange
    const tags: Record<string, boolean> = {};
    for (let i = 0; i < 51; i += 1) {
      tags[`tag${i}`] = true;
    }
    const body = { ...validTrainingSample(), sensory_tags: tags };

    // Act
    const result = parseTrainingSample(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'sensory_tags' });
  });

  it('rejects any provided sky_crop_key value — Phase 2b (R2 upload) has not shipped', () => {
    // Arrange
    const body = { ...validTrainingSample(), sky_crop_key: 'crops/2026/08/20/abc.jpg' };

    // Act
    const result = parseTrainingSample(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'sky_crop_key' });
  });

  it('rejects an empty-string sky_crop_key too — presence, not format, is what is rejected', () => {
    // Arrange
    const body = { ...validTrainingSample(), sky_crop_key: '' };

    // Act
    const result = parseTrainingSample(body);

    // Assert
    expect(result).toEqual({ ok: false, field: 'sky_crop_key' });
  });
});
