/**
 * AirLens theme for dotted-map.
 * Original: @wescld/dotted-map (MIT license)
 * Customized with AirLens brand colors (#25e2f4 teal accent).
 */
import type { DottedMapTheme } from "./types";
import { vizAccentRgba } from "../../lib/config/viz";

interface ResolvedTheme {
  dotColor: string;
  globeFill: string;
  outlineColor: string;
  clusterBg: string;
  clusterText: string;
  clusterBorder: string;
  activeGlow: string;
  activeBadge: string;
}

const LIGHT_DEFAULTS: ResolvedTheme = {
  dotColor: vizAccentRgba(0.22),
  globeFill: "rgba(245, 250, 252, 0.95)",
  outlineColor: vizAccentRgba(0.15),
  clusterBg: vizAccentRgba(0.88),
  clusterText: "#ffffff",
  clusterBorder: "rgba(255, 255, 255, 1)",
  activeGlow: vizAccentRgba(0.25),
  activeBadge: "#10b981",
};

const DARK_DEFAULTS: ResolvedTheme = {
  dotColor: vizAccentRgba(0.25),
  globeFill: "#1a2332",
  outlineColor: vizAccentRgba(0.15),
  clusterBg: vizAccentRgba(0.85),
  clusterText: "#ffffff",
  clusterBorder: "rgba(10, 15, 26, 1)",
  activeGlow: vizAccentRgba(0.25),
  activeBadge: "#10b981",
};

export function resolveTheme(
  isDark: boolean,
  overrides?: DottedMapTheme
): ResolvedTheme {
  const base = isDark ? DARK_DEFAULTS : LIGHT_DEFAULTS;
  if (!overrides) return base;

  return {
    dotColor: overrides.dotColor ?? base.dotColor,
    globeFill: overrides.globeFill ?? base.globeFill,
    outlineColor: overrides.outlineColor ?? base.outlineColor,
    clusterBg: overrides.clusterColor ?? base.clusterBg,
    clusterText: overrides.clusterTextColor ?? base.clusterText,
    clusterBorder: overrides.clusterBorderColor ?? base.clusterBorder,
    activeGlow: overrides.activeGlow ?? base.activeGlow,
    activeBadge: overrides.activeBadgeColor ?? base.activeBadge,
  };
}
