// Ported verbatim (whole file, including every TIME_SCALE/DECAY-adjacent
// tuning comment below) from AirLens-platform apps/landing-lab
// `src/concepts/particulate/shaders.ts` (Wave L2, 2026-08-26). No import
// paths to rebind — this module is pure GLSL string constants.
//
// GLSL for PARTICULATE — a semi-Lagrangian flow field.
//
// Why not a particle buffer? The obvious build is a ping-pong position texture read
// back in the *vertex* shader (the classic GPGPU-particles pattern). It renders
// nothing on any GL that cannot sample a float texture from a vertex shader: the
// fetch silently returns (0,0,0,1), every particle is born on the window's corner,
// and the field is empty while the sim happily runs. Measured here — SwiftShader
// (headless Chrome, i.e. CI) does exactly that, while *fragment* sampling of the same
// render target works fine. So the field lives entirely in fragment shaders: a
// screen-space trail is back-traced along the real wind each frame, decayed, and
// re-seeded where the air is thick. Same physics, one less GL feature to depend on —
// and it streaks like weather instead of stippling like confetti.
//
// Texture conventions (DataTextures upload unflipped, so row 0 sits at v=0):
//   PM2.5 grid — row 0 = latMin (south).  Byte is sqrt-encoded: pm = t² · cap.
//   GFS wind   — row 0 = la1   (north).  RG = u (east), v (north) in m/s.

const COMMON = /* glsl */ `
  const float M_PER_DEG = 111320.0;

  uniform sampler2D uPmTex;
  uniform sampler2D uWindTex;
  uniform vec4 uWin;          // lon0, lat0 (SW corner), lonSpan, latSpan
  uniform vec2 uWindOrigin;   // lo1, la1
  uniform vec2 uWindSpan;     // nx·dx, (ny-1)·dy
  uniform vec2 uPmOrigin;     // lonMin, latMin
  uniform vec2 uPmSpan;       // nLon·dLon, nLat·dLat

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Where in the world is this pixel? (uv 0..1 over the window, y up = north)
  vec2 lonLatAt(vec2 uv) {
    return vec2(uWin.x + uv.x * uWin.z, uWin.y + uv.y * uWin.w);
  }

  // GFS surface wind, m/s [east, north].
  vec2 windAt(vec2 ll) {
    vec2 wuv = vec2(
      (ll.x - uWindOrigin.x) / uWindSpan.x,
      (uWindOrigin.y - ll.y) / uWindSpan.y
    );
    return texture2D(uWindTex, vec2(fract(wuv.x), clamp(wuv.y, 0.0, 1.0))).xy;
  }

  // PM2.5 as a fraction of the grid cap (the stored byte is sqrt-encoded).
  float pmAt(vec2 ll) {
    vec2 puv = (ll - uPmOrigin) / uPmSpan;
    float t = texture2D(uPmTex, vec2(fract(puv.x), clamp(puv.y, 0.0, 1.0))).r;
    return t * t;
  }

  // Displacement of the air at this pixel over dt, in uv units of the window.
  vec2 driftAt(vec2 ll, float dt, float timeScale) {
    vec2 w = windAt(ll);
    float cosLat = max(cos(radians(ll.y)), 0.15);
    float dLon = w.x / (M_PER_DEG * cosLat) * dt * timeScale;
    float dLat = w.y / M_PER_DEG * dt * timeScale;
    return vec2(dLon / uWin.z, dLat / uWin.w);
  }
`

/** Fullscreen quad in clip space — the advect pass and the composite both use it. */
export const quadVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/**
 * Advect: back-trace each pixel along the wind, decay what was already there, and seed
 * new motes at a rate set by the concentration. Thick air seethes, clean air shows a
 * few faint motes, and the wind draws both out into filaments.
 */
export const advectFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uPrev;
  uniform float uDt;
  uniform float uTimeScale;
  uniform float uDecay;      // trail decay, per second
  uniform float uTime;
  uniform float uSeedRate;   // baseline births per pixel per frame
  varying vec2 vUv;
  ${COMMON}

  void main() {
    vec2 ll = lonLatAt(vUv);
    float pm = pmAt(ll);

    // Semi-Lagrangian: what sits here now blew in from upwind a moment ago.
    vec2 back = vUv - driftAt(ll, uDt, uTimeScale);
    float prev = texture2D(uPrev, clamp(back, vec2(0.0), vec2(1.0))).r;
    float trail = prev * exp(-uDecay * uDt);

    float r = hash12(vUv * 1024.0 + vec2(uTime * 37.0, uTime * 61.0));
    float rate = uSeedRate * (0.25 + pm * 6.0);
    float birth = step(1.0 - rate, r);
    trail = max(trail, birth * (0.35 + pm * 0.65));

    gl_FragColor = vec4(clamp(trail, 0.0, 1.0), 0.0, 0.0, 1.0);
  }
`

/**
 * Composite: the dusk sky, hazed by the window's own mean PM2.5 (visibility loss is a
 * thing eyes really do), with the trail over it — each streak coloured by the
 * concentration it is passing through.
 */
export const compositeFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uTrail;
  uniform vec3 uRamp0;
  uniform vec3 uRamp1;
  uniform vec3 uRamp2;
  uniform vec3 uRamp3;
  uniform vec3 uVeil;
  uniform vec3 uClean;
  uniform vec3 uWarm;
  uniform vec3 uHot;
  uniform float uHaze;    // 0..1, window mean PM2.5 / cap
  uniform float uTime;
  uniform float uAspect;
  uniform float uIntro;   // 0→1 entrance
  varying vec2 vUv;
  ${COMMON}

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * noise(p);
      p *= 2.02;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    // ── the sky ──
    float y = vUv.y;
    vec3 sky = mix(uRamp0, uRamp1, smoothstep(0.0, 0.42, y));
    sky = mix(sky, uRamp2, smoothstep(0.35, 0.72, y));
    sky = mix(sky, uRamp3, smoothstep(0.68, 1.0, y));

    vec2 q = vec2(vUv.x * uAspect * 2.2, vUv.y * 2.2);
    float h = fbm(q + vec2(uTime * 0.012, uTime * 0.004));
    // Haze is capped: past a point the veil eats the whole picture, and a landing that
    // washes to mud tells you less about the air than one you can still see through.
    float veil = uHaze * (0.35 + 0.65 * h);
    vec3 col = mix(sky, uVeil, clamp(veil * 0.55, 0.0, 0.55));
    col = mix(col, vec3(dot(col, vec3(0.299, 0.587, 0.114))), uHaze * 0.15);

    // ── the air itself ──
    float trail = texture2D(uTrail, vUv).r;
    vec2 ll = lonLatAt(vUv);
    float pmN = clamp(pmAt(ll) * 2.6, 0.0, 1.0);

    vec3 mote = mix(uClean, uWarm, smoothstep(0.0, 0.45, pmN));
    mote = mix(mote, uHot, smoothstep(0.45, 1.0, pmN));
    // pow() lifts the tail of the streak — the decayed end of a filament is the part
    // that carries the direction, and linear falloff loses it against a hazed sky.
    col += mote * pow(trail, 0.7) * (0.35 + 0.9 * pmN) * uIntro;

    // A whisper of grain so the gradient never bands.
    col += (hash12(vUv * 900.0) - 0.5) * 0.012;
    gl_FragColor = vec4(col, 1.0);
  }
`
