/// <reference types="node" />
// Guards the spriteKit loader against a silent URL/asset mismatch: getSprite()/
// getLut() build a `/sprites/<name>.png` or `/lut/<name>.png` URL from the
// SpriteName/LutName union and hand it to THREE.TextureLoader, which fails
// only at *runtime* (console warning, blank texture) — a typo here or a
// renamed/missing globe-kit asset would ship silently. Reads the union
// members straight out of this file's source text (no import-time coupling
// to `three`/WebGL) and cross-checks each against public/sprites + public/lut
// on disk, matching the shellGutterParity.test.ts pattern for reading repo
// files via node:fs in a jsdom-environment test.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SYSTEMS_DIR = path.resolve(__dirname)
const REPO_ROOT = path.resolve(SYSTEMS_DIR, '../../../../../')
const SPRITE_KIT_SOURCE = fs.readFileSync(path.join(SYSTEMS_DIR, 'spriteKit.ts'), 'utf8')

/**
 * Extracts the string-literal members of a `export type <name> = 'a' | 'b'` union —
 * handles both the single-line form (LutName) and the leading-`|` multi-line form
 * (SpriteName: `export type SpriteName =\n  | 'a' | 'b'\n  | 'c' ...`).
 */
function unionMembers(source: string, typeName: string): string[] {
  const re = new RegExp(`export type ${typeName} =([^\\n]*(?:\\n\\s*\\| [^\\n]+)*)`)
  const match = source.match(re)
  if (!match) throw new Error(`type "${typeName}" not found in spriteKit.ts`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('spriteKit — SpriteName/LutName unions match public/ assets on disk', () => {
  it('every SpriteName has a public/sprites/<name>.png file', () => {
    // Arrange
    const names = unionMembers(SPRITE_KIT_SOURCE, 'SpriteName')
    expect(names.length).toBeGreaterThan(0)
    // Act / Assert
    for (const name of names) {
      const file = path.join(REPO_ROOT, 'public/sprites', `${name}.png`)
      expect(fs.existsSync(file), `missing public/sprites/${name}.png (SpriteName union member)`).toBe(true)
    }
  })

  it('every LutName has a public/lut/<name>.png file', () => {
    // Arrange
    const names = unionMembers(SPRITE_KIT_SOURCE, 'LutName')
    expect(names.length).toBeGreaterThan(0)
    // Act / Assert
    for (const name of names) {
      const file = path.join(REPO_ROOT, 'public/lut', `${name}.png`)
      expect(fs.existsSync(file), `missing public/lut/${name}.png (LutName union member)`).toBe(true)
    }
  })
})
