/**
 * Shared fixtures for the AI 通关 test suite.
 *
 * Tests run offline against fake services and temporary directories; nothing
 * here touches a real model or the user's DSH home.
 *
 * @module @local/good-at-ai/tests/helpers
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveConfig } from '../index.js'
import { createStore } from '../host/store.js'
import { createHandlers } from '../host/routes.js'
import { resolvePlaygroundRoot } from '../host/paths.js'

/**
 * Create a temp directory that is removed when the callback settles.
 *
 * @param {(dir: string) => Promise<void> | void} body - test body.
 * @returns {Promise<void>} resolves after cleanup.
 */
export async function withTempDir(body) {
  const dir = mkdtempSync(join(tmpdir(), 'gaai-test-'))
  try {
    await body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * A fake `ctx.llm` with configurable behavior.
 *
 * @param {object} [options] - behavior knobs.
 * @param {string} [options.mode] - `ok` | `error` | `garbage` | `maxtokens` | `abort` | `toolcalls`.
 * @param {object} [options.verdict] - verdict object returned in `ok` mode.
 * @param {string[]} [options.providers] - provider ids to advertise.
 * @param {string[]} [options.modelProviders] - providers that report at least one model.
 * @returns {object} the fake llm service plus a `calls` counter.
 */
export function fakeLlm(options = {}) {
  const mode = options.mode ?? 'ok'
  const verdict = options.verdict ?? {
    pass: true,
    score: 88,
    reasons: ['四要素齐全', '格式约束具体'],
    misses: [],
    feedback: '把验收标准再量化一点。',
  }
  const providers = options.providers ?? [
    { id: 'openai-compatible', name: 'OpenAI 兼容' },
    { id: 'deepseek', name: 'DeepSeek' },
  ]
  const modelProviders = options.modelProviders ?? ['deepseek']
  const state = { calls: 0, lastOptions: null }

  function chunks() {
    if (mode === 'error') {
      return [{ type: 'finish', reason: { kind: 'error', failure: { code: 'rate-limited', message: '请求过于频繁', status: 429 } } }]
    }
    if (mode === 'abort') {
      return [{ type: 'finish', reason: { kind: 'aborted', failure: { code: 'aborted', message: '已取消' } } }]
    }
    if (mode === 'maxtokens') {
      return [
        { type: 'text-delta', index: 0, text: '{"pass": true, "score": 80, "reasons": ["好"],' },
        { type: 'finish', reason: { kind: 'max-tokens' } },
      ]
    }
    if (mode === 'toolcalls') {
      return [{ type: 'finish', reason: { kind: 'tool-calls' } }]
    }
    if (mode === 'garbage') {
      return [
        { type: 'text-delta', index: 0, text: '抱歉，我无法完成这个评审。' },
        { type: 'finish', reason: { kind: 'stop' } },
      ]
    }
    return [
      { type: 'text-delta', index: 0, text: '```json\n' },
      { type: 'text-delta', index: 0, text: JSON.stringify(verdict) },
      { type: 'text-delta', index: 0, text: '\n```' },
      { type: 'usage', usage: { inputTokens: 400, outputTokens: 90 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]
  }

  return {
    calls: () => state.calls,
    lastOptions: () => state.lastOptions,
    listProviders: () => providers,
    listModels: async (provider) =>
      modelProviders.includes(provider) ? [{ provider, id: `${provider}-chat`, name: `${provider}-chat` }] : [],
    stream(runOptions) {
      state.calls += 1
      state.lastOptions = runOptions
      if (typeof options.onStream === 'function') {
        const custom = options.onStream(runOptions, state.calls)
        if (custom !== undefined) return custom
      }
      return (async function* generate() {
        for (const chunk of chunks()) yield chunk
      })()
    },
  }
}

/**
 * Build a handler table over a temp playground.
 *
 * @param {object} options - wiring.
 * @param {string} options.dir - temp directory root.
 * @param {object} [options.config] - raw config overrides.
 * @param {object} [options.llm] - fake llm (defaults to a passing one).
 * @returns {{ handlers: object, playground: object, store: object, dir: string }} the wiring.
 */
export function makeHandlers(options) {
  const config = resolveConfig(options.config ?? {})
  const playground = resolvePlaygroundRoot({ playgroundDir: join(options.dir, 'playground') })
  const store = createStore({ dir: join(options.dir, 'state') })
  const handlers = createHandlers({ config, llm: options.llm ?? fakeLlm(), store, playground })
  return { handlers, playground, store, config, dir: options.dir }
}
