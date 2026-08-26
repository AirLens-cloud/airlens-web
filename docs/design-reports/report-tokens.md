# 토큰·타이포·폰트 자산 보고서 (explore-tokens)

## 1. 디자인 토큰 SOT — `apps/web/src/reado.css`

구조: `@scope (.reado-shell) { :scope { ...토큰... } }`. 다크모드 = `:scope[data-theme="dark"]` 재정의 (`reado.css:257-295`).

### 색상 — 잉크/배경 (`reado.css:33-70`)

| 토큰 | Light | Dark | 용도 |
|---|---|---|---|
| `--bg-0` | `#FFFFFF` | `#0c1015` | 기본 배경 |
| `--bg-1` | `#F8F8F8` | `#131820` | 보조 배경 |
| `--ink-0` | `#000000` | `#f4f1e8` | 주 텍스트 |
| `--ink-1` | `#333333` | `#c5c0b3` | 보조 텍스트 |
| `--ink-2` | `#6b6b6b` | `#8b8678` | 3차 텍스트/라벨 (AA) |
| `--ink-3` | `#727272` | `#6f6b62` | 장식 |
| `--rule` | `#E5E5E5` | `rgba(255,255,255,0.08)` | 구분선 |
| `--rule-strong` | `#000000` | `#f4f1e8` | 강조 구분선 |
| `--orange` (`--accent`) | `#FF5C00` | 불변 | 브랜드 액센트 |
| `--orange-ink` | `#C74700` | `var(--orange)` | 작은 텍스트용 (AA 4.85:1) |
| `--highlighter` | `#FFD84A` | — | 형광펜 노랑 |
| `--viz-accent` | `#25e2f4` | — | Globe/데이터뷰 전용 시안 |
| `--viz-live` | `#4ade80` | — | LIVE 그린 |
| `--viz-bad` | `#ef4444` | — | 다크 표면 경고 레드 |
| `--particle-ink` | `#111418` | — | 배경 파티클 |
| `--particle-ink-muted` | `#5a5d63` | — | 배경 파티클(약) |

### AQI 6-tier (`reado.css:46-51`)
`--aqi-good #4F7A4F` / `--aqi-mod #B58A2E` / `--aqi-usg #B86B2E` / `--aqi-unh #9F3A2E` / `--aqi-vunh #6B1F1F` / `--aqi-haz #4A1F4A` (paper-ink 저채도). 텍스트 AA 보정: `--aqi-mod-ink #8A6820`, `--aqi-usg-ink #96541E`, `--aqi-good-ink #4F7A4F`.

**주의 — 3계열 AQI 팔레트 공존**: design-tokens `WIREFRAME_AQI_DOT`(4-tier: `#6ec97a`/`#ffd84a`/`#ff8b3d`/`#c0392b`) + `AQI_GRADE_HEX`(7-tier EPA: `#10b981`~`#6b21a8`) + reado.css 6-tier. 채택 결정 필요.

### DQSS 5-grade 배지 (`reado.css:211-233`)

| grade | base | badge-bg | badge-border | badge-ink(light) |
|---|---|---|---|---|
| A | `#2ea36a` | `#e8f4ec` | `#6ec97a` | `#2e7d3b` |
| B | `#6ec97a` | `#fcf5d8` | `#d4b62e` | `#806a00` |
| C | `#ffd84a` | `#ffe9d4` | `#ff8b3d` | `#a8460e` |
| D | `#ff8b3d` | `#fde0d6` | `#e0613a` | `#a8341a` |
| F | `#c0392b` | `#f6dbd6` | `#c0392b` | `#7e2018` |

### semantic / scope 칩
`--semantic-good #2ea36a` / `--semantic-warn #ff6b3d` / `--semantic-bad #9F3A2E`(다크 `#D9705C`). Scope: `--scope-p #5a4cb8` / `--scope-r #2a8a59` / `--scope-t #b86b1f` / `--scope-pub #2a3a5e`.

### Spacing / Radius / Control (`reado.css:122-142`)
```css
--r-0: 0; --r-1: 2px; --r-2: 4px; --r-3: 6px; --r-4: 8px; --r-pill: 999px; --r-glass: 20px;
--sp-1:4px --sp-2:8px --sp-3:12px --sp-4:16px --sp-5:24px --sp-6:32px --sp-7:48px --sp-8:64px
--control-h-sm: 32px; --control-h-md: 40px; --control-h-lg: 56px; --fab-size: 60px;
--nav-height: 80px; --shell: 1280px; --pad-x: clamp(20px, 3vw, 40px);
--ref-rail-w: clamp(200px, 18vw, 260px);
```
브레이크포인트(리터럴): 360/480/640/768/1024/1280. 1024 = nav 데스크톱 분기.

### Shadow (tinted, `reado.css:145-146,267-268`)
```css
--shadow-pop: 0 1px 2px rgba(17,20,24,.05), 0 6px 24px -10px rgba(17,20,24,.12);
--shadow-fab: 0 2px 8px rgba(17,20,24,.10), 0 10px 28px -8px rgba(17,20,24,.18);
--shadow-glass: 0 8px 24px -6px rgba(28,56,104,.16);
```
다크: alpha .30~.50 재정의.

### Motion
```css
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
--dur-micro: 120ms; --dur-fast: 200ms; --dur-base: 280ms; --dur-slow: 480ms;
```

### z-index
`--z-content:5 --z-sticky:20 --z-overlay:50 --z-nav:100 --z-chat-panel:940 --z-chat-fab:950 --z-modal:1000 --z-notification:1050 --z-onboarding:1100`

### Sky-glass v10 토큰 (`reado.css:148-190`) — surfaces 보고서와 동일 + 추가:
`--sky-default-grad: var(--sky-grad-dusk)`. 하늘 위 텍스트: `--sky-ink-1 #fff` ~ `--sky-ink-4 rgba(255,255,255,.50)`, `--sky-ink-on-aqi #13301f`, `--sky-accent #4f93d4`, `--sky-text-shadow 0 1px 3px rgba(12,20,48,.45)`.

### 폰트 스택 토큰
```css
--serif: "Plus Jakarta Sans", "Inter", sans-serif;   /* 변수명과 실 폰트 불일치 주의 */
--sans:  "Inter", sans-serif;
--crimson: "Crimson Pro", Georgia, serif;
--mono:  "JetBrains Mono", monospace;
```

## 2. `packages/design-tokens` — TS 미러 (레거시, drift)

`@airlens/design-tokens` v0.1.0. reado.css가 SOT (2026-06-18 결정). `WIREFRAME_INK['1']='#111418'`/`WIREFRAME_PAPER['1']='#fafaf7'` 등 구 paper-ink v9 잔재로 값 다름. `src/aqi-grades.ts`의 `AQI_GRADE_HEX`(7-tier EPA) + `AQI_BREAKPOINTS`는 최신·웹/앱 공유. `WIREFRAME_BREAKPOINTS`(768/1024/1440)도 reado.css와 다름. `WIREFRAME_FONTS.serif`는 Fraunces 참조(실 미로드).

## 3. 타이포그래피 — 13-class (`reado.css:307-424`)

```css
.h-hero  { font-family: var(--serif); font-weight: 800; font-size: clamp(56px,7vw,96px); letter-spacing: -.05em; line-height: 1; color: var(--ink-0); }
.h-2     { font-family: var(--serif); font-weight: 800; font-size: clamp(24px,6vw,32px); letter-spacing: -.04em; line-height: 1.1; }
.h-3     { font-family: var(--serif); font-weight: 700; font-size: clamp(20px,5vw,24px); letter-spacing: -.025em; line-height: 1.2; }
.t-body  { font-family: var(--sans); font-size: 15px; line-height: 1.6; color: var(--ink-1); }
.t-lede  { font-family: var(--crimson); font-size: 18px; line-height: 1.6; color: var(--ink-1); }
.t-quote { font-family: var(--crimson); font-style: italic; font-size: clamp(20px,2.4vw,28px); line-height: 1.55; }
.t-caveat{ font-family: var(--crimson); font-style: italic; font-size: 14px; line-height: 1.55; border-left: 2px solid var(--ink-0); padding-left: 12px; }
.t-data  { font-family: var(--mono); font-size: 13px; line-height: 1.4; font-variant-numeric: tabular-nums; }
.t-numeric{ font-family: var(--mono); font-weight: 700; font-size: clamp(80px,11vw,144px); line-height: .92; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.t-micro { font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-2); }
.t-tag   { font-family: var(--mono); font-size: 11px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-1); }
.t-caption{ font-family: var(--sans); font-size: 11px; line-height: 1.4; color: var(--ink-2); }
.t-bi-ko { font-family: var(--sans); font-weight: 700; font-size: 20px; letter-spacing: -.02em; }
.t-bi-en { font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-1); }
```
`.a11y-only` 스크린리더 패턴 (`reado.css:361-371`). `.mark`/`.mark--yellow`는 문서화만 되고 **미구현**(grep 0건, `reado.css:306` 주석 — P5b/P6 보류). 색상 후보: `--highlighter #FFD84A`, `--orange #FF5C00`. 페이지 전용: `.page-title`(sans 800, clamp(40px,5.6vw,80px), `reado.css:578`).

## 4. 폰트 로딩

### Google Fonts (`apps/web/index.html:55-62`) — preconnect + preload + stylesheet 3단
| 폰트 | 웨이트 | 용도 |
|---|---|---|
| Inter | 400/500/600/700/800 | `--sans` 본문/UI |
| Plus Jakarta Sans | 400~900 | `--serif` hero/heading |
| Crimson Pro | ital 400-700, roman 400/500 | `--crimson` 인용/caveat |
| JetBrains Mono | 400/500/600 | `--mono` 데이터/라벨 |

### 로컬 woff2 (`apps/web/public/fonts/observatory/`, @font-face = `observatory-shared.css:26-29`)
| 파일 | family | weight | 용도 |
|---|---|---|---|
| og-black.woff2 | Overused Grotesk | 900 | obs 디스플레이 대형 |
| og-medium.woff2 | Overused Grotesk | 500 | obs 디스플레이 중간 |
| mm-regular.woff2 | Martian Mono | 400 | obs mono 라벨 |
| mm-bold.woff2 | Martian Mono | 700 | obs mono 강조 |
`LICENSE.md` 동봉 — 재사용 전 확인. 주의: `**`+`/` CSS 코멘트 종료 시퀀스 버그로 @font-face 누락 사례 있음.

### 미로드 참조: Fraunces(잔재), Noto Sans KR(폴백만), Apple SD Gothic Neo/SUIT Variable(OS 폴백).

## 5. OBS 토큰계 (`observatory-shared.css`) — 실측 15토큰
(surfaces 보고서와 동일. 보조 클래스: `.m`/`.m-b`/`.num`/`.obs-hud-label`/`.obs-dqss`(border rgba(232,236,244,.4))/`.obs-cnr`(animation obs-cnr .7s var(--obs-ez) .3s forwards). keyframes: obs-cnr/obs-pulse/obs-rise.)

## 6. 다크모드 요약
전환 = `:scope[data-theme="dark"]` 단일 체인(`reado.css:257-295`). `reado-dark.css`는 컴포넌트 셀렉터 오버라이드만(변수 없음).

### 파일 경로 정리
- 토큰 SOT: `apps/web/src/reado.css` (4958행)
- 다크 레이아웃: `apps/web/src/reado-dark.css`
- OBS: `apps/web/src/styles/observatory-shared.css`
- import 체인: `apps/web/src/index.css`
- 폰트: `apps/web/index.html:55-62` + `public/fonts/observatory/*.woff2` + LICENSE.md
- TS 토큰(레거시): `packages/design-tokens/src/{index,wireframe,aqi-grades}.ts`
- 문서: `apps/web/DESIGN.md`, `.claude/rules/policy/design-taxonomy.md`
