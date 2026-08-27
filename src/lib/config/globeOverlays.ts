/**
 * globeOverlays — 오버레이 픽커/범례/HUD 가 쓰는 **파생 표면**.
 *
 * P2 이후 값의 SOT 는 `globeOntology.ts` 다. 본 파일은 그 레지스트리를 각 소비자가 원하는
 * 모양(scale map / color bar / display label)으로 *투영*할 뿐 자체 값을 갖지 않는다 —
 * 그래서 "범례엔 있는데 렌더엔 없다" 류 드리프트가 구조적으로 불가능하다.
 *
 * AQI 색상 3소스(design-tokens SSOT / lib/config/aqi.ts 4-tier / CSS 6-tier)는 의도적 분리 유지 —
 * 본 매핑은 스칼라필드 렌더 스케일만 다룬다 (통일 금지).
 *
 * 왜 분리인가: globe 는 어두운 몰입 stage 라 채도 높은(vivid) 색이 검은 배경 위에서 판독되고,
 * 사이트 본문은 종이-잉크 표면이라 desaturated EPA 토큰이 텍스트 대비를 지킨다. 같은 데이터라도
 * 표면 매질이 달라 색을 통일하면 한쪽이 반드시 열화된다(globe=탁해짐 / 본문=과채도 눈부심).
 * hex 는 스케일 배열(earth/config)이 소유하고, 온톨로지는 *어떤 스케일인지*만 가리킨다.
 */
import type { OverlayType } from '../../types/globe';
import type { ColorSegments, OverlayCategoryDef, WindLevel } from '../../types/globe';
import type { ColorBarConfig } from '../earth/config';
import { POLICY_CHOROPLETH_SCALE, POLICY_CHOROPLETH_NEUTRAL, segmentsToGradient } from '../earth/config';
import {
  PHENOMENA, RENDERABLE_OVERLAYS, WIND_LEVELS, isOverlayId, windLevelLabel,
  type PhenomenonDef, type PhenomenonId,
} from './globeOntology';

export { POLICY_CHOROPLETH_SCALE, POLICY_CHOROPLETH_NEUTRAL };

const PHENOMENON_ENTRIES = Object.entries(PHENOMENA) as [PhenomenonId, PhenomenonDef][];

/** 오버레이 → 렌더 색상 스케일. 스칼라필드 텍스처와 범례가 동일 배열을 참조한다. */
export const OVERLAY_SCALE_MAP: Partial<Record<OverlayType, ColorSegments>> = Object.fromEntries(
  RENDERABLE_OVERLAYS.map((o) => [o, PHENOMENA[o as PhenomenonId].legend!.colorScale]),
);

/** 격자 텍스처로 렌더 가능한 오버레이 집합 (색 스케일 + 격자 피드 보유 = 렌더 가능). */
export const GRID_RENDERABLE_OVERLAYS: OverlayType[] = [...RENDERABLE_OVERLAYS];

/**
 * 범례 컬러바 — 램프는 렌더와 같은 스케일 배열에서 생성되고 단위는 HUD 라벨과 같은 출처다.
 * 바람은 격자 렌더가 아니라 파티클이지만 자체 속도 램프 범례를 갖는다.
 */
export const COLOR_BAR_CONFIGS: Partial<Record<OverlayType, ColorBarConfig>> = Object.fromEntries(
  PHENOMENON_ENTRIES
    .filter(([id, d]) => isOverlayId(id) && !!d.legend && !!d.hud)
    .map(([id, d]) => [
      id,
      { gradient: segmentsToGradient(d.legend!.colorScale), ticks: d.legend!.ticks, unit: d.hud!.unit },
    ]),
);

/** HUD 표시 이름·단위·도트색. hud 정의가 없는 현상은 사용자에게 붙일 이름 자체가 없다. */
export const OVERLAY_DISPLAY_LABELS: Partial<
  Record<OverlayType, { label: string; unit: string; color: string }>
> = Object.fromEntries(
  PHENOMENON_ENTRIES
    .filter(([id, d]) => isOverlayId(id) && !!d.hud)
    .map(([id, d]) => [id, { ...d.hud! }]),
);

/**
 * 오버레이 픽커 카테고리 — *그룹핑*만 여기서 정하고, 각 항목이 실제로 그려지는지는 온톨로지가
 * 판정한다(RENDERABLE_OVERLAYS 밖 항목은 테스트가 막는다). 골랐는데 아무것도 안 그려지는
 * 정직성 위반을 구조로 차단.
 *
 * 꽃가루 커버리지 = 유럽 한정(CAMS) → 도메인 밖에선 격자가 비어 아무것도 안 그려지는 것이
 * 정직한 동작 (근거는 온톨로지 pollen pipeline.coverage, ActiveLayerCard 출처/값범위로 확인).
 */
export const OVERLAY_PICKER_CATEGORIES: readonly OverlayCategoryDef[] = [
  { key: 'aq', ko: '대기질', en: 'AIR QUALITY', overlays: ['pm25', 'pm10', 'o3', 'no2', 'co'] },
  { key: 'weather', ko: '기상', en: 'WEATHER', overlays: ['temp', 'rh'] },
  { key: 'ocean', ko: '해양', en: 'OCEAN', overlays: ['sst', 'ssta', 'waves', 'currents'] },
  { key: 'pollen', ko: '꽃가루', en: 'POLLEN', overlays: ['pollen_grass', 'pollen_birch', 'pollen_alder', 'pollen_mugwort', 'pollen_olive', 'pollen_ragweed'] },
];

/**
 * windy-timeline 슬라이더 — P8b 실배선 완료. offset=0 은 라이브 current-* 경로 그대로,
 * offset≠0 은 Storage `aq-data/timeline/` 의 NOAA GEFS-Aerosols PM2.5 프레임(±24h @ 3h)을
 * 소비한다(api/timeline.ts + ScalarFieldOverlay). manifest 없음/stale 시 슬라이더 disabled +
 * 정직 안내 — 가짜 데이터 미주입. GEFS 단일 결정론 멤버 → p10-p90 미조작(legend caveat).
 */
export const TIMELINE_ENABLED: boolean = true;

/**
 * 바람 고도 셀렉터 옵션 — 수집기가 실제로 가져오는 레벨만 (온톨로지 wind.verticalLevels).
 * 데이터 없는 고도를 셀렉터에 띄우는 것 자체가 거짓말이므로 목록을 손으로 적지 않는다.
 */
export const WIND_LEVEL_OPTIONS: readonly { key: WindLevel; label: string }[] = WIND_LEVELS.map(
  (key) => ({ key, label: windLevelLabel(key) }),
);

/** 규제 choropleth 범례 바 — 온톨로지 policy-standard 의 스케일에서 생성. */
export const POLICY_CHOROPLETH_GRADIENT: string = segmentsToGradient(
  PHENOMENA['policy-standard'].legend!.colorScale,
);

/** 규제 choropleth 눈금 — 스케일 stop 과 1:1 (`1×`, `2×`, …). */
export const POLICY_CHOROPLETH_TICKS: readonly string[] = PHENOMENA['policy-standard'].legend!.ticks;
