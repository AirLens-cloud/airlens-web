# 01 · UI/UX 감사와 고도화 설계도

캡처: `screenshots/today-hero.jpg` · `today-below.jpg` · `globe.jpg` · `globe-hud-zoom.png` · `insights.jpg` (2026-09-05 09:40 KST, 1568×765).
시각 버전: `pages/airlens-ux-audit.html` (캡처 위 번호 핀 = 아래 번호).

## 0. 총평

| | |
|---|---|
| 강점 | Insights의 효과값·95% CI·p·처리 정의·DQSS B 배치, Today의 'withheld' 명시, Globe의 비활성 렌즈 사유 표기 — 경쟁 서비스에 없는 Glass-box 언어. 지켜야 할 것. |
| 핵심 문제 | 정직함(낡음·없음·미구현)을 전부 **회색·투명도·비활성**으로 표현해 첫 방문자에게 '로딩 실패/고장'으로 읽힘. Globe 무대가 빈 상태가 치명적. |
| 방향 | 정직함을 **형태**로(배지·점선 자리표시·띠 두께·호흡), 숫자와 구체는 항상 100% 잉크. 아이콘 3종→1종, 크롬 3줄→1줄. |

### 스코어카드 (0–5, 판단값)

| 페이지 | 첫인상 | 위계 | Glass-box 정직성 | 탐색·IA | 접근성 | 일관성 |
|---|---|---|---|---|---|---|
| Today | 2 | 3 | 4 | 3 | 2 | 3 |
| Globe | 1 | 2 | 4 | 2 | 3 | 2 |
| Insights | 4 | 4 | 5 | 3 | 3 | 4 |
| 공통 크롬 | 3 | 3 | 3 | 3 | 2 | 2 |

## 1. Today (`/`) — `screenshots/today-hero.jpg`

| # | 심각도 | 문제 | 근거 | 고도화 |
|---|---|---|---|---|
| 1 | CRITICAL | 페이지의 주인공 숫자가 가장 안 보임 | `home.css` `.home-hero__value--muted { opacity: .55 }` — 틴트 배경 위 '11'이 거의 사라짐 | 숫자는 항상 100% 잉크. stale/forecast 상태는 숫자 **옆 배지**·점선 밑줄로 |
| 2 | CRITICAL | 기본 CTA('내 위치 사용') 라벨이 안 보임 | 짙은 네이비 채움 위 짙은 텍스트, 실측 대비 ≈1.3:1 | `--ink-on-accent` 강제. `surfaces.css` 잉크 반전 규칙이 `.glass-card[data-aqi] .btn` 내부까지 전파되게 |
| 3 | WARN | 'updated 19h ago'가 각주 크기 | 11px 모노 한 줄 | 숫자 옆 **STALE 19h** 칩(주황 외곽선). 12h 초과 시 히어로 틴트를 중립 회색으로 강등 |
| 4 | WARN | withheld / not published 블록이 고장처럼 보임 | obs age · DQSS · p10–p90 세 줄 전부 회색 이탤릭 '없음' | 빈 값도 자리표시 형태로: 밴드 자리 점선 브래킷, DQSS 자리 빈 배지 윤곽 + 사유 툴팁. 'Why this number?'를 블록 제목으로 승격 |
| 5 | INFO | 24h 차트에 밴드 자리가 없음 | 선 하나 | 밴드가 있을 때와 같은 높이 확보. 'No band published' 라벨 유지 |

## 2. Globe (`/globe`) — `screenshots/globe.jpg`

| # | 심각도 | 문제 | 근거 | 고도화 |
|---|---|---|---|---|
| 1 | CRITICAL | 무대가 비어 있음 — 15초 후에도 LOADING | 테스트 Chrome(WebGL 지원) 1회 관찰. 스켈레톤·진행률·실패 사유 없음. `GlobeFallback`은 WebGL 미지원만 처리, '느린 로딩'과 '실패' 구분 없음 (`Globe3DScene.tsx`, `Globe.tsx`) | ① 즉시 와이어프레임 구체 + 'Loading globe engine · x/2.1 MB' ② 8s 타임아웃 후 'Open Map view' CTA ③ 원인(WebGL ctx / chunk 404 / fetch)을 HUD status `UNAVAILABLE · reason`으로 |
| 2 | WARN | 무대 위 크롬 3단 = 128px (뷰포트 17%) | HUD 스트립 + 모드 레일 + 증거 행 (`Globe.tsx` `.gobs-hud` / `.globe-mode-row` / `.globe-evidence-row`) | 한 줄 HUD: [모드 탭 5] · [레이어·단위] · [status + VALID] · [Globe/Map/Table]. 증거 카드는 선택 시 우측 슬라이드-인 |
| 3 | WARN | 레이어 패널 22개 칩, 위계 없음. 기본 Field = NONE | Field 15 + Layers 4가 같은 크기 (`GlobeLayerToggles`) | 기본 Field = **PM2.5 ON**. 1차 그룹 3개(Air / Weather / Events) + More. 칩 → 아이콘+라벨 토글(`globe-kit/icons` layer-*) |
| 4 | INFO | 범례 카드 350×130 상시 노출 | 풍속 범례 + 문장 2줄 + DQSS 각주 | 1줄 색띠 + 접이식. 각주는 HUD status 툴팁으로 |
| 5 | INFO | 'Pin current scene' 비활성 + 빈 Compare 트레이 | 선택 없을 때 빈 트레이가 떠 있음 | 선택 전 숨김, 첫 선택 시 토스트로 존재 알림 |
| 6 | INFO | 위치 캡슐이 무대 위 부유 | 'SEOUL · APPROXIMATE · 11' 캡슐이 구체와 무관한 상단 중앙 | 선택 관측소 카드로 통합 + 구체 해당 위치에 reticle 스프라이트 + 리더 라인 |

## 3. Insights (`/insights?country=AT`) — `screenshots/insights.jpg`

| # | 심각도 | 문제 | 고도화 |
|---|---|---|---|
| 1 | WARN | 이모지 국기가 히어로 — OS/폰트 의존, Windows Chrome은 'AT' 폴백 | `public/flags/*.png`(레포에 250개 존재)로 교체, 24px 사각 크롭 + 1px 룰 |
| 2 | WARN | 국가 선택이 네이티브 `<select>` (119개, 검색/최근/그룹 없음) | 타이핑 검색 콤보박스(지역 그룹 + 최근 3 + Significant 필터). Globe 국가 클릭 ↔ 딥링크 상태 공유 |
| 3 | INFO | 원시 타임스탬프 `2026-08-26T12:47:24.859234+00:00` | 'Estimated 26 Aug 2026 · 9 days ago' + 원문 `title` |
| 4 | **GOOD** | 효과값 · 95% CI · p · 처리 정의 · DQSS B 한 시선 안 | 이 레이아웃을 Today 히어로·Globe 증거 카드의 기준 패턴으로 역수출 |
| 5 | INFO | National standards 막대 26개 세로 나열 | 선택 국가 ± 이웃 5 + WHO 5 µg/m³ 기준선 기본, 전체는 펼치기 |

## 4. 공통 크롬

- **아이덴티티 3종 불일치** — 탭 `favicon.svg`(#863bff 보라 번개, 템플릿 잔재 추정) · `og-icon.png`(512² 스펙트럼 막대) · GlobalNav 인라인 잉크 막대. `apple-touch-icon`·`manifest.json`·PNG 폴백 링크 없음. → `02-icon-system.md`
- **테마 토글 없음** — `tokens.css`는 3-state 준비됨. Globe(항상 야간) ↔ Today(주간 틴트) 전환 시 명암 급변.
- **모노 대문자 라벨 과다** — Today 한 화면 14개. 킥커 1 + 값 라벨만 남기고 문장으로.
- **웹폰트 4패밀리** — Plus Jakarta Sans는 `--serif` 토큰명으로 h1 한 곳. 제거 후보 → Inter 800.
- **한·영 혼재** — Stories 한국어 제목에 `lang="ko"` 없음(스크린리더).
- **푸터 MAP 열 비어 있음** — 열 제거 또는 Globe/Map/Table 딥링크.

## 5. 설계 원칙 (모든 제안의 뿌리)

1. **숫자가 주인공** — PM2.5 값·효과값·풍속은 어떤 상태에서도 100% 잉크, 가장 큰 활자. 상태는 숫자를 흐리지 않고 옆에 붙는다.
2. **정직함은 형태로** — 낡음·없음·미구현을 회색/투명도로 말하지 않는다. 배지(STALE 19h), 점선 자리표시(밴드 없음), 띠 두께(불확실성), 호흡 정지(stale), 사유 문장(비활성 렌즈).
3. **한 화면 한 결정** — Today = "밖에 나가도 되나", Globe = "어디가 나쁜가", Insights = "정책이 효과가 있었나". 크롬은 그 결정에 필요한 것만 첫 화면에.

기존 DESIGN 규칙(Paper-Ink · 주황 단일 액센트 · 사각 도그마 · obs 시안 스코프)은 유지.

## 6. 설계도 — Globe 무대 (After)

```
┌ nav 32px ────────────────────────────────────────────────────────────────┐
│ [◉LIVE][◑FORECAST][△EVENTS][≈FLOW][▦POLICY]  PM2.5·µg/m³ ●READY VALID 09:00 UTC·28m  [Globe|Map|Table] │ ← HUD 1줄 24px
├──────┬───────────────────────────────────────────────────────────┬────────┤
│ AIR  │                                                           │ 증거   │
│ ●PM2.5│                 ( 구체 · PM2.5 field ON )                 │ 카드   │
│ ○PM10│                  reticle + 리더라인 ──────────────────────→│ 슬라이드│
│WEATHER│                                                           │ -인   │
│EVENTS│                                                           │(선택시)│
│+More │                                                           │        │
│MARKERS│  [PM2.5 ▬▬▬▬ 0→150+ ▾]  ← 범례 1줄, 접이식               │        │
└──────┴───────────────────────────────────────────────────────────┴────────┘
무대 높이 637 → 760px (+19%). 로딩: 와이어 구체 + 진행률 → 8s 후 'Open Map view' → 실패 시 HUD UNAVAILABLE·사유.
```

Today 히어로(After): `11`(100% 잉크, 96px) · `µg/m³` · 칩 [● GOOD][◷ STALE 19h][FORECAST] · 우측 p10–p90 점선 자리표시 + DQSS 빈 배지 윤곽 + 'Why this number? →' · 하단 CTA 두 개(대비 AA).

## 7. 시스템 층 추가

| # | 컴포넌트/토큰 | 내용 |
|---|---|---|
| 1 | `<StateChip>` | stale · forecast · approximate · withheld · experimental 5종. 아이콘+라벨+시간. 색 아닌 외곽선/채움 형태로 구분 |
| 2 | `<BandSlot>` | p10–p90 있으면 띠, 없으면 점선 브래킷 + 사유. Today·Globe 카드·Insights CI 공용 |
| 3 | 아이콘 1벌 | `icons-v2` 마크 + `globe-kit/icons` 25심볼 + 기존 `icons.svg`를 `public/icons/` 한 시트로 |
| 4 | 테마 토글 + 전환 완화 | 내비 우측 system/light/dark. Globe→Today 280ms 크로스페이드 |
| 5 | 라벨 예산 | 화면당 모노 대문자 킥커 ≤ 6 (리뷰 체크리스트) |
| 6 | 폰트 다이어트 | Plus Jakarta Sans 제거 → 3패밀리(Inter · JetBrains Mono · Crimson Pro) |

## 8. 로드맵 (독립 PR 단위)

| 단계 | 작업 | 파일 | 효과 |
|---|---|---|---|
| **P0** (1주) | Globe 로딩 스켈레톤 + 8s Map 폴백 + 실패 사유 HUD | `Globe3DScene.tsx` · `Globe.tsx` · `globe-stage.css` | 빈 무대 제거 |
| P0 | Today 히어로 숫자 100% + STALE 칩 + CTA 대비 | `home.css` · `surfaces.css` · Home 히어로 | 대비 1.3 → 4.5:1+ |
| P0 | Globe 기본 Field = PM2.5 | `globeStore.ts` 초기 상태 | 첫 화면에 데이터 |
| P0 | 파비콘 교체 + apple-touch-icon + manifest + og-image 1200×630 | `public/` · `index.html` | 아이덴티티 1종화 (`02-icon-system.md`) |
| **P1** (2–3주) | Globe 크롬 3줄→1줄 HUD, 증거 카드 슬라이드-인 | `Globe.tsx` · `GlobeObsHud` · `AtmosphericEvidenceCard` · `globe-stage.css` | 무대 +19% |
| P1 | 레이어 패널 3그룹 + More, 아이콘 토글 | `GlobeLayerToggles.tsx` · `globeOverlays.ts` | 22칩 → 7 + More |
| P1 | 예측 마커 띠-두께 스프라이트 + 관측소 스프라이트 | `PredictionMarkers.tsx` · `stationIconAtlas.ts` · `spriteKit.ts` | 불확실성 형태 채널 (`03-globe-sprite-kit.md`) |
| P1 | StateChip · BandSlot 도입 | `src/components/content/` | 정직함 문법 통일 |
| P1 | Insights 국기 PNG · 콤보박스 · 타임스탬프 포맷 | `Insights.tsx` · `public/flags` | 탐색 속도 |
| P1 | 모션 토큰 + 마커 스프링 등장/호흡 + 레일 액체 인디케이터 | `motion.css` · `PredictionMarkers.tsx` · `AtmosphericModeRail.tsx` | `04-motion-system.md` |
| **P2** | 테마 토글 + 크로스페이드 | `GlobalNav.tsx` · `tokens.css` · `motion.css` | 명암 급변 완화 |
| P2 | 모드 레일 SVG 심볼, 범례 접이식, Compare 조건부 | `AtmosphericModeRail` · `GlobeLegend` · `CompareTray` | 다듬기 |
| P2 | 폰트 다이어트 · 라벨 예산 · lang 속성 · 푸터 MAP 열 | `index.html` · `typography.css` · `chrome.css` · Footer | 일관성 |

> Globe 무대 미렌더는 테스트 브라우저 1회 관찰 — 재현 확인 필요. 스켈레톤·타임아웃 부재는 코드로 확인된 사실.
