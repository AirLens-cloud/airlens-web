/**
 * openapi.ts — build the OpenAPI 3.1 document from the catalog so the spec and
 * the served endpoints share one source of truth (catalog.ts).
 */

import { API_DESCRIPTION, API_TITLE, API_VERSION, COVERAGE_SUMMARY, GRID_VARIABLES } from './catalog';

export function buildOpenApi(publicBaseUrl: string): Record<string, unknown> {
  const gridEnum = GRID_VARIABLES.map((g) => g.variable);

  return {
    openapi: '3.1.0',
    info: {
      title: API_TITLE,
      version: '1.0.0',
      description: API_DESCRIPTION,
      license: { name: 'AGPL-3.0-or-later', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
    },
    servers: [{ url: `${publicBaseUrl}/${API_VERSION}`, description: 'Public API v1' }],
    paths: {
      '/health': {
        get: {
          summary: 'Liveness + dataset index',
          operationId: 'getHealth',
          responses: { '200': { description: 'Service is up.' } },
        },
      },
      '/grid/latest': {
        get: {
          summary: 'Latest pollutant forecast grid (NOAA GEFS model, 1°)',
          description:
            'A re-hosted numerical model forecast — NOT AirLens ML. No per-cell uncertainty or DQSS.',
          operationId: 'getGridLatest',
          parameters: [
            {
              name: 'variable',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: gridEnum, default: 'pm25' },
              description: 'Pollutant grid to return.',
            },
          ],
          responses: {
            '200': { description: 'Grid snapshot with provenance.' },
            '400': { description: 'Unknown variable.' },
            '502': { description: 'Upstream snapshot unavailable.' },
          },
        },
      },
      '/predictions/cities': {
        get: {
          summary: 'AirLens ML city PM2.5 predictions (p10/p50/p90 + confidence)',
          description: `${COVERAGE_SUMMARY} See \`coverage\`.`,
          operationId: 'getCityPredictions',
          responses: { '200': { description: 'All cities with coverage disclosure.' } },
        },
      },
      '/predictions/cities/{name}': {
        get: {
          summary: 'One city prediction by name',
          operationId: 'getCityPrediction',
          parameters: [
            {
              name: 'name',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'City name (case-insensitive).',
            },
          ],
          responses: {
            '200': { description: 'City prediction with coverage disclosure.' },
            '404': { description: 'No prediction for that city.' },
          },
        },
      },
      '/stations': {
        get: {
          summary: 'Station data-quality (DQSS) snapshot',
          description:
            'Ground-station readings (subject_provenance: observed) scored by DQSS (provenance: ' +
            'inferred). Each station carries final_score+measured_weight together, a components ' +
            'breakdown, dqss_grade (null unless measured_weight >= 60/100), and a reason map for ' +
            'unmeasured components. status is "withheld" with an empty stations array when the ' +
            'upstream snapshot has no real scores yet.',
          operationId: 'getStations',
          responses: { '200': { description: 'Stations with DQSS components + grade, or a withheld snapshot.' } },
        },
      },
      '/ontology/summary': {
        get: {
          summary: 'Data catalog: datasets, provenance kinds, DQSS grade cutoffs',
          operationId: 'getOntologySummary',
          responses: { '200': { description: 'Machine-readable catalog.' } },
        },
      },
    },
    'x-mcp': {
      endpoint: `${publicBaseUrl}/mcp`,
      transport: 'streamable-http',
      description: 'Same datasets exposed as MCP tools (initialize / tools.list / tools.call).',
    },
  };
}
