/**
 * 화재 피드의 절단 사실을 화면에 옮기기 위한 순수 함수들.
 *
 * `collect_firms.py` 는 발행물에 `totalDetections`/`capped`/`minFrpPublished`
 * 를 실어 "부분을 전체로 위장하지 않는다" 를 지킨다. 그런데 프론트가 `fires`
 * 만 읽어서 그 정직함이 화면까지 오지 못했다. 절단은 실제로 3단이다 —
 * 탐지 → 발행(버킷 5MB + 전송량) → 렌더(인스턴스 메시 용량).
 *
 * 여기서는 값을 만들지 않는다. 필드가 없으면 null 로 남기고, 서술은 호출부가
 * i18n 으로 한다.
 */
import { FIRE_FRESHNESS_SLA_H } from '../config/globeOntology';
import type { FireCoverage } from '../../types/globe';

/** 유한한 비음수만 통과. 그 외(NaN/Infinity/음수/비수치)는 null. */
function finiteCount(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * 발행물 JSON + 실제 렌더 수 → `FireCoverage`.
 *
 * `published` 를 못 읽으면(필드 부재/형식 이상) null 을 반환한다 — 렌더 수만으로
 * "이게 전부" 라고 말하는 편이 더 나쁜 거짓이기 때문이다. 호출부는 null 이면
 * 행 자체를 그리지 않는다.
 */
export function buildFireCoverage(
  json: unknown,
  rendered: number,
  nowMs: number,
): FireCoverage | null {
  if (typeof json !== 'object' || json === null) return null;
  const j = json as Record<string, unknown>;

  const published = finiteCount(j.count) ?? (Array.isArray(j.fires) ? j.fires.length : null);
  if (published === null) return null;

  const renderedSafe = finiteCount(rendered) ?? 0;
  const detected = finiteCount(j.totalDetections);

  // capped 는 발행물의 선언을 우선하고, 없을 때만 detected>published 로 유추한다.
  const capped =
    typeof j.capped === 'boolean' ? j.capped : detected !== null && detected > published;

  const minFrp = finiteCount(j.minFrpPublished);
  const refTime = typeof j.refTime === 'string' && j.refTime.length > 0 ? j.refTime : null;
  const age = feedAgeHours(refTime, nowMs);

  return {
    rendered: Math.min(renderedSafe, published),
    published,
    detected,
    capped,
    // 안 잘렸으면 최저 FRP 는 의미가 없다 — 발행물도 null 로 싣는다.
    minFrpPublished: capped ? minFrp : null,
    refTime,
    // 나이는 여기서 한 번만 잰다 — 렌더 중 시계를 읽으면 같은 상태가 매번 다른
    // 결과를 낸다 (react-hooks/purity).
    ageHours: age,
    stale: isStale(age),
  };
}

/**
 * 발행 시각의 나이(시간). 파싱 불가·미래 시각이면 null.
 *
 * 미래를 음수 나이로 표시하면 "방금" 처럼 읽혀서, 모르는 것과 구별되지 않는다.
 */
export function feedAgeHours(refTime: string | null, nowMs: number): number | null {
  if (!refTime) return null;
  const t = Date.parse(refTime);
  if (!Number.isFinite(t)) return null;
  const hours = (nowMs - t) / 3_600_000;
  return hours >= 0 ? hours : null;
}

/**
 * 나이가 수집 SLA 를 넘었는가. 나이를 모르면 false.
 *
 * 임계값은 온톨로지(`fire.pipeline.freshnessSlaH`)가 소유한다 — 수집기
 * (`firms-collect.yml`)와 같은 계약을 화면도 쓰게 하려는 것이므로, 여기에 숫자를
 * 다시 적으면 두 계약이 갈라진다.
 */
export function isStale(ageHours: number | null): boolean {
  return ageHours !== null && ageHours > FIRE_FRESHNESS_SLA_H;
}
