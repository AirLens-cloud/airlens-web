# 03 · Globe 스프라이트 키트 v1 (`globe-kit/`)

시각 버전: `pages/airlens-globe-sprite-kit.html`.

## 왜

Globe의 마커·입자·아이콘이 컴포넌트마다 `document.createElement('canvas')`로 즉석 생성된다
(`stationIconAtlas.ts` · `PredictionMarkers.createRingTexture` · `FireHotspots.createEmberTexture` · `PollenParticles.createPollenTexture` · `CountryLabels`).
디자인을 코드 밖에서 다듬을 수 없고, 예측 마커의 p10–p90 폭이 **알파(투명도)로만** 부호화돼 배경·색약에 따라 정보가 사라진다.
키트는 (1) 절차적 텍스처를 파일 자산으로, (2) 불확실성에 **띠 두께**라는 형태 채널을 추가한다. 모든 스프라이트는 흰색-알파 → 기존 `vertexColors`/`instanceColor` 틴팅 그대로 동작.

## 내용

| 폴더 | 파일 | 용도 |
|---|---|---|
| `sprites/` 128² | `station-ground` · `station-satellite`(마름모+궤도호, 시안 틴트) · `prediction-band-{narrow,mid,wide}` · `alert-pulse` · `reticle` · `pollen` · `fire-flame` | 하드 마커 (SVG 원본 동봉) |
| `sprites/` soft | `glow-soft`(128) · `ember`(96) · `smoke-puff`(96, α≤.55) · `wind-particle`(32) · `pollen-soft`(64) · `star`(64) | AdditiveBlending 입자·헤일로 |
| `lut/` 256×1 | `aqi-k4`(tokens --aqi-* 6단계) · `aqi-k4-field`(α .12→.9, 깨끗한 공기 = 없음) · `wind-speed` · `temperature` · `atmosphere-rim`(1×256, 세로) | `texture2D(uLut, vec2(t,.5))` |
| `icons/` 24² | `globe-icons.svg` 25 symbol: mode-{live,forecast,events,flow,policy} · layer-{stations,predictions,wind,fires,pollen,grid,field} · view-{globe,map,table} · zoom-in/out · reset-north · pin · compare · fullscreen · keyboard · status-stale · status-satellite · dqss-band | 모드 레일 유니코드 글리프(◉◑▲≈▣) 교체, 레이어/뷰 토글 |
| `spriteKit.ts` | `getSprite(name)` · `getLut(name)` · `bandSprite(p10,p50,p90)` · `disposeSpriteKit()` | `src/components/globe/three/systems/`에 배치 |

`bandSprite` 컷: rel = (p90−p10)/max(p50,1) → `<0.35 narrow` · `<0.8 mid` · `≥0.8 wide`.

## 교체 순서 (각각 독립 PR)

1. `PredictionMarkers.createRingTexture()` → `prediction-band-*.png` + `bandSprite()` (띠 tier별 InstancedMesh 3개, 기존 `bandRelWidthToAlpha` 알파 채널은 유지)
2. `stationIconAtlas.getStationIconTexture()` → `station-ground.png` / `station-satellite.png` (`isSatelliteSource`로 분기)
3. `AtmosphericModeRail` glyph · `atmosphericModes.ts` → `<use href="/icons/globe-icons.svg#mode-{id}">`
4. `FireHotspots.createEmberTexture()` · `SmokeEmitter` → `ember.png` · `fire-flame.png` · `smoke-puff.png`
5. `ScalarFieldOverlay` 색 램프 상수 → `lut/aqi-k4-field.png`
6. `Atmosphere.tsx` 림 색 uniform → `lut/atmosphere-rim.png`
7. `GlobeLayerToggles` · `ViewModeSwitch` 텍스트 버튼 → layer-* · view-* 심볼

```ts
// PredictionMarkers.tsx (after)
import { getSprite, bandSprite } from '../systems/spriteKit';
const tiers = useMemo(() => ({
  narrow: getSprite('prediction-band-narrow'),
  mid:    getSprite('prediction-band-mid'),
  wide:   getSprite('prediction-band-wide'),
}), []);
// markers를 bandSprite(m.p10, m.p50, m.p90)로 그룹 → tier별 instancedMesh
```

배치: zip 내용을 `airlens-web/public/`에 풀면 `/sprites/…` `/lut/…` `/icons/globe-icons.svg` 경로가 그대로 맞음. 같은 출처 URL만 사용(CountryLabels의 CSP 주석과 동일 원칙).
재생성: `python3 gen_globe_kit.py` (cairosvg · numpy · Pillow).
