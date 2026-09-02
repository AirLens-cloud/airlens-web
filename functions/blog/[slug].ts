// SSR for /blog/:slug. Shared logic: functions/_lib/pageHandlers.ts.
import { blogPostHandler } from '../_lib/pageHandlers'

export const onRequest = blogPostHandler
