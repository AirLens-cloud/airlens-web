/**
 * instanceAlpha — shader chunk injection tests (AAA, no GPU/WebGL required).
 * Verifies the vertex/fragment string patch lands correctly against a fake
 * meshbasic-shaped shader object, and that the failure-mode warning fires when
 * the target chunk is missing (three.js internal shader text drift).
 */
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { patchMaterialForInstanceAlpha, makeInstanceAlphaAttribute } from './instanceAlpha';
import { logger } from '../../../../lib/logger';

/** Minimal stand-in for the meshbasic vertex/fragment shader text (real chunk names, no GPU). */
function fakeMeshBasicShader() {
  return {
    vertexShader: '#include <common>\nvoid main() {\n\t#include <begin_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {\n\t#include <color_fragment>\n}',
  };
}

describe('patchMaterialForInstanceAlpha', () => {
  it('injects the attribute/varying declaration and the alpha multiply', () => {
    // Arrange
    const material = new THREE.MeshBasicMaterial();
    patchMaterialForInstanceAlpha(material);
    const shader = fakeMeshBasicShader();
    // Act
    material.onBeforeCompile(shader as never, {} as never);
    // Assert
    expect(shader.vertexShader).toContain('attribute float instanceAlpha;');
    expect(shader.vertexShader).toContain('varying float vInstanceAlpha;');
    expect(shader.vertexShader).toContain('vInstanceAlpha = instanceAlpha;');
    expect(shader.fragmentShader).toContain('varying float vInstanceAlpha;');
    expect(shader.fragmentShader).toContain('diffuseColor.a *= vInstanceAlpha;');
  });

  it('sets a unique customProgramCacheKey so the patched shader is never dedup-shared', () => {
    // Arrange
    const material = new THREE.MeshBasicMaterial();
    // Act
    patchMaterialForInstanceAlpha(material);
    // Assert — three.js's default cache key ignores onBeforeCompile edits; without
    // this, an unrelated material with the same base key could silently reuse (or
    // be reused by) this patched program.
    expect(material.customProgramCacheKey).toBeInstanceOf(Function);
    expect(material.customProgramCacheKey!()).toBe('instance-alpha:instanceAlpha');
  });

  it('marks the material for recompile', () => {
    // Arrange — THREE.Material.needsUpdate is a write-only setter that bumps
    // `.version`; there is no getter, so we assert the observable side effect.
    const material = new THREE.MeshBasicMaterial();
    const versionBefore = material.version;
    // Act
    patchMaterialForInstanceAlpha(material);
    // Assert
    expect(material.version).toBeGreaterThan(versionBefore);
  });

  it('warns and leaves the shader unpatched when a target chunk is missing', () => {
    // Arrange — simulates a future three.js version renaming its shader chunks
    const material = new THREE.MeshBasicMaterial();
    patchMaterialForInstanceAlpha(material);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const brokenShader = { vertexShader: 'void main() {}', fragmentShader: 'void main() {}' };
    // Act
    material.onBeforeCompile(brokenShader as never, {} as never);
    // Assert — no injection happened, but we were warned instead of silently
    // shipping markers that always render fully opaque.
    expect(brokenShader.vertexShader).not.toContain('instanceAlpha');
    expect(brokenShader.fragmentShader).not.toContain('instanceAlpha');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('makeInstanceAlphaAttribute', () => {
  it('creates a size-N single-component attribute, defaulting every slot to opaque (1.0)', () => {
    // Act
    const attr = makeInstanceAlphaAttribute(5);
    // Assert
    expect(attr.count).toBe(5);
    expect(attr.itemSize).toBe(1);
    for (let i = 0; i < 5; i++) expect(attr.getX(i)).toBe(1);
  });
});
