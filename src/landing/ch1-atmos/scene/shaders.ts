// GLSL for the ATMOS scene. Point positions derive their own lat/lon in the
// vertex shader (matching the ETL point-cloud generator) to sample the PM2.5
// texture, so the pollution overlay lines up with the cloud without CPU work.
//
// Ported verbatim from AirLens-platform apps/landing-lab
// `src/concepts/atmos/scene/shaders.ts` (Wave L1, 2026-08-26).

export const earthVert = /* glsl */ `
  uniform float uTime;
  uniform float uPmStrength;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform sampler2D uPmTex;
  attribute float aIntensity;
  varying float vIntensity;
  varying float vPm;
  const float PI = 3.14159265;
  const float TAU = 6.2831853;
  void main() {
    vec3 dir = normalize(position);
    float u = fract(atan(dir.z, -dir.x) / TAU);
    float v = asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5;
    float tex = texture2D(uPmTex, vec2(u, v)).r;
    float pmNorm = tex * tex;                 // decode sqrt encoding → pm/cap
    vPm = pmNorm * uPmStrength;
    vIntensity = aIntensity;
    float b = sin(uTime * 0.6 + dir.y * 3.0 + dir.x * 2.0) * 0.004;
    vec3 pos = position + dir * b;
    float sz = uSize * (1.0 + vPm * 2.4);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = sz * uPixelRatio * (1.0 / max(-mv.z, 0.001));
  }
`

export const earthFrag = /* glsl */ `
  precision mediump float;
  uniform vec3 uOcean;
  uniform vec3 uLand;
  uniform vec3 uAmber;
  uniform vec3 uRed;
  uniform vec3 uPurple;
  uniform float uIntro;
  varying float vIntensity;
  varying float vPm;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    float alpha = smoothstep(0.25, 0.04, d);
    vec3 base = mix(uOcean, uLand, smoothstep(0.14, 0.6, vIntensity));
    base *= 1.12;                              // lift so the body reads under the hero
    vec3 pm = mix(uAmber, uRed, smoothstep(0.15, 0.45, vPm));
    pm = mix(pm, uPurple, smoothstep(0.45, 0.85, vPm));
    float pmMix = smoothstep(0.02, 0.28, vPm);
    gl_FragColor = vec4(mix(base, pm, pmMix), alpha * uIntro);
  }
`

export const atmoVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

export const atmoFrag = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uPower;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), uPower);
    float top = smoothstep(-0.35, 1.0, normalize(vN).y); // virtual light from above
    float lit = mix(0.6, 1.3, top);
    gl_FragColor = vec4(uColor, f * uIntensity * lit);
  }
`

export const starVert = /* glsl */ `
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vSeed;
  void main() {
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.8 + aSeed * 1.6) * uPixelRatio;
  }
`

export const starFrag = /* glsl */ `
  precision mediump float;
  uniform float uTime;
  uniform vec3 uColor;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    float tw = 0.5 + 0.5 * sin(uTime * (0.6 + vSeed) + vSeed * 30.0);
    gl_FragColor = vec4(uColor, 0.25 + 0.6 * tw);
  }
`
