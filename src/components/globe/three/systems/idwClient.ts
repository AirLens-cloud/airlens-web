/**
 * idwClient — IDW worker lifecycle + stale-response guard (Globe P4a).
 * Falls back to the synchronous pure core when Worker is unavailable or dies.
 */
import { buildIdwField } from './idwCore';
import type { ColorSegments, IdwStationPt, IdwParams, IdwResponse } from '../../../../types/globe';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (pixels: Uint8ClampedArray<ArrayBuffer> | null) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null; // 테스트/구형 환경 → 동기 fallback
  try {
    worker = new Worker(new URL('./idw.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<IdwResponse>) => {
      const resolve = pending.get(e.data.token);
      if (resolve) { pending.delete(e.data.token); resolve(e.data.pixels); }
    };
    worker.onerror = () => {
      // worker 사망 — 전체 pending 을 null 로 해소(호출측 동기 fallback) 후 재생성 대상
      for (const resolve of pending.values()) resolve(null);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Worker 경유 IDW (불가/실패 시 동일 순수 함수 동기 fallback — 결과 동일). */
export async function computeIdwField(
  stations: IdwStationPt[],
  scale: ColorSegments,
  w: number,
  h: number,
  params: IdwParams,
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const wk = getWorker();
  if (!wk) return buildIdwField(stations, scale, w, h, params);
  const token = ++seq;
  const viaWorker = await new Promise<Uint8ClampedArray<ArrayBuffer> | null>((resolve) => {
    pending.set(token, resolve);
    wk.postMessage({ token, stations, scale, w, h, params });
  });
  return viaWorker ?? buildIdwField(stations, scale, w, h, params);
}

/** 컴포넌트 unmount 시 호출 — worker 종료 + pending 정리 */
export function disposeIdwWorker(): void {
  for (const resolve of pending.values()) resolve(null);
  pending.clear();
  worker?.terminate();
  worker = null;
}
