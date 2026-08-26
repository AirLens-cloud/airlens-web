import type { ReactNode } from "react";

export interface MarkerData {
  id: string;
  latitude: number;
  longitude: number;
  data?: Record<string, unknown>;
}

export type ViewMode = "globe" | "flat";

export interface DottedMapTheme {
  dotColor?: string;
  globeFill?: string;
  outlineColor?: string;
  clusterColor?: string;
  clusterTextColor?: string;
  clusterBorderColor?: string;
  activeGlow?: string;
  activeBadgeColor?: string;
}

export interface MarkerCluster {
  markers: MarkerData[];
  x: number;
  y: number;
  radius: number;
}

export interface StationData {
  latitude: number;
  longitude: number;
  pm25: number;
}

export interface DottedMapProps {
  markers: MarkerData[];
  defaultViewMode?: ViewMode;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  activeMarkerIds?: Set<string> | string[];
  onMarkerClick?: (cluster: MarkerCluster) => void;
  /** PM2.5 station data for IDW dot coloring */
  stationData?: StationData[];
  theme?: DottedMapTheme;
  darkMode?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Accessible name for the map's `role="application"` container. The container
   * is keyboard-operable (arrows pan/rotate, +/- zoom, 0 resets), so it needs a
   * name of its own — the sibling `<canvas role="img">` label does not carry
   * over. Consumers should pass a translated string; the default is the
   * English fallback that matches the canvas label.
   */
  ariaLabel?: string;
  /**
   * Fires when the pointer enters or leaves a marker cluster's hit target, with
   * the cluster (including its screen position) or `null` on exit. Consumers use
   * it to render a hover readout; the map itself draws no tooltip so the copy
   * stays with the page that owns the data's meaning.
   */
  onHoverMarker?: (cluster: MarkerCluster | null) => void;
  renderMarker?: (
    marker: MarkerData,
    position: { x: number; y: number },
    isActive: boolean
  ) => ReactNode;
  initialRotation?: [number, number];
  initialZoom?: number;
  autoRotate?: boolean;
  zoomRange?: [number, number];
  clusterCellDegrees?: number;
  /** Selected country name for 3D extrude effect */
  selectedCountryName?: string | null;
}

// Internal types
export interface HitTarget {
  x: number;
  y: number;
  radius: number;
  markers: MarkerData[];
}

export interface GeoCluster {
  avgLng: number;
  avgLat: number;
  count: number;
  markers: MarkerData[];
  hasActive: boolean;
  activeCount: number;
}

export interface AnimCluster {
  x: number;
  y: number;
  tx: number;
  ty: number;
  size: number;
  tSize: number;
  count: number;
  tCount: number;
  alpha: number;
  tAlpha: number;
  markers: MarkerData[];
  hasActive: boolean;
  activeCount: number;
  sourceIndices: number[];
  isSolo: boolean;
}

/** Pre-computed cluster datum with trig values for projection. */
export interface ClusterDatum {
  cluster: GeoCluster;
  λ: number;
  cosφ: number;
  sinφ: number;
  lng: number;
  lat: number;
}

/** Return type of useClusterManager hook. */
export interface ClusterManagerResult {
  /** Pre-computed cluster data for rendering. */
  clusterData: readonly ClusterDatum[];
  /** Ref to current cluster data (updated synchronously). */
  clusterDataRef: React.MutableRefObject<readonly ClusterDatum[]>;
  /** Ref to hit targets for click/hover detection. */
  hitTargetsRef: React.MutableRefObject<HitTarget[]>;
  /** Ref to cluster DOM element map. */
  clusterElsRef: React.MutableRefObject<Map<number, HTMLDivElement>>;
  /** Ref to animated clusters for render loop. */
  animClustersRef: React.MutableRefObject<AnimCluster[]>;
  /** Current cluster cell degrees (zoom-adaptive). */
  clusterCellDeg: number;
  /** Setter for cluster cell degrees. */
  setClusterCellDeg: (deg: number) => void;
  /** Resolved active marker ID set. */
  activeSet: Set<string>;
  /** Hit-test a point against current cluster targets. */
  hitTestAt: (mx: number, my: number) => HitTarget | null;
  /** Handle cluster click — calls onMarkerClick if a target is hit. */
  handleClusterClick: (
    mx: number,
    my: number,
    hasDragged: boolean,
    onMarkerClick?: (cluster: MarkerCluster) => void,
  ) => void;
}
