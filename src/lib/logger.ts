const PREFIX = '[airlens-web]'

const isDev = import.meta.env.DEV

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
