/**
 * breakpoints.ts — 뷰포트 브레이크포인트의 JS 쪽 단일 정본 (responsive W6).
 *
 * CSS 정본은 reado.css 의 canonical 6종 정책 주석 — native `@media` 는 var() 를
 * 읽지 못하므로 CSS 는 literal 을 유지하고, `styles/breakpoints-parity.test.ts`
 * 가 전체 css 의 @media 값이 이 집합의 부분집합인지 기계 대조한다. JS 쪽은
 * 반드시 이 모듈을 import — 컴포넌트 로컬 상수/matchMedia literal 금지
 * (scripts/ci/design-lint.mjs breakpoint 축이 diff 에서 강제).
 */
export const BP = {
  XS: 360,
  SM: 480,
  MD: 640,
  LG: 768,
  XL: 1024,
  XXL: 1280,
} as const;

export type Breakpoint = (typeof BP)[keyof typeof BP];

/** 의미 별칭 — 값이 아니라 의도를 소비처에 드러낸다. */
export const NAV_DESKTOP: Breakpoint = BP.XL; // Navbar 데스크톱 메뉴 전환
export const OBS_HUD_COLLAPSE: Breakpoint = BP.LG; // Observatory HUD 축소 (obs css 4종과 동치)
export const MOBILE_GPU_MAX: Breakpoint = BP.LG; // adaptiveQuality 모바일 GPU 휴리스틱

/** matchMedia 용 쿼리 문자열 헬퍼 — CSS 의 `@media (max-width: …)` 와 동형. */
export function maxWidthQuery(px: Breakpoint): string {
  return `(max-width: ${px}px)`;
}

/** 배타 보수 `(max-width: px-1)` — CSS 의 `max-width: 1023px` + `design-lint-ok: breakpoint — exclusive
 * complement` 관례와 동형 (예: NAV_DESKTOP 미만 = 햄버거 내비 구간). literal 없이 정본값에서 파생. */
export function belowWidthQuery(px: Breakpoint): string {
  return `(max-width: ${px - 1}px)`;
}

/** `(min-width: …)` 짝 — 데스크톱 쪽 조건 (예: NAV_DESKTOP 이상에서 모바일 메뉴 무효). */
export function minWidthQuery(px: Breakpoint): string {
  return `(min-width: ${px}px)`;
}
