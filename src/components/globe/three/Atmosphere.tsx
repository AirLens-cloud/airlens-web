/**
 * Atmosphere — adapted from mitchcamza/Earth3D.
 *
 * Single BackSide sphere at 1.04x scale.
 * Uses world-space coordinates (modelMatrix, not modelViewMatrix).
 * Day/twilight color blend based on sun direction, sourced from a 1×256
 * vertical LUT (`lut/atmosphere-rim.png`, globe-kit §교체 순서 6) rather than
 * a 2-color uniform mix — same transition curve (smoothstep(-0.5, 1.0, ...)),
 * richer authored gradient than a flat day/twilight lerp.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getSunDirection } from '../utils/sun';
import { useGlobeStore } from '../../../store/globeStore';
import { GLOBE_THEME_PRESETS } from '../../../lib/config/globe';
import { getLut } from './systems/spriteKit';

const vertShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * modelPosition;
    vec3 modelNormal = (modelMatrix * vec4(normal, 0.0)).xyz;
    vNormal = modelNormal;
    vPosition = modelPosition.xyz;
  }
`;

const fragShader = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform sampler2D uRimLut;

  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec3 viewDirection = normalize(vPosition - cameraPosition);
    vec3 normal = normalize(vNormal);

    // Sun orientation
    float sunOrientation = dot(uSunDirection, normal);

    // Rayleigh scattering approximation:
    // Scatter angle between view and sun — forward scattering is stronger
    float cosTheta = dot(-viewDirection, uSunDirection);
    float rayleighPhase = 0.75 * (1.0 + cosTheta * cosTheta);

    // Wavelength-dependent scattering — blue scatters more (λ⁻⁴)
    vec3 rayleighColor = vec3(0.15, 0.35, 0.65) * rayleighPhase * 0.3;

    // Day/twilight base color — same curve as before (smoothstep(-0.5, 1.0, ...))
    // but sourced from the authored night→twilight→day LUT instead of a flat
    // 2-color mix (globe-kit atmosphere-rim.png, 1×256 vertical ramp).
    float atmosphereDayMix = smoothstep(-0.5, 1.0, sunOrientation);
    vec3 atmosphereColor = texture2D(uRimLut, vec2(0.5, atmosphereDayMix)).rgb;

    // Combine: base atmosphere + Rayleigh tint
    float rayleighStrength = smoothstep(-0.2, 0.8, sunOrientation);
    vec3 color = atmosphereColor + rayleighColor * rayleighStrength;

    // Alpha — edge-visible with depth-aware falloff
    float edgeAlpha = dot(viewDirection, normal);
    edgeAlpha = smoothstep(0.0, 0.5, edgeAlpha);

    // Limb darkening: thicker atmosphere at edges
    float limbFactor = pow(edgeAlpha, 0.8);

    float dayAlpha = smoothstep(-0.5, 0.0, sunOrientation);
    float alpha = limbFactor * dayAlpha;

    gl_FragColor = vec4(color, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ── Outer halo glow (FrontSide Fresnel rim) ────────────────────────

const haloVertShader = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const haloFragShader = /* glsl */ `
  varying vec3 vNormal;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float intensity = pow(0.78 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.5);
    gl_FragColor = vec4(uColor, intensity * uOpacity);
  }
`;

const Atmosphere = () => {
  const themePreset = useGlobeStore((s) => s.themePreset);
  const preset = GLOBE_THEME_PRESETS[themePreset];

  const uniforms = useMemo(() => ({
    uSunDirection: { value: getSunDirection() },
    uRimLut: { value: getLut('atmosphere-rim') },
  }), []);

  const haloUniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(preset.haloColor) },
    uOpacity: { value: preset.haloOpacity },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  useFrame(() => {
    /* eslint-disable react-hooks/immutability -- Three.js uniform mutation in R3F render loop */
    uniforms.uSunDirection.value.copy(getSunDirection());
    haloUniforms.uColor.value.setHex(preset.haloColor);
    haloUniforms.uOpacity.value = preset.haloOpacity;
    /* eslint-enable react-hooks/immutability */
  });

  return (
    <group>
      {/* Inner atmosphere (BackSide — sun-aware day/twilight) */}
      <mesh scale={[1.04, 1.04, 1.04]}>
        <sphereGeometry args={[1.0, 64, 64]} />
        <shaderMaterial
          vertexShader={vertShader}
          fragmentShader={fragShader}
          uniforms={uniforms}
          side={THREE.BackSide}
          transparent
        />
      </mesh>

      {/* Outer halo glow (FrontSide — Fresnel rim, additive, tighter) */}
      <mesh scale={[1.06, 1.06, 1.06]}>
        <sphereGeometry args={[1.0, 64, 48]} />
        <shaderMaterial
          vertexShader={haloVertShader}
          fragmentShader={haloFragShader}
          uniforms={haloUniforms}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
};

export default Atmosphere;
