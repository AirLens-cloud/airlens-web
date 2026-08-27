import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { LAND_POINTS } from "./land-points";
import { logger } from "../../lib/logger";
import { resolveTheme } from "./theme";
import {
  precomputeDotColorGroups,
  EXTRUDE_CONFIG,
} from "./idw";
import {
  renderGlobeBackground,
  animateExtrudeHeights,
  renderLandDotsIDW,
  renderLandDotsDefault,
  type ProjectionParams,
} from "./renderHelpers";
import {
  renderClusterFrame,
} from "./clusterRenderer";
import { useClusterManager } from "./useClusterManager";
import type {
  DottedMapProps,
  HitTarget,
  ViewMode,
} from "./types";

const DEG = Math.PI / 180;

export type { DottedMapRef } from '../../types/dotted-map'
import type { DottedMapRef } from '../../types/dotted-map'

export const DottedMap = forwardRef<DottedMapRef, DottedMapProps>(function DottedMap({
  markers,
  defaultViewMode = "flat",
  viewMode: controlledViewMode,
  onViewModeChange,
  activeMarkerIds,
  onMarkerClick,
  stationData,
  selectedCountryName,
  theme,
  darkMode,
  className,
  style,
  ariaLabel = "Air quality world map",
  onHoverMarker,
  renderMarker,
  initialRotation = [0, -20],
  initialZoom = 1,
  autoRotate: autoRotateProp = true,
  zoomRange = [0.5, 6],
  clusterCellDegrees,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  const rotationRef = useRef<[number, number, number]>([
    initialRotation[0],
    initialRotation[1],
    0,
  ]);
  const panOffsetRef = useRef<[number, number]>([0, 0]);
  const zoomRef = useRef(initialZoom);
  const targetZoomRef = useRef(initialZoom);

  const isDraggingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const lastMouseRef = useRef<[number, number]>([0, 0]);
  const velocityRef = useRef<[number, number]>([0, 0]);
  const autoRotateRef = useRef(autoRotateProp);

  const isControlled = controlledViewMode !== undefined;
  const [internalViewMode, setInternalViewMode] =
    useState<ViewMode>(defaultViewMode);
  const viewMode = isControlled ? controlledViewMode : internalViewMode;

  const _setViewMode = useCallback(
    (mode: ViewMode) => {
      if (!isControlled) setInternalViewMode(mode);
      onViewModeChange?.(mode);
    },
    [isControlled, onViewModeChange]
  );
  void _setViewMode;

  const transitionRef = useRef(defaultViewMode === "globe" ? 1 : 0);
  const targetTransitionRef = useRef(defaultViewMode === "globe" ? 1 : 0);
  const viewModeRef = useRef<ViewMode>(defaultViewMode);

  // Cluster state managed by extracted hook
  const {
    clusterData,
    clusterDataRef,
    hitTargetsRef,
    clusterElsRef,
    animClustersRef,
    setClusterCellDeg,
    activeSet,
    hitTestAt,
    handleClusterClick,
  } = useClusterManager({ markers, activeMarkerIds, clusterCellDegrees });

  // Theme: auto-detect dark mode or use prop
  const colorsRef = useRef({
    isDark: false,
    colors: resolveTheme(false, theme),
  });

  useEffect(() => {
    const check = () => {
      const isDark =
        darkMode ?? document.documentElement.classList.contains("dark");
      if (isDark !== colorsRef.current.isDark) {
        colorsRef.current = { isDark, colors: resolveTheme(isDark, theme) };
      }
    };
    check();
    if (darkMode === undefined) {
      const obs = new MutationObserver(check);
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      return () => obs.disconnect();
    }
  }, [darkMode, theme]);

  useEffect(() => {
    viewModeRef.current = viewMode;
    targetTransitionRef.current = viewMode === "globe" ? 1 : 0;
    targetZoomRef.current = 1;
  }, [viewMode]);

  useEffect(() => {
    autoRotateRef.current = autoRotateProp;
  }, [autoRotateProp]);

  const precomputed = useMemo(
    () =>
      LAND_POINTS.map(([lng, lat]) => ({
        cosφ: Math.cos(lat * DEG),
        sinφ: Math.sin(lat * DEG),
        λ: lng * DEG,
        lng,
        lat,
      })),
    []
  );

  // IDW-based dot color groups + density-alpha buckets (precomputed once when
  // stationData changes — V-W4 delta 3 adds alphaGroups alongside colorGroups).
  const dotColorData = useMemo(
    () => stationData && stationData.length > 0 && selectedCountryName
      ? precomputeDotColorGroups(LAND_POINTS, stationData)
      : null,
    [stationData, selectedCountryName],
  );
  const dotColorDataRef = useRef(dotColorData);
  dotColorDataRef.current = dotColorData;

  // ── Dot-country map for extrude effect ──
  const [dotCountryMap, setDotCountryMap] = useState<(string | null)[] | null>(null);
  useEffect(() => {
    fetch('/data/dot-country-map.json')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (Array.isArray(data)) setDotCountryMap(data); })
      // Degrades gracefully (no extrude effect) but must not fail silently.
      .catch((err) => { logger.warn('dot-country-map fetch failed — country extrude disabled:', err); });
  }, []);

  // Pre-compute extrude heights per dot based on IDW PM2.5 + country match
  const extrudeHeightsRef = useRef<Float32Array | null>(null);
  const extrudeTargetsRef = useRef<Float32Array | null>(null);

  // Compute extrude targets (pure derivation, no ref mutation)
  const extrudeTargets = useMemo(() => {
    if (!dotCountryMap || !selectedCountryName || !stationData || stationData.length === 0) {
      return null;
    }

    const targets = new Float32Array(precomputed.length);
    const { MAX_HEIGHT, PM25_MAX, SPILLOVER_BUFFER_DEG } = EXTRUDE_CONFIG;

    // Find country center for spillover
    let centerLat = 0, centerLon = 0, countryCount = 0;
    for (let i = 0; i < precomputed.length; i++) {
      if (dotCountryMap[i] === selectedCountryName) {
        centerLat += precomputed[i].lat;
        centerLon += precomputed[i].lng;
        countryCount++;
      }
    }
    if (countryCount > 0) {
      centerLat /= countryCount;
      centerLon /= countryCount;
    }

    // Compute IDW PM2.5 for each dot + assign extrude height
    for (let i = 0; i < precomputed.length; i++) {
      const isCountry = dotCountryMap[i] === selectedCountryName;
      const p = precomputed[i];

      // Compute distance to country center for spillover
      const dLat = (p.lat - centerLat);
      const dLon = (p.lng - centerLon);
      const dist = Math.sqrt(dLat * dLat + dLon * dLon);

      let factor = 0;
      if (isCountry) {
        factor = 1;
      } else if (dist < SPILLOVER_BUFFER_DEG) {
        factor = Math.max(0, 1 - dist / SPILLOVER_BUFFER_DEG) * 0.5;
      }

      if (factor > 0) {
        // Simple nearest-station PM2.5 estimation for height
        let minDist = Infinity;
        let pm25 = 50; // fallback
        for (const s of stationData) {
          const sd = Math.sqrt(
            (p.lat - s.latitude) ** 2 + (p.lng - s.longitude) ** 2,
          );
          if (sd < minDist) { minDist = sd; pm25 = s.pm25; }
        }
        targets[i] = (Math.min(pm25, PM25_MAX) / PM25_MAX) * MAX_HEIGHT * factor;
      }
    }

    return targets;
  }, [dotCountryMap, selectedCountryName, stationData, precomputed]);

  // Sync computed targets into refs (side effect belongs in useEffect, not useMemo)
  useEffect(() => {
    extrudeTargetsRef.current = extrudeTargets;
    if (extrudeTargets && !extrudeHeightsRef.current) {
      extrudeHeightsRef.current = new Float32Array(precomputed.length);
    }
  }, [extrudeTargets, precomputed.length]);

  const selectedCountryRef = useRef(selectedCountryName);
  selectedCountryRef.current = selectedCountryName;

  // ---- Render loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || precomputed.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let lastCellDeg = clusterCellDegrees ?? 15;

    const render = () => {
      if (!ctx || width === 0) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      const colors = colorsRef.current.colors;
      const t = transitionRef.current;
      const target = targetTransitionRef.current;

      if (Math.abs(t - target) > 0.001) {
        transitionRef.current += (target - t) * 0.06;
      } else {
        transitionRef.current = target;
      }
      const tVal = transitionRef.current;

      const zoomDiff = targetZoomRef.current - zoomRef.current;
      if (Math.abs(zoomDiff) > 0.001) {
        zoomRef.current += zoomDiff * 0.2;
      } else {
        zoomRef.current = targetZoomRef.current;
      }
      const zoom = zoomRef.current;

      const newCellDeg = clusterCellDegrees ?? Math.max(2, Math.round(15 / zoom));
      if (newCellDeg !== lastCellDeg) {
        lastCellDeg = newCellDeg;
        setClusterCellDeg(newCellDeg);
      }

      if (
        autoRotateRef.current &&
        tVal > 0.5 &&
        !isDraggingRef.current
      ) {
        rotationRef.current[0] += 0.15;
      }

      if (!isDraggingRef.current) {
        const [vx, vy] = velocityRef.current;
        if (Math.abs(vx) > 0.01 || Math.abs(vy) > 0.01) {
          if (tVal > 0.5) {
            rotationRef.current[0] += vx;
            rotationRef.current[1] += vy;
          } else {
            panOffsetRef.current[0] += vx * 2;
            panOffsetRef.current[1] += vy * 2;
          }
          velocityRef.current = [vx * 0.93, vy * 0.93];
        }
      }

      rotationRef.current[1] = Math.max(
        -60,
        Math.min(60, rotationRef.current[1])
      );

      // Clamp flat-mode pan
      if (tVal < 0.5) {
        const flatScaleForClamp = (height / 2.2) * zoom;
        const flatFactorClamp = flatScaleForClamp * DEG;
        const mapHalfW = flatFactorClamp * 180;
        const mapHalfH = flatFactorClamp * 80;
        const maxPanX = Math.max(0, mapHalfW - width / 2);
        const maxPanY = Math.max(0, mapHalfH - height / 2);
        panOffsetRef.current[0] = Math.max(
          -maxPanX,
          Math.min(maxPanX, panOffsetRef.current[0])
        );
        panOffsetRef.current[1] = Math.max(
          -maxPanY,
          Math.min(maxPanY, panOffsetRef.current[1])
        );
      }

      const panX = panOffsetRef.current[0] * (1 - tVal);
      const panY = panOffsetRef.current[1] * (1 - tVal);
      const flatCx = width / 2 + panX;
      const flatCy = height / 2 + panY;
      const globeCx = width / 2;
      const globeCy = height / 2;
      const baseRadius = Math.min(width, height) * 0.44;
      const radius = baseRadius * zoom;
      const flatScale = (height / 2.2) * zoom;

      const λ0 = -rotationRef.current[0] * DEG;
      const φ0 = -rotationRef.current[1] * DEG;
      const cosφ0 = Math.cos(φ0);
      const sinφ0 = Math.sin(φ0);
      const flatFactor = flatScale * DEG;

      ctx.clearRect(0, 0, width, height);

      // Animate extrude heights toward targets
      extrudeHeightsRef.current = animateExtrudeHeights(
        extrudeHeightsRef.current,
        extrudeTargetsRef.current,
      );

      // Globe background + Land dots — delegated to renderHelpers
      const dotRadius = Math.max(1.4, (width / 380) * Math.min(zoom, 2));
      const heights = extrudeHeightsRef.current;
      const colorData = dotColorDataRef.current;

      const proj: ProjectionParams = {
        tVal, λ0, cosφ0, sinφ0,
        flatCx, flatCy, flatFactor,
        globeCx, globeCy, radius,
        width, height,
      };

      renderGlobeBackground(ctx, proj, colors);

      if (colorData) {
        renderLandDotsIDW(ctx, precomputed, proj, dotRadius, colorData.colorGroups, colorData.alphaGroups, heights, colorsRef.current.isDark);
      } else {
        renderLandDotsDefault(ctx, precomputed, proj, dotRadius, colors.dotColor, heights);
      }

      // Cluster pipeline: project → merge → animate → render → DOM position
      const clusterResult = renderClusterFrame({
        ctx,
        clusterData: clusterDataRef.current,
        proj,
        els: clusterElsRef.current,
        prevAnimClusters: animClustersRef.current,
        isDragging: isDraggingRef.current,
        hasRenderMarker: !!renderMarker,
        colors,
      });
      animClustersRef.current = clusterResult.animClusters;
      hitTargetsRef.current = clusterResult.hitTargets;
      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precomputed]);

  // ---- Interaction handlers ----

  // Identity of the cluster currently under the pointer, so onHoverMarker fires
  // on enter/leave only — the raw mousemove would re-fire every frame and make
  // the consumer's tooltip re-render on each pixel of travel.
  const hoveredKeyRef = useRef<string | null>(null);

  const emitHover = useCallback(
    (hit: HitTarget | null) => {
      const key = hit ? hit.markers.map((m) => m.id).join("|") : null;
      if (key === hoveredKeyRef.current) return;
      hoveredKeyRef.current = key;
      onHoverMarker?.(
        hit ? { markers: hit.markers, x: hit.x, y: hit.y, radius: hit.radius } : null,
      );
    },
    [onHoverMarker],
  );

  const handleMouseMoveForCursor = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container || isDraggingRef.current) return;
      const rect = container.getBoundingClientRect();
      const hit = hitTestAt(e.clientX - rect.left, e.clientY - rect.top);
      container.style.cursor = hit ? "pointer" : "grab";
      emitHover(hit);
    },
    [hitTestAt, emitHover],
  );

  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      handleClusterClick(
        e.clientX - rect.left,
        e.clientY - rect.top,
        hasDraggedRef.current,
        onMarkerClick,
      );
    },
    [onMarkerClick, handleClusterClick],
  );

  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.003;
      const [minZoom, maxZoom] = zoomRange;
      const effectiveMax =
        viewModeRef.current === "globe" ? Math.min(maxZoom, 3) : maxZoom;
      targetZoomRef.current = Math.max(
        minZoom,
        Math.min(effectiveMax, targetZoomRef.current * (1 + delta))
      );
    },
    [zoomRange]
  );

  const handlePointerDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      isDraggingRef.current = true;
      hasDraggedRef.current = false;
      lastMouseRef.current = [e.clientX, e.clientY];
      velocityRef.current = [0, 0];
      if (viewModeRef.current === "globe") autoRotateRef.current = false;
      const container = containerRef.current;
      if (container) container.style.cursor = "grabbing";
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      handleMouseMoveForCursor(e);

      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastMouseRef.current[0];
      const dy = e.clientY - lastMouseRef.current[1];

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true;

      lastMouseRef.current = [e.clientX, e.clientY];

      if (
        viewModeRef.current === "globe" ||
        transitionRef.current > 0.5
      ) {
        rotationRef.current[0] += dx * 0.3;
        rotationRef.current[1] -= dy * 0.3;
        velocityRef.current = [dx * 0.3, -dy * 0.3];
      } else {
        panOffsetRef.current[0] += dx;
        panOffsetRef.current[1] += dy;
        velocityRef.current = [dx * 0.5, dy * 0.5];
      }
    },
    [handleMouseMoveForCursor]
  );

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
    const container = containerRef.current;
    if (container) container.style.cursor = "grab";
  }, []);

  // onMouseLeave also ends a hover — without this the tooltip would stay pinned
  // to the last marker after the pointer left the map entirely.
  const handlePointerLeave = useCallback(() => {
    handlePointerUp();
    emitHover(null);
  }, [handlePointerUp, emitHover]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0];
      isDraggingRef.current = true;
      hasDraggedRef.current = false;
      lastMouseRef.current = [touch.clientX, touch.clientY];
      velocityRef.current = [0, 0];
      if (viewModeRef.current === "globe") autoRotateRef.current = false;
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - lastMouseRef.current[0];
      const dy = touch.clientY - lastMouseRef.current[1];

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true;

      lastMouseRef.current = [touch.clientX, touch.clientY];

      if (
        viewModeRef.current === "globe" ||
        transitionRef.current > 0.5
      ) {
        rotationRef.current[0] += dx * 0.3;
        rotationRef.current[1] -= dy * 0.3;
        velocityRef.current = [dx * 0.3, -dy * 0.3];
      } else {
        panOffsetRef.current[0] += dx;
        panOffsetRef.current[1] += dy;
        velocityRef.current = [dx * 0.5, dy * 0.5];
      }
    },
    []
  );

  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Prevent default wheel to avoid page scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const prevent = (e: WheelEvent) => e.preventDefault();
    container.addEventListener("wheel", prevent, { passive: false });
    return () => container.removeEventListener("wheel", prevent);
  }, []);

  // Expose zoom methods via ref
  const zoomIn = useCallback(() => {
    const [, maxZoom] = zoomRange;
    const effectiveMax =
      viewModeRef.current === "globe" ? Math.min(maxZoom, 3) : maxZoom;
    targetZoomRef.current = Math.min(
      effectiveMax,
      targetZoomRef.current * 1.4
    );
  }, [zoomRange]);

  const zoomOut = useCallback(() => {
    const [minZoom] = zoomRange;
    targetZoomRef.current = Math.max(
      minZoom,
      targetZoomRef.current / 1.4
    );
  }, [zoomRange]);

  /**
   * Keyboard parity for the mouse/touch gestures above — the map was reachable
   * by tab but inert once focused (no tabIndex, no key handler), so pan / rotate
   * / zoom were pointer-only. Steps mirror the drag math: one arrow press equals
   * a KEY_DRAG_PX drag, so keyboard and mouse move the view at a comparable rate
   * instead of the keyboard feeling like a different control.
   *
   * Arrow = rotate (globe) or pan (flat, direction matches dragging the map
   * itself, not the viewport). +/- = zoom, reusing the same clamps as the wheel
   * and the imperative zoomIn/zoomOut. 0 = reset to the initial view.
   */
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const KEY_DRAG_PX = 30;
      let dx = 0;
      let dy = 0;

      switch (e.key) {
        case "ArrowLeft":
          dx = -KEY_DRAG_PX;
          break;
        case "ArrowRight":
          dx = KEY_DRAG_PX;
          break;
        case "ArrowUp":
          dy = -KEY_DRAG_PX;
          break;
        case "ArrowDown":
          dy = KEY_DRAG_PX;
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          return;
        case "-":
        case "_":
          e.preventDefault();
          zoomOut();
          return;
        case "0":
          e.preventDefault();
          rotationRef.current = [initialRotation[0], initialRotation[1], 0];
          panOffsetRef.current = [0, 0];
          velocityRef.current = [0, 0];
          targetZoomRef.current = initialZoom;
          return;
        default:
          return;
      }

      e.preventDefault();
      // Same rule as handlePointerDown — a deliberate view change stops the
      // idle spin, otherwise the globe drifts out from under the key press.
      if (viewModeRef.current === "globe") autoRotateRef.current = false;

      if (viewModeRef.current === "globe" || transitionRef.current > 0.5) {
        rotationRef.current[0] += dx * 0.3;
        rotationRef.current[1] -= dy * 0.3;
      } else {
        panOffsetRef.current[0] += dx;
        panOffsetRef.current[1] += dy;
      }
      // No velocity seeding — key presses are discrete, so inertia would keep
      // the map coasting after the user stopped, which reads as a lost view.
      velocityRef.current = [0, 0];
    },
    [zoomIn, zoomOut, initialRotation, initialZoom],
  );

  const getZoom = useCallback(() => zoomRef.current, []);

  useImperativeHandle(ref, () => ({ zoomIn, zoomOut, getZoom }), [zoomIn, zoomOut, getZoom]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        cursor: "grab",
        userSelect: "none",
        ...style,
      }}
      tabIndex={0}
      role="application"
      aria-label={ariaLabel}
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Plus Minus 0"
      onKeyDown={handleKeyDown}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerLeave}
      onClick={handleClick}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Air quality world map"
        style={{ width: "100%", height: "100%" }}
      />
      {renderMarker && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          {clusterData.map((cd, ci) => {
            const gc = cd.cluster;
            if (gc.count > 1) {
              return (
                <div
                  key={`c-${ci}`}
                  ref={(el) => {
                    if (el) clusterElsRef.current.set(ci, el);
                    else clusterElsRef.current.delete(ci);
                  }}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    willChange: "transform",
                    display: "none",
                  }}
                />
              );
            }

            const marker = gc.markers[0];
            const isActive = activeSet.has(marker.id);

            return (
              <div
                key={`m-${marker.id}`}
                ref={(el) => {
                  if (el) clusterElsRef.current.set(ci, el);
                  else clusterElsRef.current.delete(ci);
                }}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  willChange: "transform",
                  display: "none",
                }}
              >
                {renderMarker(marker, { x: 0, y: 0 }, isActive)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
