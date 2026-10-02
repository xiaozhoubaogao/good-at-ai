/**
 * Shared wire constants between the host and browser halves.
 *
 * Only the host imports this module. `client.js` is a browser bundle with no
 * relative-path module resolution (the platform module table resolves package
 * ids only), so it inlines the same literal values. When changing anything
 * here, change the matching literals in `client.js` as well — they are marked
 * with a comment pointing back at this file.
 *
 * @module @local/good-at-ai/shared/api
 */

/** Plugin id: the loader entry id, the client bundle id, and the API namespace. */
export const PLUGIN_ID = 'good-at-ai'

/** Package name: what the profile resolves and what `cordis.patch.yml` inserts. */
export const PACKAGE_NAME = '@local/good-at-ai'

/** Single API prefix; every route below hangs off it. */
export const API_PREFIX = '/api/good-at-ai'

/** Exact route paths registered through `ctx.webServer`. */
export const ROUTES = Object.freeze({
  health: `${API_PREFIX}/health`,
  catalog: `${API_PREFIX}/catalog`,
  state: `${API_PREFIX}/state`,
  submit: `${API_PREFIX}/submit`,
  reset: `${API_PREFIX}/reset`,
})

/** Machine-readable error codes shared with the UI so it can phrase the fix. */
export const ERROR_CODES = Object.freeze({
  badHost: 'bad-host',
  badOrigin: 'bad-origin',
  badJson: 'bad-json',
  bodyTooLarge: 'body-too-large',
  answerTooLarge: 'answer-too-large',
  badRequest: 'bad-request',
  unknownLevel: 'unknown-level',
  pathOutside: 'path-outside-playground',
  playgroundUnavailable: 'playground-unavailable',
  noModel: 'no-model',
  busy: 'busy',
  modelError: 'model-error',
  cancelled: 'cancelled',
  resetDisabled: 'reset-disabled',
  internal: 'internal',
})
