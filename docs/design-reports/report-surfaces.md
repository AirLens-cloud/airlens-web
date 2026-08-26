# 배경·표면·모션 자산 보고서 (explore-surfaces)

## 1. Sky-glass 표면 계열

**토큰 정의**: `apps/web/src/reado.css:153-190` (`@scope (.reado-shell) :scope`)

11개 phase 그라데이션 (전부 4-stop, 180deg 세로):
```css
--sky-grad-dawn:    linear-gradient(180deg, #2a3a6a 0%, #7a5a8a 38%, #e0a0a0 72%, #f4d4b4 100%);
--sky-grad-morning: linear-gradient(180deg, #4a7ab0 0%, #8ab4d8 38%, #c0dcef 72%, #eaf4fb 100%);
--sky-grad-noon:    linear-gradient(180deg, #4f93d4 0%, #74b0e2 38%, #a6d0ef 72%, #dcecfb 100%);
--sky-grad-dusk:    linear-gradient(180deg, #3a558a 0%, #6a5e98 38%, #c07e8e 72%, #f0b890 100%); /* 기본 phase */
--sky-grad-night:   linear-gradient(180deg, #0c1430 0%, #1a2450 38%, #2a3868 72%, #3a4a80 100%);
--sky-grad-cloudy:  linear-gradient(180deg, #6b7a8f 0%, #8a98a8 38%, #aab4c0 72%, #cdd4dc 100%);
--sky-grad-fog:     linear-gradient(180deg, #8a9098 0%, #a6abb2 38%, #c2c6cc 72%, #dde0e4 100%);
--sky-grad-drizzle: linear-gradient(180deg, #5a6b7d 0%, #79899a 38%, #9aa8b6 72%, #c0cad4 100%);
--sky-grad-rain:    linear-gradient(180deg, #3f4d5e 0%, #566576 38%, #71808f 72%, #94a1ae 100%);
--sky-grad-snow:    linear-gradient(180deg, #9aa6b6 0%, #b8c2cf 38%, #d2dae3 72%, #eef1f5 100%);
--sky-grad-thunder: linear-gradient(180deg, #23262e 0%, #363a47 38%, #4a4f60 72%, #5e6478 100%);
```

**Glass 표면 (Liquid Glass)** — `reado.css:166-190`:
```css
--glass-fill: rgba(255, 255, 255, 0.20);
--glass-fill-lift: rgba(255, 255, 255, 0.28);
--glass-opaque: #e8f0f9;      /* 주간 reduced-transparency 폴백 */
--glass-blur: 20px;
--glass-border: rgba(255, 255, 255, 0.40);
--r-glass: 20px;
--shadow-glass: 0 8px 24px -6px rgba(28, 56, 104, 0.16);
/* dark 테마 (line 271-275) */
--glass-fill: rgba(20, 30, 54, 0.32); --glass-fill-lift: rgba(28, 40, 68, 0.42);
--glass-opaque: #141e33; --glass-border: rgba(255,255,255,0.18);
--shadow-glass: 0 8px 24px -6px rgba(17, 20, 24, 0.45);
/* night 고정 표면 (Globe HUD 전용, 테마 불변, line 187-190) */
--glass-night-fill: rgba(10, 16, 30, 0.70);
--glass-night-fill-lift: rgba(16, 24, 42, 0.80);
--glass-night-border: rgba(255, 255, 255, 0.14);
--glass-night-opaque: #0c1422;
```

**Phase-aware 잉크 반전 로직** — `reado.css:4711-4773`. `.sky-surface` 기본값은 **어두운 잉크**(`#0b1a2e` 계열), `night`/`rain`/`thunder` 3개 phase만 흰 잉크(`#ffffff`)로 반전:
```css
.sky-surface { color: var(--sky-ink-1); --sky-ink-1: #0b1a2e; --sky-ink-2: rgba(11,26,46,.92); }
.sky-surface[data-sky-phase='night'],
.sky-surface[data-sky-phase='rain'],
.sky-surface[data-sky-phase='thunder'] { --sky-ink-1: #ffffff; --sky-ink-2: rgba(255,255,255,.85); }
.sky-surface[data-sky-phase='dawn'] { background: var(--sky-grad-dawn); }
/* ... 나머지 10 phase 동일 패턴 (line 4763-4773) */
```
추가: `.sky-surface::before` 흰색 lift 방향성 scrim(밝은 phase용) + night류에 남색 veil scrim(line 4750-4761), `--sky-plate: rgba(255,255,255,.52)` 텍스트 밑 국소 veil(line 4734).

**사용처**: `/today` 히어로(`TodaySkyWindow.tsx:48` — `today-hero sky-surface tobs-sky` data-sky-phase), Home `StaticHero`(`Home.tsx:88` `sky-hero__surface`), Auth SkyPanel(night 고정), 헤더 데이터 밴드(`/country/:code`), 결과 밴드(succeeded 한정, day). 카탈로그 SOT = `.claude/rules/policy/design-taxonomy.md §표면 재질 축`.

## 2. Paper-Ink 기본 표면

`reado.css:32-51` (light) / `:scope[data-theme="dark"]:258-275` (dark):
```css
/* light */
--bg-0: #FFFFFF; --bg-1: #F8F8F8;
--ink-0: #000000; --ink-1: #333333; --ink-2: #6b6b6b; --ink-3: #727272;
--rule: #E5E5E5; --rule-strong: #000000;
/* dark */
--bg-0: #0c1015; --bg-1: #131820;
--ink-0: #f4f1e8; --ink-1: #c5c0b3; --ink-2: #8b8678; --ink-3: #6f6b62;
--rule: rgba(255,255,255,.08); --rule-strong: #f4f1e8;
```
Hairline = 1px `var(--rule)` 보더, 그림자 없음(square doctrine). radius 전부 `--r-0: 0`(pill만 `--r-pill: 999px` 예외).

## 3. OBSERVATORY (obs) 표면

`apps/web/src/styles/observatory-shared.css:31-47` — `.obs-surface` 토큰:
```css
--obs-void: #05070d; --obs-void-2: #0a0f1a;   /* dense dark backdrop */
--obs-ink: #e8ecf4; --obs-hud: #7e8aa2; --obs-hud-dim: #4a5468;
--obs-void-line: #1d2430;
--obs-cyan: var(--viz-accent, #25e2f4);        /* 계기 장식 전용, 인터랙티브 아님 */
--obs-paper: #f7f5f0; --obs-paper-ink: #111114; --obs-paper-mut: #5c5c56;
--obs-hairline: #dedbd2;
--obs-display: 'Overused Grotesk', ...;  --obs-mono: 'Martian Mono', 'SF Mono', monospace;
--obs-ez: cubic-bezier(0.22, 1, 0.36, 1);  --obs-gut: 32px;
```
Dense-mono HUD 미학: `.m`/`.m-b`(10px mono, letter-spacing .14em, uppercase), `.obs-dqss` 배지(1px border), `.obs-cnr` 코너 브래킷(1px cyan, `clip-path` 드로우인). 사용 페이지: Home(void 배경), Today/Dispatch/Insights(paper HUD 병기), Globe(`--obs-void` 배경).

## 4. AtmosphericBackground (배경 캔버스)

`apps/web/src/components/AtmosphericBackground.tsx` — 전면 고정 2-canvas, App.tsx 셸 전역:
- **Brownian dots**: 36개 입자, `PM25_COLOR_SCALE` 색(rgb), 반경 1.2~3px, 브라운운동 drift + damping(0.985). `data-surface === 'void'`일 때 멈춤.
- **Cursor trail**: 마우스 이동 시 fountain-pen 잉크 방울(PM2.5 색, 중력) — void 표면에선 cyan condensation 방울(중력 없음, alpha 낮음).
- `prefers-reduced-motion`/`pointer:coarse` 시 미초기화. Globe 페이지에선 `reado.css:433` `:scope:has(...)` 자동 숨김.

## 5. Globe 배경/스테이지

`reado.css:1128-1170` — immersive 100vh급 스테이지:
```css
main[data-page="globe"].on.obs-surface { display:flex; flex:1 1 0; flex-direction:column; min-height:650px; }
.globe-immersive-stage {
  position: relative; width: 100%; height: auto; min-height: 600px; flex: 1 1 auto;
  display: grid; grid-template-rows: minmax(0,1fr);
  grid-template-columns: 1fr clamp(320px, 30vw, 380px);
  background: #040d12;
  background-image: radial-gradient(circle at 50% 60%, color-mix(in srgb, var(--viz-accent) 5%, transparent) 0%, transparent 65%);
}
.globe-immersive-stage::before {  /* sine-grid 도트 backdrop */
  background-image: radial-gradient(circle at 1px 1px, rgba(140,160,180,.08) 1px, transparent 1.5px);
  background-size: 32px 32px;
  mask-image: radial-gradient(ellipse at center, #000 30%, transparent 90%);
}
```
Night 고정(테마 불변), HUD/사이드바/legend/툴팁 전부 `--glass-night-*`.

## 6. 히어로 처리

**Home `StaticHero`** (`Home.tsx:62-127`): `sky-hero__surface[data-aqi]` 4단계 하드 색상(`reado.css:629-633`: good `#b5cfd9` / moderate `#e0b87a` / unhealthy `#b87852` / hazard `#5a3a2a` / unknown `--bg-1`) — 단색 AQI 틴트 방식. `AirLensWordmark` 대형 텍스트(`clamp(64px,20vw,260px)`) + `SkyStrip` 라이브 리드아웃 오버레이.

**`/today` `TodaySkyWindow`** (`TodaySkyWindow.tsx:48`): `sky-surface`(phase 그라데이션) + `tobs-sky`(obs HUD 문법) 이중 클래스. mono HUD 코너 라벨 + 코너 브래킷(`.obs-cnr`) + 큰 PM2.5 숫자 + p10-p90 밴드 + DQSS 배지.

## 7. 모션 토큰

`reado.css:205-209`:
```css
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);   /* 단일 easing */
--dur-micro: 120ms; --dur-fast: 200ms; --dur-base: 280ms; --dur-slow: 480ms;
```
`.obs-surface`는 `--obs-ez`(동일 curve) 재정의.

대표 keyframes:
```css
@keyframes alm-breathe { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(1.08); } }   /* 로고 바 */
@keyframes alm-pulse   { 0%,100% { transform: scale(1); opacity:.85; } 50% { transform: scale(1.15); opacity:1; } } /* 로고 중앙 점 */
@keyframes obs-cnr     { to { clip-path: inset(0 0 0 0); } }   /* 코너 브래킷 드로우인 */
@keyframes obs-pulse   { 0% {box-shadow:0 0 0 0 rgba(255,92,0,.5);} 70% {box-shadow:0 0 0 7px rgba(255,92,0,0);} 100% {box-shadow:0 0 0 0 rgba(255,92,0,0);} }
@keyframes tw-reveal   { from { opacity:0; transform:translateY(4px);} to { opacity:1; transform:none; } }
@keyframes hud-pulse   { 0%,100% { opacity:1; } 50% { opacity:.55; } }
```
`AirLensMark.tsx`: 7 bar가 `alm-breathe 3.2s ease-in-out` delay 0~0.32s 위상차 호흡, 중앙 원 `alm-pulse 2.8s`. reduced-motion 시 animation: none.

## 8. 뉴스 이미지 placeholder 그라데이션

**Dispatch (`reado.css:916-924`, `.img.b1`~`b9`)** — 짙은/차분한 톤, 135deg:
```css
.b1 { linear-gradient(135deg, #8B6F47 0%, #2B2823 100%); }   /* 흙색→카본 */
.b2 { linear-gradient(135deg, #B8A98A 0%, #5A5347 100%); }   /* 베이지→올리브 */
.b3 { linear-gradient(135deg, #D8CFB8 0%, #8E8472 50%, #2B2823 100%); }  /* 3-stop 사막톤 */
.b4 { linear-gradient(135deg, #7C8AA0 0%, #1F3A5F 100%); }   /* 슬레이트블루→네이비 */
.b5 { linear-gradient(135deg, #C9A878 0%, #7A2B2B 100%); }   /* 황토→적갈 */
.b6 { linear-gradient(135deg, #4F7A4F 0%, #1A6F73 100%); }   /* 그린→틸 */
.b7 { linear-gradient(135deg, #A88B6A 0%, #3A322A 100%); }   /* 카키→다크브라운 */
.b8 { linear-gradient(135deg, #1F3A5F 0%, #000 100%); }      /* 네이비→블랙 */
.b9 { linear-gradient(135deg, #7A2B2B 0%, #1F3A5F 100%); }   /* 적갈→네이비 */
```

**Blog (`apps/web/src/pages/blog.css:75, 119-122`, `.bg1`~`bg4`)** — 밝은/파스텔 톤:
```css
.bg1 { linear-gradient(150deg, #e8ddc9 0%, #cbb894 60%, #a98f60 100%); } /* 크림→황토 */
.bg2 { linear-gradient(140deg, #cfdcd2 0%, #9db8a4 60%, #6e8f78 100%); } /* 세이지 그린 */
.bg3 { linear-gradient(160deg, #dccfd6 0%, #b394a4 60%, #8a6478 100%); } /* 더스티 로즈 */
.bg4 { linear-gradient(135deg, #d8dee9 0%, #aab6c8 55%, #8494ac 100%); } /* 슬레이트 블루 */
```

핵심 참조: `apps/web/src/reado.css`(토큰 SOT, 4957줄) · `styles/observatory-shared.css` · `components/AtmosphericBackground.tsx` · `components/AirLensMark.tsx` · `pages/Home.tsx:62-127` · `components/today/observatory/TodaySkyWindow.tsx` · `pages/blog.css`.
