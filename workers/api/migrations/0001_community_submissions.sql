-- 0001_community_submissions — Track 2 Phase 2 anonymous submission pipeline.
--
-- D1 (SQLite) siblings of the Supabase tables, redesigned for the anonymous
-- model: no user_id anywhere — abuse attribution is submitter_hash, an
-- HMAC-SHA256 of (UTC day : client IP : user agent) keyed by the
-- SUBMITTER_HASH_SECRET worker secret. The daily component rotates the hash
-- so it cannot track a submitter across days.
--
-- Applied with: npx wrangler d1 migrations apply airlens-db --remote

CREATE TABLE community_observations (
  id TEXT PRIMARY KEY,                    -- uuid v4 (crypto.randomUUID)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  pm25_estimate REAL CHECK (pm25_estimate IS NULL OR pm25_estimate BETWEEN 0 AND 1000),
  sky_condition TEXT NOT NULL CHECK (
    sky_condition IN ('clear', 'partly_cloudy', 'overcast', 'hazy', 'dusty', 'rainy')
  ),
  memo TEXT,                              -- NULL when empty; app-side length cap
  photo_key TEXT,                         -- R2 object key (Phase 2b — unused for now)
  submitter_hash TEXT NOT NULL,           -- HMAC(day:ip:ua) — never a raw IP/UA
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (
    status IN ('pending_review', 'approved', 'rejected')
  ),
  moderated_at TEXT,
  rejection_reason TEXT
);

-- Admin review queue reads (Phase 3) and public approved reads.
CREATE INDEX idx_community_observations_status_created
  ON community_observations (status, created_at DESC);

-- Per-submitter daily lookups (abuse review; hash rotates daily).
CREATE INDEX idx_community_observations_submitter
  ON community_observations (submitter_hash, created_at);

-- Moderation audit log (Phase 3 writes; mirrors the Supabase audit_log intent).
CREATE TABLE moderation_queue (
  id TEXT PRIMARY KEY,                    -- uuid v4
  observation_id TEXT NOT NULL REFERENCES community_observations (id),
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
  reason TEXT,
  actor TEXT NOT NULL,                    -- Cloudflare Access identity email (Phase 3)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_moderation_queue_observation
  ON moderation_queue (observation_id);

-- Anonymous training-sample contributions (sibling of contribute-training-sample).
-- JSON payloads stored as TEXT (json1-compatible); validated in the worker.
CREATE TABLE community_training_samples (
  id TEXT PRIMARY KEY,                    -- uuid v4
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  location_lat REAL NOT NULL CHECK (location_lat BETWEEN -90 AND 90),
  location_lon REAL NOT NULL CHECK (location_lon BETWEEN -180 AND 180),
  local_taken_at TEXT NOT NULL,           -- ISO 8601 from the client
  emotion_score INTEGER NOT NULL CHECK (emotion_score BETWEEN 1 AND 5),
  weather TEXT NOT NULL,                  -- JSON object
  aqi TEXT NOT NULL,                      -- JSON object
  sensory_tags TEXT NOT NULL,             -- JSON object<string, boolean>
  sky_crop_key TEXT,                      -- R2 object key (Phase 2b — unused for now)
  submitter_hash TEXT NOT NULL
);

CREATE INDEX idx_community_training_samples_created
  ON community_training_samples (created_at DESC);
