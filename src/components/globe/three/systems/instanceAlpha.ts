/**
 * instanceAlpha — per-instance transparency for THREE.InstancedMesh.
 *
 * InstancedMesh.instanceColor is RGB-only; there is no built-in per-instance alpha.
 * This patches a material's shader (via onBeforeCompile) to read a custom
 * `instanceAlpha` vertex attribute and multiply it into the fragment's alpha —
 * deliberately NOT via material uniforms. A shared material's uniforms object is a
 * merge-copy trap on mutation (recorded incident — R3F shaderMaterial uniforms
 * don't push a local JS mutation to the GPU once the program has linked); a
 * per-instance InstancedBufferAttribute + `attr.needsUpdate = true` avoids that
 * failure mode entirely and needs no geometry/texture reallocation.
 *
 * Consumers: StationLabels.tsx (DQSS reliability), PredictionMarkers.tsx
 * (p10-p90 band width).
 */
import * as THREE from 'three';
import { logger } from '../../../../lib/logger';

const ATTR_NAME = 'instanceAlpha';
const VARYING_NAME = 'vInstanceAlpha';

/**
 * Replaces `target` with `injected` in `source`, warning once if `target` was not
 * found. A silent no-op here would ship markers that always render fully opaque —
 * a real reliability/uncertainty signal quietly reported as "certain".
 */
function safeInject(source: string, target: string, injected: string, site: string): string {
  const result = source.replace(target, injected);
  if (result === source) {
    logger.warn(
      `[instanceAlpha] shader chunk "${target}" not found (${site}) — three.js shader text ` +
        'may have changed; per-instance alpha will not apply (markers render fully opaque).',
    );
  }
  return result;
}

/**
 * Patches `material.onBeforeCompile` to read the `instanceAlpha` attribute and
 * multiply it into the fragment's alpha. Call once per material instance on
 * mount — shader compilation happens lazily on first draw, not at material
 * construction, so setting this shortly after JSX mount is safe.
 */
export function patchMaterialForInstanceAlpha(material: THREE.Material): void {
  // three.js's default program cache key does not account for onBeforeCompile edits —
  // a material patched here could silently share a compiled GPU program with an
  // unpatched (or differently-patched) material that happens to match on the default
  // key bits (map/vertexColors/alphaTest/etc.), which would either drop this alpha
  // channel or apply someone else's patch. A unique key forces its own cache bucket.
  material.customProgramCacheKey = () => `instance-alpha:${ATTR_NAME}`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = safeInject(
      shader.vertexShader,
      '#include <common>',
      `attribute float ${ATTR_NAME};\nvarying float ${VARYING_NAME};\n#include <common>`,
      'vertex declaration',
    );
    shader.vertexShader = safeInject(
      shader.vertexShader,
      '#include <begin_vertex>',
      `#include <begin_vertex>\n\t${VARYING_NAME} = ${ATTR_NAME};`,
      'vertex assignment',
    );
    shader.fragmentShader = safeInject(
      shader.fragmentShader,
      '#include <common>',
      `varying float ${VARYING_NAME};\n#include <common>`,
      'fragment declaration',
    );
    shader.fragmentShader = safeInject(
      shader.fragmentShader,
      '#include <color_fragment>',
      `#include <color_fragment>\n\tdiffuseColor.a *= ${VARYING_NAME};`,
      'fragment multiply',
    );
  };
  material.needsUpdate = true;
}

/** Instance alpha buffer, defaulting every slot to fully opaque (1.0). */
export function makeInstanceAlphaAttribute(count: number): THREE.InstancedBufferAttribute {
  return new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
}
