// Hand-rolled request body validation — no schema library (deps ban).

const SKY_CONDITIONS = ['clear', 'partly_cloudy', 'overcast', 'hazy', 'dusty', 'rainy'] as const;
type SkyCondition = (typeof SKY_CONDITIONS)[number];

export interface ObservationInput {
  turnstile_token: string;
  latitude: number;
  longitude: number;
  pm25_estimate: number | null;
  sky_condition: SkyCondition;
  memo: string | null;
}

export interface TrainingSampleInput {
  turnstile_token: string;
  location_lat: number;
  location_lon: number;
  local_taken_at: string;
  emotion_score: number;
  weather: Record<string, unknown>;
  aqi: Record<string, unknown>;
  sensory_tags: Record<string, boolean>;
  /** Always null — see parseTrainingSample: any provided value is a 400 until Phase 2b. */
  sky_crop_key: null;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; field: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumberInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

function asRecord(body: unknown): Record<string, unknown> | null {
  return isPlainObject(body) ? body : null;
}

export function parseObservation(body: unknown): ParseResult<ObservationInput> {
  const b = asRecord(body);
  if (!b) {
    return { ok: false, field: 'body' };
  }

  const turnstile_token = b.turnstile_token;
  if (typeof turnstile_token !== 'string' || turnstile_token.length === 0 || turnstile_token.length > 2048) {
    return { ok: false, field: 'turnstile_token' };
  }

  if (!isFiniteNumberInRange(b.latitude, -90, 90)) {
    return { ok: false, field: 'latitude' };
  }
  if (!isFiniteNumberInRange(b.longitude, -180, 180)) {
    return { ok: false, field: 'longitude' };
  }

  let pm25_estimate: number | null = null;
  if (b.pm25_estimate !== null && b.pm25_estimate !== undefined) {
    if (!isFiniteNumberInRange(b.pm25_estimate, 0, 1000)) {
      return { ok: false, field: 'pm25_estimate' };
    }
    pm25_estimate = b.pm25_estimate;
  }

  if (typeof b.sky_condition !== 'string' || !SKY_CONDITIONS.includes(b.sky_condition as SkyCondition)) {
    return { ok: false, field: 'sky_condition' };
  }
  const sky_condition = b.sky_condition as SkyCondition;

  let memo: string | null = null;
  if (b.memo !== null && b.memo !== undefined) {
    if (typeof b.memo !== 'string' || b.memo.length > 500) {
      return { ok: false, field: 'memo' };
    }
    const trimmed = b.memo.trim();
    memo = trimmed === '' ? null : trimmed;
  }

  return {
    ok: true,
    data: { turnstile_token, latitude: b.latitude, longitude: b.longitude, pm25_estimate, sky_condition, memo },
  };
}

export function parseTrainingSample(body: unknown): ParseResult<TrainingSampleInput> {
  const b = asRecord(body);
  if (!b) {
    return { ok: false, field: 'body' };
  }

  const turnstile_token = b.turnstile_token;
  if (typeof turnstile_token !== 'string' || turnstile_token.length === 0 || turnstile_token.length > 2048) {
    return { ok: false, field: 'turnstile_token' };
  }

  if (!isFiniteNumberInRange(b.location_lat, -90, 90)) {
    return { ok: false, field: 'location_lat' };
  }
  if (!isFiniteNumberInRange(b.location_lon, -180, 180)) {
    return { ok: false, field: 'location_lon' };
  }

  if (typeof b.local_taken_at !== 'string' || b.local_taken_at.length > 40 || !Number.isFinite(Date.parse(b.local_taken_at))) {
    return { ok: false, field: 'local_taken_at' };
  }

  if (typeof b.emotion_score !== 'number' || !Number.isInteger(b.emotion_score) || b.emotion_score < 1 || b.emotion_score > 5) {
    return { ok: false, field: 'emotion_score' };
  }

  if (!isPlainObject(b.weather) || JSON.stringify(b.weather).length > 8192) {
    return { ok: false, field: 'weather' };
  }
  if (!isPlainObject(b.aqi) || JSON.stringify(b.aqi).length > 8192) {
    return { ok: false, field: 'aqi' };
  }

  if (!isPlainObject(b.sensory_tags)) {
    return { ok: false, field: 'sensory_tags' };
  }
  const sensoryEntries = Object.entries(b.sensory_tags);
  if (sensoryEntries.length > 50 || sensoryEntries.some(([, v]) => typeof v !== 'boolean')) {
    return { ok: false, field: 'sensory_tags' };
  }
  if (JSON.stringify(b.sensory_tags).length > 2048) {
    return { ok: false, field: 'sensory_tags' };
  }
  const sensory_tags = b.sensory_tags as Record<string, boolean>;

  // sky_crop_key is rejected outright, not merely format-validated: Phase 2b
  // (the R2 upload endpoint) hasn't shipped, so there is no upload flow that
  // could have produced a real key and no prefix/namespace contract for one
  // yet — accepting a client-supplied value now would just store a dangling
  // reference. `null`/absent is the only accepted form until Phase 2b lands.
  if (b.sky_crop_key !== null && b.sky_crop_key !== undefined) {
    return { ok: false, field: 'sky_crop_key' };
  }

  return {
    ok: true,
    data: {
      turnstile_token,
      location_lat: b.location_lat,
      location_lon: b.location_lon,
      local_taken_at: b.local_taken_at,
      emotion_score: b.emotion_score,
      weather: b.weather,
      aqi: b.aqi,
      sensory_tags,
      sky_crop_key: null,
    },
  };
}
