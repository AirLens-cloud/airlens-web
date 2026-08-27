/**
 * idw.worker — dedicated Worker running buildIdwField off the main thread (Globe P4a).
 * No `/// <reference lib="webworker" />` — the project's tsconfig already loads the
 * DOM lib globally, and layering the WebWorker lib on top redeclares `self` with a
 * conflicting type across the whole program. `self`/`MessageEvent` typed via DOM's
 * `Window`/`Worker` declarations are enough for this file; `postMessage` is called
 * through a `Worker` cast to get the (message, transfer[]) overload.
 */
import { buildIdwField } from './idwCore';
import type { IdwRequest, IdwResponse } from '../../../../types/globe';

self.onmessage = (e: MessageEvent<IdwRequest>) => {
  const { token, stations, scale, w, h, params } = e.data;
  const pixels = buildIdwField(stations, scale, w, h, params);
  const res: IdwResponse = { token, pixels };
  (self as unknown as Worker).postMessage(res, [pixels.buffer]);
};
