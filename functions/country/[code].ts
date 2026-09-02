// SSR for /country/:code. Shared logic: functions/_lib/pageHandlers.ts.
import { countryHandler } from '../_lib/pageHandlers'

export const onRequest = countryHandler
