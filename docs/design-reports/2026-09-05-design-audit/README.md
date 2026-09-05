# AirLens 디자인 감사 · 아이콘 · 모션 — 2026-09-05

> Claude Code에 넘길 때: 이 README를 먼저 읽히고, 작업 항목에 따라 아래 문서 하나를 지정하세요.
> 예) `docs/design-reports/2026-09-05-design-audit/README.md 읽고, 01-ux-audit.md 의 P0 항목부터 구현해줘`

라이브 `airlens.cloud` 3개 페이지(Today·Globe·Insights)를 2026-09-05 09:40 KST, Chrome 1568×765에서 실측 캡처하고
`airlens-web` 소스(tokens.css · home.css · globe-stage.css · Globe.tsx · PredictionMarkers.tsx 등)와 대조한 결과입니다.
점수·심각도는 휴리스틱 리뷰(Nielsen 10 + Glass-box 원칙 + WCAG 2.2 AA) 기준의 판단이며 사용자 테스트 데이터가 아닙니다.

## 문서

| 파일 | 내용 | 쓰임 |
|---|---|---|
| `01-ux-audit.md` | 페이지별 진단(번호 주석 ↔ `screenshots/`) · 공통 크롬 · 원칙 3 · 설계도 · P0/P1/P2 로드맵 | 구현 백로그의 정본 |
| `02-icon-system.md` | 현 자산 감사 → v1 플랫 5안 → **v2 Liquid Lens 3안(추천)** · 파일 매핑 · index.html 교체 스니펫 | 파비콘/앱 아이콘/OG 교체 |
| `03-globe-sprite-kit.md` | 마커·입자·LUT·UI 심볼 키트, 절차적 캔버스 텍스처 → 파일 자산 교체 순서 | Globe 레이어 리팩토링 |
| `04-motion-system.md` | 애플 스타일 모션 토큰(스프링 4종·지속 6종) · 8장면 스펙 · R3F 스프링 공식 | motion.css · 마커·레일·토글 |

## 자산

| 폴더 | 내용 |
|---|---|
| `icons-v2/{liquid-band,liquid-aperture,globe-lens}/` | **채택 후보.** `favicon.svg`(플랫·테마 대응) · `favicon-16/32-{light,dark}.png` · `apple-touch-icon.png`(180) · `icon-192/512/1024.png` · `mark.svg`(투명 유리 마크, nav용) · `og-image.png`(1200×630) · `app-icon.svg`. 재생성: `icons_v2.py` → `raster.py`(Playwright) |
| `icons-v1/{A..E}/` | 플랫 5안(참고용). `manifest.webmanifest.example.json` 포함 |
| `globe-kit/` | `sprites/*.png|svg`(white-on-alpha) · `lut/*.png`(256×1) · `icons/globe-icons.svg`(25 symbol) · `spriteKit.ts`(로더) · `gen_globe_kit.py` |
| `pages/*.html` | 위 네 문서의 시각 버전(단일 HTML, 브라우저로 열기). 아티팩트와 동일 내용 |
| `screenshots/` | 진단 근거 캡처 원본 |

## 한 줄 요약

- **아이덴티티**: 탭(보라 번개)·OG(스펙트럼)·내비(잉크 막대) 3종 불일치 + apple-touch-icon/manifest 누락 → `icons-v2/liquid-band` 채택 권고.
- **UX 핵심 문제**: 정직함(낡음·없음·미구현)을 전부 회색/투명도/비활성으로 표현해 '고장'처럼 읽힘. 히어로 숫자 opacity .55, CTA 대비 ≈1.3:1, Globe 무대 빈 검정 + LOADING.
- **방향**: 숫자·구체는 항상 100% 잉크, 상태는 형태(배지·점선·띠 두께·호흡)로. 크롬 3줄→1줄. 기본 Field = PM2.5.
- **모션**: `--ease-ios / --ease-spring / --ease-spring-soft / --ease-out-expo` + `--dur-ambient`. transform·opacity만, reduced-motion 시 ambient 정지.
