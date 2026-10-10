import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';
import type { Env } from './types';

// Transport-level tests read dynamically-shaped JSON; one loosely-typed reader
// keeps the assertions terse without annotating `any` at every call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readBody = (res: Response): Promise<any> => res.json();

const GRID_PM25 = {
  variable: 'pm2_5',
  resolution: 1.0,
  timestamp: 1784829600000,
  nLat: 2,
  nLon: 2,
  latMin: -90,
  lonMin: -180,
  dLat: 1,
  dLon: 1,
  points: [
    { lat: -90, lon: -180, value: 0.74 },
    { lat: 37, lon: 127, value: 35.2 },
    { lat: 14, lon: 100, value: 11.6 },
  ],
  source: 'NOAA GEFS-Aerosols',
};
const PREDICTIONS = {
  generated_at: '2026-07-22T04:57:44Z',
  model_version: 'v2.0',
  model_available: true,
  count: 1,
  predictions: [
    {
      name: 'Seoul',
      lat: 37.5665,
      lon: 126.978,
      timestamp: '2026-07-22T04:00:00Z',
      predicted_p10: 19.12,
      predicted_p50: 39.28,
      predicted_p90: 41.3,
      uncertainty: 22.17,
      observed_pm25: 38,
      model_version: 'v2.0',
      source: 'ML',
      confidence_grade: 'B',
    },
  ],
};

const SNAPSHOTS: Record<string, unknown> = {
  '/aq-data/current-pm25-grid.json': GRID_PM25,
  '/aq-data/predictions/grid_latest.json': PREDICTIONS,
};

function stubFetch() {
  vi.stubGlobal('fetch', (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    if (path in SNAPSHOTS) {
      return Promise.resolve(new Response(JSON.stringify(SNAPSHOTS[path]), { status: 200 }));
    }
    return Promise.resolve(new Response('nf', { status: 404 }));
  });
}

const env: Env = {
  DATA_ORIGIN: 'https://airlens.cloud',
  RATE_LIMIT_MAX: '1000',
  RATE_LIMIT_WINDOW_SECONDS: '60',
  ALLOWED_ORIGINS: '*',
};

function rpc(body: unknown) {
  return worker.fetch(
    new Request('https://api.airlens.cloud/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('MCP', () => {
  it('initialize → protocol + serverInfo', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.result.serverInfo.name).toBe('airlens-public-api');
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it('notification (no id) → 202 empty', async () => {
    const res = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(202);
  });

  it('tools/list → the 5 tools', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const body = await readBody(res);
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual([
      'get_city_predictions',
      'get_city_prediction',
      'get_pollutant_at',
      'get_stations',
      'get_catalog',
    ]);
  });

  it('tools/call get_city_prediction → text content with coverage', async () => {
    stubFetch();
    const res = await rpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_city_prediction', arguments: { name: 'Seoul' } },
    });
    const body = await readBody(res);
    expect(body.result.isError).toBeUndefined();
    const payload = JSON.parse(body.result.content[0].text);
    expect(payload.city.name).toBe('Seoul');
    // A real, sourced number now (2026-09-03 forward-check) — see
    // catalog-attribution.contract.test.ts for the full sourcing assertion.
    expect(payload.coverage.empirical_picp_pct).toBe(77.1);
  });

  it('tools/call get_pollutant_at → nearest cell + model provenance', async () => {
    stubFetch();
    const res = await rpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'get_pollutant_at', arguments: { lat: 37.5, lon: 127 } },
    });
    const body = await readBody(res);
    const payload = JSON.parse(body.result.content[0].text);
    expect(payload.provenance).toBe('model-forecast');
    expect(payload.nearest_cell).toEqual({ lat: 37, lon: 127, value: 35.2 });
  });

  it('tools/call unknown tool → isError in-band', async () => {
    stubFetch();
    const res = await rpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'drop_tables', arguments: {} },
    });
    const body = await readBody(res);
    expect(body.result.isError).toBe(true);
  });

  it('unknown method with id → JSON-RPC -32601', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 6, method: 'resources/list' });
    const body = await readBody(res);
    expect(body.error.code).toBe(-32601);
  });

  it('GET /mcp → 405 (no SSE push)', async () => {
    const res = await worker.fetch(new Request('https://api.airlens.cloud/mcp'), env);
    expect(res.status).toBe(405);
  });

  it('id: 0 is a real request id, not treated as a notification', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 0, method: 'ping' });
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.id).toBe(0);
    expect(body.result).toEqual({});
  });

  it('batch with a null element → whole batch survives (no 500)', async () => {
    const res = await rpc([{ jsonrpc: '2.0', id: 1, method: 'ping' }, null]);
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(Array.isArray(body)).toBe(true);
    // valid ping answered + the null element becomes an Invalid Request error
    expect(body.find((m: { id?: number }) => m.id === 1).result).toEqual({});
    expect(body.some((m: { error?: { code?: number } }) => m.error?.code === -32600)).toBe(true);
  });

  it('top-level null body → -32600, not a 500', async () => {
    const res = await rpc(null);
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.error.code).toBe(-32600);
  });

  it('batch over the cap → 413', async () => {
    const big = Array.from({ length: 21 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'ping' }));
    const res = await rpc(big);
    expect(res.status).toBe(413);
  });

  it('malformed JSON body → -32700 parse error, 400', async () => {
    const res = await worker.fetch(
      new Request('https://api.airlens.cloud/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ not json',
      }),
      env,
    );
    expect(res.status).toBe(400);
    const body = await readBody(res);
    expect(body.error.code).toBe(-32700);
  });
});
