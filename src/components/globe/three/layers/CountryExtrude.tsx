/**
 * CountryExtrude — 3D highlight of selected country with flag texture.
 *
 * Builds a sphere-hugging surface mesh + fat-line edge outline from the
 * country's TopoJSON polygon(s). Surface tessellation (earcut over a gnomonic
 * projection, then midpoint subdivision) and per-ring edge segments live in the
 * pure `systems/polygonTessellation` module. Surface shows the country flag as
 * a subtle background texture.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { LineSegments2, LineSegmentsGeometry, LineMaterial } from 'three-stdlib';
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';
import { useGlobeStore } from '../../../../store/globeStore';
import { GLOBE_CONFIG } from '../../../../lib/config/globe';
import { useCountryFeatures } from '../../../../hooks/useCountryData';
import { getIso2FromNumeric, getFlagUrl } from '../../../../lib/config/isoCountries';
import { logger } from '../../../../lib/logger';
import {
  tessellateSphericalPolygon,
  buildRingEdgeSegments,
  type LonLatBBox,
} from '../systems/polygonTessellation';

const EXTRUDE = GLOBE_CONFIG.COUNTRY_EXTRUDE;

/** Fat-line width in device pixels (worldUnits:false). */
const EDGE_LINEWIDTH = 2.5;
/** Slerp-subdivide any edge segment longer than this (deg) so it hugs the sphere. */
const EDGE_ARC_THRESHOLD_DEG = 1;

const texLoader = new THREE.TextureLoader();

/** 1x1 fallback texture — prevents GPU undefined behavior on null sampler2D */
const fallbackTex = (() => {
  const data = new Uint8Array([255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
})();

/** Normalize a country geometry to a flat list of polygons (each = outer ring + holes). */
function toPolygons(geom: Polygon | MultiPolygon): Position[][][] {
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

/** Every ring across every polygon — outer rings and holes alike. */
function collectRings(polygons: Position[][][]): Position[][] {
  const rings: Position[][] = [];
  for (const poly of polygons) for (const ring of poly) rings.push(ring);
  return rings;
}

/** Bounding box in [lon, lat] over the whole country — shared for a coherent flag UV. */
function computeBBox(rings: Position[][]): LonLatBBox {
  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if ((lat as number) < minLat) minLat = lat as number;
      if ((lat as number) > maxLat) maxLat = lat as number;
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

/** Build a merged, sphere-hugging surface mesh (position + uv) from all polygons. */
function buildSurfaceGeometry(feat: Feature, radius: number): THREE.BufferGeometry | null {
  const polygons = toPolygons(feat.geometry as Polygon | MultiPolygon);
  if (polygons.length === 0) return null;

  const bbox = computeBBox(collectRings(polygons));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const poly of polygons) {
    const mesh = tessellateSphericalPolygon(poly, radius, { bbox });
    if (mesh.indices.length === 0) continue;
    for (const p of mesh.positions) positions.push(p);
    for (const u of mesh.uvs) uvs.push(u);
    for (const idx of mesh.indices) indices.push(idx + vertexOffset);
    vertexOffset += mesh.positions.length / 3;
  }

  if (positions.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Build a fat-line edge outline — closed loops per ring, no cross-ring ghost segments. */
function buildEdgeLine(feat: Feature, radius: number): LineSegments2 | null {
  const polygons = toPolygons(feat.geometry as Polygon | MultiPolygon);
  if (polygons.length === 0) return null;

  const { positions } = buildRingEdgeSegments(collectRings(polygons), radius, EDGE_ARC_THRESHOLD_DEG);
  if (positions.length === 0) return null;

  const geo = new LineSegmentsGeometry();
  geo.setPositions(positions);

  const mat = new LineMaterial({
    color: new THREE.Color(EXTRUDE.COLOR).getHex(),
    linewidth: EDGE_LINEWIDTH,
    worldUnits: false,
    transparent: true,
    opacity: 0,
  });

  const seg = new LineSegments2(geo, mat);
  seg.computeLineDistances();
  seg.frustumCulled = false;
  return seg;
}

// ── Flag shader ─────────────────────────────────────────────────────

const flagVertShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const flagFragShader = /* glsl */ `
  uniform sampler2D uFlagTex;
  uniform vec3 uTintColor;
  uniform float uOpacity;
  uniform float uFlagMix;
  varying vec2 vUv;

  void main() {
    vec4 flagColor = texture2D(uFlagTex, vUv);
    vec3 tint = uTintColor;

    // uFlagMix > 0 when real flag loaded; 0 = tint-only mode
    vec3 color = mix(tint, mix(flagColor.rgb, tint, 0.08), uFlagMix);

    gl_FragColor = vec4(color, uOpacity);
  }
`;

const CountryExtrude = () => {
  const selectedCountry = useGlobeStore((s) => s.selectedCountry);
  const countries = useCountryFeatures();
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const progressRef = useRef(0);
  const meshRef = useRef<THREE.Mesh>(null);
  const lineRef = useRef<LineSegments2 | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [flagTexture, setFlagTexture] = useState<THREE.Texture | null>(null);
  const flagTextureRef = useRef<THREE.Texture | null>(null);

  const selectedFeature = useMemo(() => {
    if (!selectedCountry || !countries) return null;
    const found = countries.features.find((f) => {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const name = (props.name as string) || '';
      const id = String(f.id ?? '');
      return name === selectedCountry.name || id === selectedCountry.code;
    }) ?? null;
    if (!found) {
      logger.warn(`[CountryExtrude] Feature not found for "${selectedCountry.name}" (code: ${selectedCountry.code})`);
    }
    return found;
  }, [selectedCountry, countries]);

  // Load flag texture when country changes
  useEffect(() => {
    let cancelled = false;

    // Dispose the previously loaded flag GPU texture before swapping — otherwise
    // every country selection leaks one texture (never returned to the pool).
    const applyTexture = (tex: THREE.Texture | null): void => {
      if (flagTextureRef.current && flagTextureRef.current !== tex) {
        flagTextureRef.current.dispose();
      }
      flagTextureRef.current = tex;
      setFlagTexture(tex);
    };

    if (!selectedCountry) {
      applyTexture(null);
      return;
    }

    const iso2 = getIso2FromNumeric(selectedCountry.code);
    const url = getFlagUrl(iso2);
    if (!url) {
      applyTexture(null);
      return;
    }

    texLoader.loadAsync(url).then((tex) => {
      if (cancelled) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      // Anisotropic filtering — sharpens the flag at grazing angles on the curved globe surface
      tex.anisotropy = gl.capabilities.getMaxAnisotropy();
      tex.needsUpdate = true;
      applyTexture(tex);
    }).catch(() => {
      if (!cancelled) applyTexture(null);
    });

    return () => { cancelled = true; };
  }, [selectedCountry, gl]);

  // Dispose the last loaded flag texture on unmount.
  useEffect(() => {
    return () => { flagTextureRef.current?.dispose(); };
  }, []);

  const surfaceGeo = useMemo(() => {
    if (!selectedFeature) return null;
    return buildSurfaceGeometry(selectedFeature, EXTRUDE.SURFACE_R);
  }, [selectedFeature]);

  const edgeLine = useMemo(() => {
    if (!selectedFeature) return null;
    return buildEdgeLine(selectedFeature, EXTRUDE.EDGE_R);
  }, [selectedFeature]);

  // Fat lines need the render-target resolution to size pixels — update on resize only.
  useEffect(() => {
    if (edgeLine) edgeLine.material.resolution.set(size.width, size.height);
  }, [edgeLine, size]);

  // Dispose geometries/materials on unmount or when selected country changes
  useEffect(() => {
    return () => {
      surfaceGeo?.dispose();
    };
  }, [surfaceGeo]);

  useEffect(() => {
    return () => {
      if (edgeLine) {
        edgeLine.geometry.dispose();
        edgeLine.material.dispose();
      }
    };
  }, [edgeLine]);

  const flagUniforms = useMemo(() => ({
    uFlagTex: { value: fallbackTex as THREE.Texture },
    uTintColor: { value: new THREE.Color(EXTRUDE.COLOR) },
    uOpacity: { value: 0 as number },
    uFlagMix: { value: 0 as number },
  }), []);

  // Animate opacity + flag mix — Three.js uniform mutation in R3F render loop
  useFrame((_, delta) => {
    const target = surfaceGeo ? 1 : 0;
    progressRef.current += (target - progressRef.current) * Math.min(delta * EXTRUDE.ANIM_SPEED, 1);

    const p = progressRef.current;

    // Mutate the material's OWN uniforms, not the local `flagUniforms` object.
    // R3F merge-copies the `uniforms` prop into a stable target on the material
    // (Object.assign per-uniform), so the local object is detached from what the
    // GPU reads — mutating it leaves uFlagMix/uFlagTex frozen at mount values and
    // the flag never blends in. Writing through the material ref keeps them live.
    const u = materialRef.current?.uniforms;
    if (u) {
      u.uOpacity.value = p * (flagTexture ? 0.85 : EXTRUDE.SURFACE_OPACITY);
      u.uFlagTex.value = flagTexture ?? fallbackTex;
      u.uFlagMix.value = flagTexture ? 0.92 : 0;
    }

    if (meshRef.current) {
      meshRef.current.visible = p > 0.01;
    }
    const line = lineRef.current;
    if (line) {
      line.material.opacity = p * EXTRUDE.EDGE_OPACITY;
      line.visible = p > 0.01;
    }
  });

  // Reset progress when geometry is removed
  useEffect(() => {
    if (!surfaceGeo) {
      progressRef.current = 0;
    }
  }, [surfaceGeo]);

  if (!surfaceGeo) {
    return null;
  }

  return (
    <group>
      {/* Surface fill with flag texture — visibility controlled by useFrame to avoid R3F re-render reset */}
      <mesh
        ref={(node) => {
          meshRef.current = node;
          if (node) node.visible = progressRef.current > 0.01;
        }}
        geometry={surfaceGeo}
      >
        <shaderMaterial
          ref={materialRef}
          vertexShader={flagVertShader}
          fragmentShader={flagFragShader}
          uniforms={flagUniforms}
          transparent
          side={THREE.DoubleSide}
          depthWrite={true}
          blending={THREE.NormalBlending}
        />
      </mesh>

      {/* Fat-line edge outline — per-ring closed loops, resolution-aware pixel width */}
      {edgeLine && (
        <primitive
          object={edgeLine}
          ref={(node: LineSegments2 | null) => {
            lineRef.current = node;
            if (node) node.visible = progressRef.current > 0.01;
          }}
        />
      )}
    </group>
  );
};

export default CountryExtrude;
