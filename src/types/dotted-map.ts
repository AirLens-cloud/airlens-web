export interface DottedMapRef {
  zoomIn: () => void;
  zoomOut: () => void;
  getZoom: () => number;
}

export interface StationData {
  latitude: number;
  longitude: number;
  pm25: number;
}

export interface PrecomputedDot {
  cosφ: number;
  sinφ: number;
  λ: number;
  lng: number;
  lat: number;
}

export interface ProjectionParams {
  tVal: number;
  λ0: number;
  cosφ0: number;
  sinφ0: number;
  flatCx: number;
  flatCy: number;
  flatFactor: number;
  globeCx: number;
  globeCy: number;
  radius: number;
  width: number;
  height: number;
}

export interface GlobeColors {
  globeFill: string;
  outlineColor: string;
}
