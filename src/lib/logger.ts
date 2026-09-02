const PREFIX = '[airlens-web]'

// `import.meta.env` is a Vite build-time injection — present when this module
// runs in the SPA bundle, but `undefined` when it's pulled into a Cloudflare
// Pages Function (Wrangler's esbuild bundler doesn't inject it), which would
// otherwise throw here at module load and take the whole Function down.
const isDev = import.meta.env?.DEV ?? false

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(PREFIX, ...args)
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info(PREFIX, ...args)
  },
  warn: (...args: unknown[]) => {
    console.warn(PREFIX, ...args)
  },
  error: (...args: unknown[]) => {
    console.error(PREFIX, ...args)
  },
}
