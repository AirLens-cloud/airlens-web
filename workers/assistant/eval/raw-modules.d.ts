// Vite/vitest `?raw` imports. eval/generate.ts reads wrangler.toml this way so
// the A/B harness uses the production generation settings without duplicating
// them — and without adding @types/node for four values.
declare module '*?raw' {
  const content: string;
  export default content;
}
