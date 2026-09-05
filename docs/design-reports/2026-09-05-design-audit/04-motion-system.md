# 04 · 모션 시스템 — 애플 스타일 스프링

시각 버전(라이브 데모, 라이브러리 없음): `pages/airlens-liquid-lens.html` §01–§04.

## 원칙 (Apple HIG 4 + AirLens 1)

1. **즉답** — 입력 후 100ms 안에 무언가 움직인다. press = `scale(.96)` 100ms(기존 Δ5 계약 유지), 그 뒤에 진짜 전환.
2. **중단 가능** — 진행 중 애니메이션 위에 새 입력이 오면 현재 위치에서 방향을 바꾼다(CSS transition / WAAPI `commitStyles`).
3. **공간 연속** — 요소는 사라졌다 나타나지 않고 이동한다(모드 인디케이터 슬라이드, 카드 슬라이드-인).
4. **물리** — 선형·ease-in-out 대신 스프링. 등장 = overshoot 1.56, 상태 변경 = soft 1.2, 퇴장 = overshoot 없이 out-expo.
5. **불확실성은 호흡한다(AirLens)** — 데이터가 살아 있는 동안 p10–p90 띠가 3.2s 주기로 미세 호흡, **stale이면 정지**. 움직임 = 신선도 신호. 색을 더 쓰지 않는다.

규칙: `transform`·`opacity`만. layout 속성은 FLIP. `prefers-reduced-motion`이면 ambient 정지 + 전환 즉시 완료. Framer Motion 미설치 결정 유지 — CSS + WAAPI로 충분.

## 토큰 (`src/styles/motion.css` 추가분)

```css
:root {
  --ease-ios:         cubic-bezier(.32,.72,0,1);   /* 시트·페이지 전환·카드 슬라이드 */
  --ease-spring:      cubic-bezier(.34,1.56,.64,1);/* 마커·칩·배지 등장 (overshoot) */
  --ease-spring-soft: cubic-bezier(.22,1.2,.36,1); /* 토글·인디케이터·밴드 성장 */
  --ease-out-expo:    cubic-bezier(.16,1,.3,1);    /* 퇴장·펄스 확산·긴 정착 */
  --dur-press: 100ms; --dur-micro: 160ms; --dur-fast: 240ms;
  --dur-base: 360ms;  --dur-slow: 560ms;  --dur-ambient: 6s;
  --stagger: 40ms;
}
@media (prefers-reduced-motion: reduce) { :root { --dur-ambient: 0s; } }
```
기존 `--ease-fluid`·`--ease-out`·`--dur-enter`·`--stagger 60ms`와 공존. 새 컴포넌트는 위 토큰, 기존 것은 점진 이행.

## 장면 스펙

| 장면 | 대상 | 이징·시간 | 비고 |
|---|---|---|---|
| 예측 마커 등장 | `PredictionMarkers` | spring 560ms, 40ms 스태거, scale .2→1 | 등장 후 띠 호흡 3.2s(stale이면 0) |
| 경보 펄스 | `AlertPulse` | out-expo 2.4s, 링 3개 0.8s 간격, scale 1→7, α .9→0 | 위급함 = 반복, 속도 아님 |
| 증거 카드 | `AtmosphericEvidenceCard` | out-expo 360ms, translateX 28→0 + scale .98→1, blur 18px 유리 | 밴드는 p50에서 양쪽으로 soft-spring 성장 |
| 모드 레일 | `AtmosphericModeRail` | 인디케이터 `left/width` soft-spring 360ms | 선택 테두리가 미끄러짐(액체) |
| 레이어 토글 | `GlobeLayerToggles` | 노브 spring 360ms, 누르는 동안 scaleX 1.25 | iOS 스위치 압착 |
| 로딩 | `Globe3DScene` fallback | 와이어 구체 3.2s 자전 + 시안 호 1.4s 회전, 8s 후 'Open Map view' spring 등장 | 빈 검정 금지 |
| Today 숫자 | Home 히어로 | 자릿수 오도미터 out-expo 900ms, 칩 spring-soft 80ms 스태거 | 숫자 100% 잉크 |
| 내비 마크 | `BrandMark` | 로드 시 spring pop(.8→1) 1회, ambient 6s 호흡, hover 1.6s | `liquid-band` 그룹 클래스 `.band-mid/.band-outer/.core/.rim` |

## 중단 가능한 스프링 (WAAPI)

```ts
export function springTo(el: HTMLElement, x: number) {
  const cur = el.getAnimations()[0];
  const from = cur ? getComputedStyle(el).transform : 'none';
  cur?.cancel();
  const a = el.animate([{ transform: from }, { transform: `translateX(${x}px)` }],
    { duration: 360, easing: 'cubic-bezier(.22,1.2,.36,1)', fill: 'forwards' });
  a.finished.then(() => { a.commitStyles(); a.cancel(); });
  return a;
}
```

## R3F(Three.js) 마커 스프링 — 프레임 독립 감쇠

```ts
// k=170, damping=26 ≈ --ease-spring
const s = useRef(0), v = useRef(0);
useFrame((_, dt) => {
  const k = 170, c = 26, target = 1;
  const a = -k * (s.current - target) - c * v.current;
  v.current += a * dt; s.current += v.current * dt;
  _dummy.scale.setScalar(s.current);           // → setMatrixAt(i, _dummy.matrix)
});
// 띠 호흡: scale = 1 + 0.06 * sin(t * 2π / 3.2) * (isStale ? 0 : 1)
```
`usePlatform().prefersReducedMotion`이면 s=1 고정(기존 autoRotate 처리와 동일 패턴).
