/**
 * mcp.ts — Model Context Protocol server over streamable HTTP, sharing the same
 * datasets (and rate limiting / caching, via index.ts) as the REST API.
 *
 * Stateless JSON-RPC 2.0: the client POSTs a message and gets a JSON response.
 * Implements initialize / tools/list / tools/call. Notifications (no id) get a
 * 202 with an empty body. GET (SSE stream) is unused — this server never pushes.
 *
 * The pollutant-grid tool intentionally does NOT return all 65k cells; it
 * returns the single nearest cell for a lat/lon so an LLM gets a usable number,
 * with the same "model forecast, not AirLens ML" provenance the REST API carries.
 */

import type { Env, GridVariable } from './types';
import { fetchSnapshot, UpstreamError } from './upstream';
import {
  handleCityPrediction,
  handleOntologySummary,
  handlePredictions,
  handleStations,
  iso,
} from './handlers';
import { COVERAGE_SUMMARY, GRID_VARIABLES, isGridVariable } from './catalog';

const PROTOCOL_VERSION = '2025-06-18';

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

/** Exported so the attribution contract can read the tool prose (see
 *  catalog-attribution.contract.test.ts) — it was unreadable, and drifted. */
export const TOOLS = [
  {
    name: 'get_city_predictions',
    description:
      'AirLens ML PM2.5 predictions for all covered cities (p10/p50/p90 + confidence_grade). ' +
      `Includes a coverage disclosure: ${COVERAGE_SUMMARY}`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_city_prediction',
    description: 'AirLens ML PM2.5 prediction for one city by name (case-insensitive).',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'City name' } },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_pollutant_at',
    description:
      'Nearest 1° grid cell value for a pollutant at a lat/lon. Source: NOAA GEFS-Aerosols numerical forecast (a model product, NOT AirLens ML — no uncertainty or DQSS).',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number', minimum: -90, maximum: 90 },
        lon: { type: 'number', minimum: -180, maximum: 180 },
        variable: { type: 'string', enum: GRID_VARIABLES.map((g) => g.variable), default: 'pm25' },
      },
      required: ['lat', 'lon'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_stations',
    description:
      'Ground-station data-quality (DQSS) snapshot: final_score+measured_weight, a components ' +
      'breakdown, and dqss_grade (null unless measured_weight >= 60/100) per station.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_catalog',
    description:
      'Data catalog: datasets, provenance kinds, and DQSS grade cutoffs. Read this first to understand how each number is known.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

interface GridSnapshot {
  points: { lat: number; lon: number; value: number }[];
  source: string;
  timestamp: number;
}

async function pollutantAt(
  env: Env,
  lat: number,
  lon: number,
  variable: GridVariable,
): Promise<Record<string, unknown>> {
  const meta = GRID_VARIABLES.find((g) => g.variable === variable)!;
  const snap = await fetchSnapshot<GridSnapshot>(env, `/aq-data/current-${meta.file}-grid.json`, 600);
  const pts = Array.isArray(snap.points) ? snap.points : [];
  if (pts.length === 0) throw new UpstreamError('grid snapshot empty', 502);

  let best = pts[0];
  let bestD = Infinity;
  for (const p of pts) {
    const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return {
    variable: meta.variable,
    unit: meta.unit,
    provenance: 'model-forecast',
    source: snap.source,
    disclaimer: 'Numerical model forecast (not AirLens ML). No uncertainty or DQSS.',
    as_of: iso(snap.timestamp),
    query: { lat, lon },
    nearest_cell: { lat: best.lat, lon: best.lon, value: best.value },
  };
}

async function callTool(
  env: Env,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'get_city_predictions':
      return (await handlePredictions(env)).data;
    case 'get_city_prediction': {
      const city = typeof args.name === 'string' ? args.name : '';
      if (!city.trim()) throw new UpstreamError("missing 'name'", 400);
      return (await handleCityPrediction(env, city)).data;
    }
    case 'get_pollutant_at': {
      const lat = Number(args.lat);
      const lon = Number(args.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new UpstreamError("'lat' and 'lon' must be numbers", 400);
      }
      const variable = typeof args.variable === 'string' ? args.variable : 'pm25';
      if (!isGridVariable(variable)) throw new UpstreamError(`unknown variable '${variable}'`, 400);
      return pollutantAt(env, lat, lon, variable);
    }
    case 'get_stations':
      return (await handleStations(env)).data;
    case 'get_catalog':
      return handleOntologySummary().data;
    default:
      throw new UpstreamError(`unknown tool '${name}'`, 404);
  }
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}
function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/** Handle one JSON-RPC message. Returns null for notifications (no reply).
 *  `raw` is untrusted (a batch element or a parsed body), so it is narrowed
 *  before use — a null/array/non-object message is an Invalid Request, never
 *  a thrown TypeError that would 500 the whole batch. */
export async function handleMcpMessage(
  env: Env,
  raw: unknown,
): Promise<Record<string, unknown> | null> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return rpcError(null, -32600, 'invalid request');
  }
  const msg = raw as JsonRpcRequest;
  const { id, method } = msg;

  // Notifications carry no id and expect no response.
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'airlens-public-api', version: '1.0.0' },
      });
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    case 'ping':
      return rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS });
    case 'tools/call': {
      const params = msg.params ?? {};
      const name = typeof params.name === 'string' ? params.name : '';
      const args = (params.arguments as Record<string, unknown>) ?? {};
      try {
        const data = await callTool(env, name, args);
        return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(data) }] });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'tool call failed';
        // Tool-level failure is reported in-band (isError), not as an RPC error.
        return rpcResult(id, {
          content: [{ type: 'text', text: message }],
          isError: true,
        });
      }
    }
    default:
      if (isNotification) return null;
      return rpcError(id, -32601, `method not found: ${method ?? '(none)'}`);
  }
}
