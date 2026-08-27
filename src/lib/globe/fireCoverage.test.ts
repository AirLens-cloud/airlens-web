/**
 * fireCoverage — 화재 피드 절단 공개의 순수 로직.
 *
 * 픽스처는 `scripts/etl/test_collect_firms.py:149-162` 가 검증하는 실제 발행
 * 페이로드 모양을 따른다 (count / totalDetections / capped / minFrpPublished /
 * refTime). 발행 쪽 스키마가 바뀌면 여기가 먼저 깨져야 한다 — 컬럼이 빠진 걸
 * 모른 채 가드가 무음 통과하는 사고를 이 계약이 막는다.
 */
import { describe, it, expect } from 'vitest';
import { buildFireCoverage, feedAgeHours, isStale } from './fireCoverage';
import { FIRE_FRESHNESS_SLA_H } from '../config/globeOntology';

/** 고정 시계 — 픽스처 refTime 보다 6시간 뒤. */
const NOW = Date.parse('2026-07-30T06:00:00Z');

/** collect_firms.py 가 실제로 쓰는 발행 페이로드 (fires 는 길이만 의미 있음). */
function publishedFeed(over: Record<string, unknown> = {}) {
  return {
    refTime: '2026-07-30T00:00:00+00:00',
    source: 'VIIRS_SNPP_NRT',
    area: 'world',
    dayRange: 1,
    count: 20000,
    fires: [],
    totalDetections: 73233,
    capped: true,
    minFrpPublished: 12.4,
    ...over,
  };
}

describe('buildFireCoverage', () => {
  it('절단된 발행물에서 3단(렌더/발행/탐지)을 모두 보존한다', () => {
    // Arrange
    const feed = publishedFeed();

    // Act
    const c = buildFireCoverage(feed, 5000, NOW);

    // Assert
    expect(c).toEqual({
      rendered: 5000,
      published: 20000,
      detected: 73233,
      capped: true,
      minFrpPublished: 12.4,
      refTime: '2026-07-30T00:00:00+00:00',
      ageHours: 6,
      stale: false,
    });
  });

  it('SLA 를 넘긴 피드는 stale 로 표시한다 — 2026-07-31~08-08 실제 정지 구간 재현', () => {
    // Arrange — 프로덕션에서 실제로 관측된 값: 수집이 07-30T19:53 이후 37회 연속
    // 실패해 피드가 그 시각에 고정됐고, 화면은 그걸 계속 렌더했다.
    const feed = publishedFeed({ refTime: '2026-07-30T19:53:06.119693+00:00', count: 20000 });
    const eightDaysLater = Date.parse('2026-08-08T07:16:00Z');

    // Act
    const c = buildFireCoverage(feed, 5000, eightDaysLater);

    // Assert
    expect(c?.stale).toBe(true);
    expect(Math.floor(c!.ageHours! / 24)).toBe(8);
  });

  it('발행 시각을 모르면 stale 로 단정하지 않는다', () => {
    // Arrange
    const feed = publishedFeed({ refTime: undefined });

    // Act
    const c = buildFireCoverage(feed, 5000, NOW);

    // Assert — 모르는 것(null)과 고장(true)은 다르다
    expect(c?.ageHours).toBeNull();
    expect(c?.stale).toBe(false);
  });

  it('발행 시각이 없으면 나이도 null — 신선한 것처럼 보이게 두지 않는다', () => {
    // Arrange
    const feed = publishedFeed({ refTime: undefined });

    // Act
    const c = buildFireCoverage(feed, 5000, NOW);

    // Assert
    expect(c?.refTime).toBeNull();
    expect(c?.ageHours).toBeNull();
  });

  it('안 잘린 발행물에서는 최저 FRP 를 버린다 — 없는 기준을 말하지 않는다', () => {
    // Arrange — 발행물도 이때 minFrpPublished 를 null 로 싣는다
    const feed = publishedFeed({ count: 120, totalDetections: 120, capped: false, minFrpPublished: null });

    // Act
    const c = buildFireCoverage(feed, 120, NOW);

    // Assert
    expect(c?.capped).toBe(false);
    expect(c?.minFrpPublished).toBeNull();
    expect(c?.published).toBe(120);
    expect(c?.detected).toBe(120);
  });

  it('탐지 총량 필드가 없으면 null 로 남긴다 — 0 이나 발행 수로 갈음하지 않는다', () => {
    // Arrange — 구 발행물(절단 필드 도입 전) 모양
    const feed = { refTime: '2026-07-30T00:00:00+00:00', count: 300, fires: [] };

    // Act
    const c = buildFireCoverage(feed, 300, NOW);

    // Assert
    expect(c?.detected).toBeNull();
    expect(c?.capped).toBe(false);
    expect(c?.minFrpPublished).toBeNull();
  });

  it('capped 선언이 없어도 탐지>발행 이면 잘린 것으로 본다', () => {
    // Arrange
    const feed = { count: 100, fires: [], totalDetections: 400 };

    // Act
    const c = buildFireCoverage(feed, 100, NOW);

    // Assert
    expect(c?.capped).toBe(true);
  });

  it('렌더 수는 발행 수를 넘지 않는다', () => {
    // Arrange — 메시 용량이 발행 수보다 큰 경우
    const feed = publishedFeed({ count: 40, totalDetections: 40, capped: false, minFrpPublished: null });

    // Act
    const c = buildFireCoverage(feed, 5000, NOW);

    // Assert
    expect(c?.rendered).toBe(40);
  });

  it('발행 수를 못 읽으면 null — 렌더 수만으로 "이게 전부" 라고 말하지 않는다', () => {
    // Arrange / Act / Assert
    expect(buildFireCoverage({ fires: undefined }, 10, NOW)).toBeNull();
    expect(buildFireCoverage({ count: 'many', fires: undefined }, 10, NOW)).toBeNull();
    expect(buildFireCoverage(null, 10, NOW)).toBeNull();
    expect(buildFireCoverage('nope', 10, NOW)).toBeNull();
  });

  it('fires 배열만 있으면 그 길이를 발행 수로 본다', () => {
    // Arrange
    const feed = { fires: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }] };

    // Act
    const c = buildFireCoverage(feed, 2, NOW);

    // Assert
    expect(c?.published).toBe(2);
  });

  it('비유한 수치는 통과시키지 않는다', () => {
    // Arrange
    const feed = publishedFeed({ totalDetections: Number.NaN, minFrpPublished: Number.POSITIVE_INFINITY });

    // Act
    const c = buildFireCoverage(feed, 5000, NOW);

    // Assert
    expect(c?.detected).toBeNull();
    expect(c?.minFrpPublished).toBeNull();
    expect(c?.capped).toBe(true); // 발행물의 선언(capped:true)은 그대로 존중
  });
});

describe('feedAgeHours', () => {
  it('발행 시각의 나이를 시간으로 준다', () => {
    // Arrange
    const now = Date.parse('2026-07-30T12:00:00Z');

    // Act
    const age = feedAgeHours('2026-07-30T00:00:00Z', now);

    // Assert
    expect(age).toBe(12);
  });

  it('미래 시각·파싱 불가·부재는 null — 모르는 것과 "방금" 을 섞지 않는다', () => {
    // Arrange
    const now = Date.parse('2026-07-30T12:00:00Z');

    // Act / Assert
    expect(feedAgeHours('2026-07-31T00:00:00Z', now)).toBeNull();
    expect(feedAgeHours('어제', now)).toBeNull();
    expect(feedAgeHours(null, now)).toBeNull();
  });
});

describe('isStale', () => {
  it('SLA 경계는 초과일 때만 stale — 정확히 SLA 면 아직 계약 안이다', () => {
    // Arrange / Act / Assert
    expect(isStale(FIRE_FRESHNESS_SLA_H)).toBe(false);
    expect(isStale(FIRE_FRESHNESS_SLA_H + 0.1)).toBe(true);
  });

  it('나이를 모르면 false — 미측정을 고장으로 보고하지 않는다', () => {
    // Arrange / Act / Assert
    expect(isStale(null)).toBe(false);
  });

  it('임계값은 수집기(firms-collect.yml MAX_STALENESS_HOURS)와 같은 계약이다', () => {
    // Arrange / Act / Assert — 여기가 갈라지면 CI 는 붉은데 UI 는 태연해진다
    expect(FIRE_FRESHNESS_SLA_H).toBe(18);
  });
});
