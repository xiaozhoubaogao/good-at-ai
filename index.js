/**
 * Host half of @local/good-at-ai.
 *
 * Registers the five `/api/good-at-ai/*` routes on the browser HTTP carrier and
 * owns the judging pipeline. The browser half lives in `client.js` and is
 * discovered from this package's `dsh.client` declaration.
 *
 * Configuration note: this plugin deliberately does NOT export a schemastery
 * `Config`. The plugin directory is symlinked into the profile, so Node's module
 * resolution starts at the workspace and never reaches the profile's
 * `node_modules` — importing `schemastery` here would fail module load. Instead
 * {@link resolveConfig} normalizes the raw patch config, applies defaults, and
 * documents problems through `/health`. Nothing in `apply` throws on bad config,
 * matching the documented "no eager validation in apply" rule.
 *
 * @module @local/good-at-ai
 */

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { API_PREFIX, ROUTES } from './shared/api.js'
import { createHttpHandlers, createHandlers } from './host/routes.js'
import { resolvePlaygroundRoot } from './host/paths.js'
import { createStore } from './host/store.js'

/** Plugin id, matching the loader entry id and the client bundle id. */
export const name = 'good-at-ai'

/** Hard dependencies: routes need the HTTP carrier, judging needs the LLM service. */
export const inject = ['webServer', 'llm']

/** Absolute directory of this package (used as the playground anchor). */
const pluginDir = dirname(fileURLToPath(import.meta.url))

/**
 * Normalize raw patch config into the shape the rest of the plugin consumes.
 *
 * Never throws: unknown or malformed values fall back to defaults so a typo in
 * `cordis.patch.yml` cannot take the plugin fiber down.
 *
 * @param {unknown} raw - config supplied by the loader.
 * @returns {{ playgroundDir: string, judge: { provider: string, model: string }, enableReset: boolean, requestTimeoutMs: number, maxAnswerChars: number, maxTokens: number, allowDeterministicFallback: boolean }} the resolved config.
 */
export function resolveConfig(raw) {
  const config = raw !== null && typeof raw === 'object' ? raw : {}
  const judge = config.judge !== null && typeof config.judge === 'object' ? config.judge : {}
  const readString = (value) => (typeof value === 'string' ? value.trim() : '')
  const readBool = (value, fallback) => (typeof value === 'boolean' ? value : fallback)
  const readInt = (value, fallback, min, max) => {
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback
  }
  return {
    playgroundDir: readString(config.playgroundDir),
    judge: {
      provider: readString(judge.provider),
      model: readString(judge.model),
    },
    enableReset: readBool(config.enableReset, true),
    requestTimeoutMs: readInt(config.requestTimeoutMs, 90000, 5000, 300000),
    maxAnswerChars: readInt(config.maxAnswerChars, 8000, 200, 20000),
    // A reasoning model spends part of this budget before emitting any text, so
    // the cap must leave room for the JSON body as well as for the thinking.
    maxTokens: readInt(config.maxTokens, 3000, 512, 8000),
    allowDeterministicFallback: readBool(config.allowDeterministicFallback, false),
  }
}

/**
 * Register the plugin.
 *
 * @param {object} ctx - the Cordis context carrying `webServer` and `llm`.
 * @param {object} [rawConfig] - config from the loader.
 */
export function apply(ctx, rawConfig = {}) {
  const config = resolveConfig(rawConfig)
  const playground = resolvePlaygroundRoot(config, { pluginDir, cwd: process.cwd() })
  const store = createStore()
  const handlers = createHandlers({ config, llm: ctx.llm, store, playground })
  const http = createHttpHandlers({ handlers, prefix: API_PREFIX })

  const routeTable = {
    health: ROUTES.health,
    catalog: ROUTES.catalog,
    state: ROUTES.state,
    submit: ROUTES.submit,
    reset: ROUTES.reset,
  }
  for (const [key, path] of Object.entries(routeTable)) {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path, handler: http[key] }))
  }
}
