# 02 · 아이콘 시스템 — 현 자산 감사 → Liquid Lens v2

시각 버전: `pages/airlens-mark-study.html`(v1 플랫 5안 비교) · `pages/airlens-liquid-lens.html`(v2 유리 3안, 애니메이션).

## 1. 현재 배포 자산 (airlens-web/public, index.html)

| 자산 | 파일 | 실제 모습 | 문제 |
|---|---|---|---|
| 브라우저 탭 | `public/favicon.svg` | **보라(#863bff) 번개** 모양, display-p3 | 브랜드 무관 — 템플릿 잔재로 추정. 유일한 icon 링크 |
| 공유 카드 | `public/og-icon.png` 512² | 검정 타일 위 시안→주황→적 스펙트럼 막대 | 1200×630 카드에 맞지 않음. JSON-LD logo도 이 파일 |
| 사이트 내 로고 | `GlobalNav.tsx` 인라인 SVG | 잉크 단색 막대 5개 + "AirLens" 모노 | OG와 같은 계열이지만 favicon과 불일치 |
| 누락 | — | `apple-touch-icon`, `manifest.json`, PNG favicon 폴백 | iOS 홈화면 = 페이지 스크린샷, Android 설치 배너 없음, 구형 브라우저 빈 탭 |

셋 중 어느 것도 브랜드 액센트 `--orange #ff5c00`(tokens.css)을 쓰지 않는다.

## 2. v1 플랫 5안 (`icons-v1/`, 참고)

A Aperture(조리개+입자) · B Lens Earth · C Spectrum(기존 계승) · D Band(p50 점 + p10–p90 띠) · E A-Lens 모노그램.
16px 판독성은 A ≥ D ≈ C > E > B. 개념 적합성은 D(Glass-box를 마크에)가 최고. → v2는 D·A·B를 재료로 유리 재질로 재작업.

## 3. v2 Liquid Lens 3안 (`icons-v2/`) — **채택 후보**

공통 재료: 오렌지 유리 링(선형 그라디언트 #ffc08a→#ff6a12→#b83000) · 광원 좌상단 하이라이트(`url(#hl)`) · 아래 그림자(feDropShadow) · 밖으로 번지는 글로우(feGaussianBlur 9) · 타일 radial #1e2a3c→#05080d, rx 58/256(iOS 22.4%).

| 키 | 이름 | 구성 | ambient 모션 | 권고 |
|---|---|---|---|---|
| `liquid-band` | **Liquid Band** | p50 유리 구슬 + p10–p90 유리 띠 + 외곽 얇은 띠 + 대기 림 아크(시안) | 띠 호흡 6s, 코어 맥동, 림 24s 회전 | **주 마크.** Glass-box 원칙(불확실성 공개)을 마크 자체에. Globe 예측 마커·DQSS 배지·로딩 스피너와 같은 문법 |
| `liquid-aperture` | Liquid Aperture | 열린 유리 조리개 + 진주빛 입자 + 점선 궤적 | 링 14s 드리프트, 입자 5.6s 왕복 | 대안. 'Lens' 직설, 16px 판독성 최고 |
| `globe-lens` | Globe Lens | 유리 지구본(격자) + 감싼 렌즈 링 + 대기 글로우 | 격자 18s 자전, 렌즈 16s 드리프트, 대기 4s 맥동 | 가장 화려. Globe 페이지 전용 히어로/로딩 마크로 병용 가능 |

크기 전략: **≤32px = 플랫 폴백**(`favicon.svg`, 필터 없음, `prefers-color-scheme`로 잉크 흑/백 전환), **≥48px = 유리 버전**. 두 버전은 같은 기하(반지름·획 위치)를 공유.

## 4. 파일 → 배포 매핑 (liquid-band 기준)

```
icons-v2/liquid-band/favicon.svg             → public/favicon.svg
icons-v2/liquid-band/favicon-32-light.png    → public/favicon-32.png
icons-v2/liquid-band/favicon-16-light.png    → public/favicon-16.png
icons-v2/liquid-band/apple-touch-icon.png    → public/apple-touch-icon.png   (180, 유리)
icons-v2/liquid-band/icon-192.png, icon-512.png → public/                     (PWA, maskable)
icons-v2/liquid-band/og-image.png            → public/og-image.png           (1200×630)
icons-v2/liquid-band/mark.svg                → src/components/icons/BrandMark.tsx 인라인 (nav ≥24px)
icons-v1/manifest.webmanifest.example.json   → public/manifest.json (icons 경로 확인)
```

`index.html` `<head>`:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0c1015">
<meta property="og:image" content="https://airlens.cloud/og-image.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:image" content="https://airlens.cloud/og-image.png">
```
JSON-LD `Organization.logo`도 `og-image.png` → `icon-512.png`로.

`GlobalNav.tsx`: 막대 심볼만 `mark.svg`로 교체, 워드마크 "AirLens"(JetBrains Mono)는 유지. 스펙트럼 막대는 Insights 데이터 시각화 언어로 남기고 아이덴티티 자리에서 물러남.
`functions/_lib/render.ts`(SSR og 리라이트)가 `og-icon.png`를 참조하면 함께 갱신.

## 5. 재생성

```
cd icons-v2 && python3 icons_v2.py && python3 raster.py   # cairosvg 불필요 — Playwright Chromium으로 필터/그라디언트 래스터
```
