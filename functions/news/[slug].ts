// SSR for /news/:slug. Shared logic: functions/_lib/pageHandlers.ts.
import { newsArticleHandler } from '../_lib/pageHandlers'

export const onRequest = newsArticleHandler
