/**
 * useClusterManager.ts — Cluster state, computation, and hit-testing logic
 * extracted from DottedMap.tsx.
 *
 * Manages: geo-clustering, zoom-adaptive cell sizing, hit targets,
 * animated cluster refs, and DOM element refs for marker overlays.
 */

import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { clusterByGeo } from "./clustering";
import type {
  MarkerData,
  MarkerCluster,
  HitTarget,
  AnimCluster,
  ClusterDatum,
  ClusterManagerResult,
} from "./types";

const DEG = Math.PI / 180;

interface UseClusterManagerParams {
  markers: MarkerData[];
  activeMarkerIds?: Set<string> | string[];
  clusterCellDegrees?: number;
}

export function useClusterManager({
  markers,
  activeMarkerIds,
  clusterCellDegrees,
}: UseClusterManagerParams): ClusterManagerResult {
  // Resolve active IDs into a Set
  const activeSet = useMemo(() => {
    if (!activeMarkerIds) return new Set<string>();
    if (activeMarkerIds instanceof Set) return activeMarkerIds;
    return new Set(activeMarkerIds);
  }, [activeMarkerIds]);

  // Zoom-adaptive clustering
  const baseCellDeg = clusterCellDegrees ?? 15;
  const [clusterCellDeg, setClusterCellDegRaw] = useState(baseCellDeg);

  const setClusterCellDeg = useCallback((deg: number) => {
    setClusterCellDegRaw(deg);
  }, []);

  const geoClusters = useMemo(
    () => clusterByGeo(markers, clusterCellDeg, activeSet),
    [markers, clusterCellDeg, activeSet],
  );

  const clusterData: readonly ClusterDatum[] = useMemo(() => {
    return geoClusters.map((gc) => ({
      cluster: gc,
      λ: gc.avgLng * DEG,
      cosφ: Math.cos(gc.avgLat * DEG),
      sinφ: Math.sin(gc.avgLat * DEG),
      lng: gc.avgLng,
      lat: gc.avgLat,
    }));
  }, [geoClusters]);

  const clusterDataRef = useRef<readonly ClusterDatum[]>(clusterData);
  useEffect(() => {
    clusterDataRef.current = clusterData;
  });

  // Refs shared with the render loop
  const hitTargetsRef = useRef<HitTarget[]>([]);
  const clusterElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const animClustersRef = useRef<AnimCluster[]>([]);

  /**
   * Test whether a point (mx, my) hits any cluster target.
   * Returns the first matched HitTarget or null.
   */
  const hitTestAt = useCallback(
    (mx: number, my: number): HitTarget | null => {
      for (const hit of hitTargetsRef.current) {
        const dx = mx - hit.x;
        const dy = my - hit.y;
        if (dx * dx + dy * dy <= hit.radius * hit.radius) {
          return hit;
        }
      }
      return null;
    },
    [],
  );

  /** Handle click on the map — delegates to onMarkerClick if a cluster is hit. */
  const handleClusterClick = useCallback(
    (
      mx: number,
      my: number,
      hasDragged: boolean,
      onMarkerClick?: (cluster: MarkerCluster) => void,
    ) => {
      if (hasDragged || !onMarkerClick) return;
      const hit = hitTestAt(mx, my);
      if (hit) {
        onMarkerClick({
          markers: hit.markers,
          x: hit.x,
          y: hit.y,
          radius: hit.radius,
        });
      }
    },
    [hitTestAt],
  );

  return {
    clusterData,
    clusterDataRef,
    hitTargetsRef,
    clusterElsRef,
    animClustersRef,
    clusterCellDeg,
    setClusterCellDeg,
    activeSet,
    hitTestAt,
    handleClusterClick,
  };
}
