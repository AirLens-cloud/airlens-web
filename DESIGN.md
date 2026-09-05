# DESIGN.md — airlens-web 로컬 디자인 규범

> 2026-09-05 디자인 캠페인("B · Instrument Panel" 시안 확정)에서 창설.
> 상위 규범: `~/Dev_joy/Design/reference-hub/DOCTRINE.md` (Paper-Ink 프리셋 · 8축 · 안티슬롭 12금지) — 이 문서는 그 아래의 **airlens-web 로컬 규범**이며 충돌 시 사용자 결정이 최우선.
> 감사 원칙 3(§8)의 발원: `docs/design-reports/2026-09-05-design-audit/`.

## §1 타입 스케일 (--fs-* 12토큰, tokens.css SOT)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--fs-micro` | 11.5px | mono-caps 최소층 (구 9–10.5px 대체 — 이보다 작은 텍스트 금지) |
| `--fs-tag` | 12px | eyebrow · tag · 배지 |
| `--fs-caption` | 13.5px | 캡션 · 보조 설명 문장 |
| `--fs-data` | 14px | mono tabular 데이터 · 표 본문 |
| `--fs-body-s` | 14px | 축소 본문 |
| `--fs-body` | clamp(15px, 1.8vw, 16px) | 본문 |
| `--fs-lede` | clamp(18px, 2vw, 20px) | 리드 · 카드 타이틀 |
| `--fs-h3` | clamp(20px, 2.4vw, 24px) | 소제목 |
| `--fs-h2` | clamp(24px, 3vw, 32px) | 섹션 제목 |
| `--fs-stat-s` / `--fs-stat` / `--fs-stat-l` | 19px / clamp(22px, 2.6vw, 28px) / 34px | 데이터 블록 값 |

규칙:
- CSS에 font-size **px 리터럴 금지** — `var(--fs-*)`만 (`design-lint.mjs` 강제). 예외: 스케일 밖 대형 디스플레이(40px+ 히어로 수치 등)와 obs 카브아웃.
- 정규 브레이크포인트 세트 = **360 / 480 / 640 / 768 / 1024 / 1280** (`src/lib/breakpoints.ts`). 비정규 값(860px 등) 금지 — lint 강제.
- obs(observatory) 표면은 typography·spacing 축 면제 카브아웃 유지. 단 accent·토큰 정의 규칙은 유효.

## §2 데이터 블록 3층 위계 (Instrument Panel 문법)

```
라벨   --fs-micro  mono-caps  (--ink-2)
값     --fs-stat*  mono bold  (주인공)
설명   --fs-caption 문장체    (--ink-1, mono-caps 금지)
```

- **라벨 밀도 예산: 뷰포트 섹션당 mono-caps ≤8.** 사이즈만 키우면 더 시끄러워진다 — 초과분은 통합·문장 강등·제거.
- 헤어라인 프레임 노출(1px `--rule`), radius 0, 그림자 금지 — Paper-Ink 승계.
- 액센트 오렌지는 화면당 주인공 1곳.

## §3 모션 — 표면 분리 규칙

> **"종이는 스프링하지 않는다. 유리와 계기는 스프링한다."**

| 표면 | 곡선 | 예시 |
|---|---|---|
| 종이 콘텐츠 리빌 | `--ease-out`/`--ease-fluid`만, 오버슛 금지 | .fluid-enter, 본문, 정적 페이지 |
| 인터랙티브 피드백 | `--ease-spring`/`--ease-spring-soft` | 토글 · 칩 · 프레스 |
| 오버레이/글래스 크롬 | `--ease-ios`/`--ease-out-expo` | Globe HUD, 시트, 테마 전환 |
| 앰비언트 | 뷰포트당 루프 **1개 예산** = 브랜드 마크(AirLensMark breathe/pulse) | 새 앰비언트 루프 금지 |

### 5동사 어휘 (진입·리빌 스펙 언어)

- **DRAW** — 헤어라인·룰이 중앙 기점 scaleX로 그려짐
- **REVEAL** — 타입이 overflow 마스크 밖으로 상승 (translateY 100%→0)
- **RISE** — 짧은 리프트 (8–12px, opacity 동반)
- **SETTLE** — scale .965→1 착지 (핀·버튼 등장)
- **FADE** — **풀블리드 배경은 opacity만** — translate 금지(빈 모서리가 끌려 들어옴)

### 런원스 구현 표준

1. reduced-motion이면 **애니메이션 클래스 자체를 미부여** (`useReducedMotion()` — CSS 미디어쿼리에만 의존하지 않는다)
2. 시퀀스 종료 후 잔존 0 — will-change·transform·타이머 정리
3. effect 안 동기 setState 금지 — reduced 경로는 렌더 파생으로 (LoadingVeil 사례)

### 구현 관용구

- **동일 프레임 스왑**: 변형은 형제 DOM + 클래스 토글. `img.src` 재할당 금지(재다운로드 동안 옛 프레임 잔존).
- **의도 기반 warm**: 무거운 리소스는 pointerenter/focus에서 프리페치 + idle 폴백, `prefers-reduced-data` 게이트 동반.
- **µ 단위 스팬**: `text-transform:uppercase`는 µ→Μ("MG/M³")로 망가뜨린다 — 단위 스팬에 `text-transform:none` 필수 (obs.css `.gobs-unit`·globe-stage `.unit` 사례).

## §4 차트 문법 (diagram-design MIT 시각 문법 차용)

1. 데이터 라인 **두꺼운 스트로크 2.5–3px round-cap** (헤어라인 데이터라인 금지)
2. 라인 아래 **면 채움** 8–12% opacity gradient→transparent (`--tint-*`/액센트 재사용)
3. 라인별 **draw-on** 순차 리빌 (stroke-dasharray/pathLength, `--ease-out`만, reduced-motion 게이트)
4. **엔드포인트 강조** — 마지막 데이터점 dot + 값 라벨 ("숫자가 주인공")
5. **액센트 배급** — 시리즈 중 주인공 1개만 오렌지, 나머지 잉크 계조

**Glass-box가 문법에 우선한다**: 추정선(estimate) 아래 면적 데코는 "면적=관측량"으로 오독될 수 있으면 금지 (SdidChart의 명시 계약 — 관측선에 면채움 미적용 사례). p10-p90 밴드·DQSS·CI는 어떤 리디자인에서도 제거 불가. 축·범례 라벨은 `--fs-micro` 이상.

공용 스파크라인: `src/lib/sparkline.ts`.

## §5 배치·패딩 규칙 (2026-09-05 실측 감사 발)

1. 섹션 컨테이너 좌우 마진 비대칭 **≤80px** — 의도된 사이드레일은 주석/PR로 선언 의무
2. 텍스트·카드 요소의 뷰포트 가장자리 최소 이격 = 모바일 **16px** / 데스크톱 **24px** (Globe 스테이지 `--obs-inset`)
3. **데드버튼 0** — 클릭 가능해 보이는 요소(cursor:pointer·버튼 형태)는 실기능 연결 또는 제거
4. 블로그·뉴스 표면은 News Surface Contract 준수 (본문 64ch · summary 60ch · 배지 메타행 ≤3 — trust·cross-links는 하단 2층 강등)
5. 사이드 레일 고정폭 금지 — `clamp()`/`minmax()`로 (legal 220 → clamp(180,16vw,220), methodology 240 → clamp(200,18vw,240) 사례)
6. 그리드 카드가 트랙을 못 채울 때 `auto-fill` 대신 **`auto-fit`** (datasets 좌측 몰림 사고 사례)

## §6 브랜드

- 마크 = **7-bar AirLensMark** (`src/components/AirLensMark.tsx`, 키프레임 motion.css). 유일한 앰비언트 루프.
- 파비콘: 32px+ = 7-bar 원본, **16px = 5-bar 축약 전용본** (7-bar는 16px에서 뭉개짐 — 실픽셀 검증 완료). 자산 재생성 시 16px 실사이즈 판독 게이트 의무.
- 아이콘·OG 자산 8종 파일명 불변 (`public/`).

## §7 반응형 태도

- 태블릿 = **재비례** (시그니처 구성을 스택으로 무너뜨리지 않는다 — 히어로 2열은 768px까지 유지), 폰 = 플로우 전환.
- 고정 컴포지션(시네마틱 무대 한정)이 필요하면 디자인픽셀 스케일 시스템 검토 — 콘텐츠 flow 페이지 반입 금지.

## §8 감사 원칙 3 (승계)

1. **숫자가 주인공** — 데이터 수치가 화면의 앵커. 수치는 `t-data`/`t-numeric`, 본문 폰트로 수치 금지.
2. **정직함은 형태로** — 불확실성(p10-p90·DQSS)·출처·상태(empty/skeleton/error)를 시각 형태로 상시 노출. silent blank 금지.
3. **한 화면 한 결정** — 뷰포트 섹션당 사용자 결정 1개. 경고·CTA 중복 노출 금지 (Globe 이중 경고 단일화 사례).

## History

- 2026-09-05 — 창설. 디자인 캠페인 Wave 0–4: --fs-* 스케일 + 브랜드 스왑(7-bar) + 계기 히어로(Home/Today) + 차트 5문법(Insights) + 배치 감사 수정(V1–V5) + 본 규범 명문화. 시안 게이트 = "B · Instrument Panel" 사용자 확정. 모션 어휘·런원스 표준은 SpaceEdu 스펙 분석에서 기법만 이식.
