/**
 * Host routes for AI 通关.
 *
 * Every handler is a pure function of (request, services) returning
 * `{ status, body }`, so tests drive them directly with a fake `ctx` and never
 * need a real server or a real model. The HTTP adapter at the bottom is the
 * only part that touches `node:http` shapes.
 *
 * @module @local/good-at-ai/host/routes
 */

import { ERROR_CODES, ROUTES } from '../shared/api.js'
import { LEVELS, LevelDataError, catalogPayload, getLevel } from '../levels/index.js'
import { executeCheck, createCheckContext } from './checks.js'
import { judgeSubmission } from './judge.js'
import { PathError, ensurePlayground, resolveInside } from './paths.js'

/** Hard body cap for any request (128 KiB). */
export const MAX_BODY_BYTES = 128 * 1024

/** Replay-cache capacity and lifetime. */
const REPLAY_LIMIT = 50
const REPLAY_TTL_MS = 10 * 60 * 1000

/** Loopback hosts accepted in the `Host` header. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** Parse a `Host` header into hostname + port, tolerating IPv6 brackets. */
export function parseHostHeader(value) {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const trimmed = value.trim()
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    if (end === -1) return undefined
    const host = trimmed.slice(0, end + 1)
    const port = trimmed.slice(end + 1).replace(/^:/, '')
    return { host, port }
  }
  const separator = trimmed.lastIndexOf(':')
  if (separator === -1) return { host: trimmed, port: '' }
  return { host: trimmed.slice(0, separator), port: trimmed.slice(separator + 1) }
}

/** Whether a `Host` header names the loopback interface. */
export function isLoopbackHost(value) {
  const parsed = parseHostHeader(value)
  if (parsed === undefined) return false
  return LOOPBACK_HOSTS.has(parsed.host.toLowerCase())
}

/**
 * Whether a request may reach the API at all: loopback Host plus same-origin
 * `Origin` when one is present. Requests without `Origin` (same-origin fetches,
 * local tools) are allowed once the Host check passes.
 *
 * @param {{ host?: string, origin?: string }} headers - the request headers of interest.
 * @returns {{ ok: true } | { ok: false, status: number, body: object }} the guard outcome.
 */
export function guardRequest(headers) {
  const host = headers.host
  if (!isLoopbackHost(host)) {
    return {
      ok: false,
      status: 403,
      body: {
        error: {
          code: ERROR_CODES.badHost,
          message: '该接口只接受本机 loopback 请求。',
        },
      },
    }
  }
  const origin = headers.origin
  if (typeof origin === 'string' && origin.length > 0 && origin !== 'null') {
    let parsed
    try {
      parsed = new URL(origin)
    } catch {
      return {
        ok: false,
        status: 403,
        body: { error: { code: ERROR_CODES.badOrigin, message: 'Origin 头无法解析，已拒绝该请求。' } },
      }
    }
    const originHost = parsed.hostname.toLowerCase()
    if (originHost !== 'localhost' && originHost !== '127.0.0.1' && originHost !== '::1') {
      return {
        ok: false,
        status: 403,
        body: { error: { code: ERROR_CODES.badOrigin, message: '该接口只接受同源请求。' } },
      }
    }
  }
  return { ok: true }
}

/**
 * Resolve the judging model route.
 *
 * Priority: explicit config → the first provider whose model list is non-empty
 * (preferring a provider id containing `deepseek`). Every step is guarded, and
 * every failure becomes a readable error — the pipeline never silently passes a
 * level because the model was missing.
 *
 * @param {object} llm - the `ctx.llm` service.
 * @param {{ judge: { provider: string, model: string } }} config - resolved plugin config.
 * @param {{ warnings: string[] }} diagnostics - collector for recoverable notes.
 * @returns {Promise<{ ok: true, provider: string, model: string, auto: boolean, providerName: string } | { ok: false, error: object }>} the resolution.
 */
export async function selectJudge(llm, config, diagnostics = { warnings: [] }) {
  const wanted = config.judge ?? { provider: '', model: '' }
  const warnings = Array.isArray(diagnostics.warnings) ? diagnostics.warnings : []
  const push = (message) => {
    warnings.push(message)
  }

  let providers
  try {
    providers = llm.listProviders()
  } catch (error) {
    return {
      ok: false,
      error: {
        code: ERROR_CODES.noModel,
        message: '无法读取模型提供方列表。',
        hint: error instanceof Error ? error.message : String(error),
      },
    }
  }
  const available = Array.isArray(providers) ? providers.filter((item) => item && typeof item.id === 'string' && item.id.length > 0) : []
  const describeProvider = (id) => available.find((item) => item.id === id)?.name ?? id

  if (wanted.provider.length > 0) {
    const explicit = available.find((item) => item.id === wanted.provider)
    if (explicit === undefined) {
      return {
        ok: false,
        error: {
          code: ERROR_CODES.noModel,
          message: `配置里指定的评审模型提供方不存在：${wanted.provider}`,
          hint: `当前可用的提供方：${available.map((item) => item.id).join('、') || '（无）'}。请在 dsh 设置里配置模型，或修正本插件 config 的 judge.provider。`,
        },
      }
    }
    if (wanted.model.length > 0) {
      return { ok: true, provider: explicit.id, providerName: describeProvider(explicit.id), model: wanted.model, auto: false }
    }
    try {
      const models = await llm.listModels(explicit.id)
      if (!Array.isArray(models) || models.length === 0) {
        return {
          ok: false,
          error: {
            code: ERROR_CODES.noModel,
            message: `提供方 ${explicit.id} 没有可用模型。`,
            hint: '请在 dsh 设置里为该提供方配置模型，或在本插件 config 里指定 judge.model。',
          },
        }
      }
      return { ok: true, provider: explicit.id, providerName: describeProvider(explicit.id), model: models[0].id, auto: true }
    } catch (error) {
      return {
        ok: false,
        error: {
          code: ERROR_CODES.noModel,
          message: `读取 ${explicit.id} 的模型列表失败。`,
          hint: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }

  const ordered = [
    ...available.filter((item) => item.id.toLowerCase().includes('deepseek')),
    ...available.filter((item) => !item.id.toLowerCase().includes('deepseek')),
  ]
  for (const provider of ordered) {
    try {
      const models = await llm.listModels(provider.id)
      if (Array.isArray(models) && models.length > 0) {
        return {
          ok: true,
          provider: provider.id,
          providerName: describeProvider(provider.id),
          model: models[0].id,
          auto: true,
        }
      }
      push(`提供方 ${provider.id} 没有返回任何模型，已跳过。`)
    } catch (error) {
      push(`读取提供方 ${provider.id} 的模型列表失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return {
    ok: false,
    error: {
      code: ERROR_CODES.noModel,
      message: '没有找到可用于判分的模型。',
      hint: '请在 dsh 设置里配置模型，或在本插件 config 指定 judge.provider / judge.model。',
    },
  }
}

/** Create a bounded replay cache for `/submit` idempotency. */
function createReplayCache(limit = REPLAY_LIMIT, ttlMs = REPLAY_TTL_MS) {
  const entries = new Map()
  return {
    /**
     * @param {string} key - replay key.
     * @returns {object | undefined} a stored response body.
     */
    get(key) {
      const entry = entries.get(key)
      if (entry === undefined) return undefined
      if (Date.now() - entry.at > ttlMs) {
        entries.delete(key)
        return undefined
      }
      return entry.body
    },
    /**
     * @param {string} key - replay key.
     * @param {object} body - response body to replay.
     */
    set(key, body) {
      entries.set(key, { at: Date.now(), body })
      while (entries.size > limit) {
        const oldest = entries.keys().next().value
        entries.delete(oldest)
      }
    },
    clear() {
      entries.clear()
    },
  }
}

/** Normalize an unknown thrown value into a route error body. */
function toErrorBody(error, fallbackCode = ERROR_CODES.internal) {
  if (error instanceof PathError) {
    return { status: 400, body: { error: { code: error.code, message: error.message } } }
  }
  if (error instanceof LevelDataError) {
    return { status: 500, body: { error: { code: 'level-data', message: error.message } } }
  }
  return {
    status: 500,
    body: { error: { code: fallbackCode, message: error instanceof Error ? error.message : String(error) } },
  }
}

/**
 * Create every route handler.
 *
 * @param {object} options - wiring.
 * @param {object} options.config - resolved plugin config.
 * @param {object} options.llm - the `ctx.llm` service.
 * @param {object} options.store - the progress store.
 * @param {{ root: string, source: string, candidates: string[] }} options.playground - resolved playground root.
 * @param {object} [options.fs] - injectable filesystem surface for checks.
 * @returns {object} the handler table.
 */
export function createHandlers(options) {
  const { config, llm, store, playground } = options
  const warnings = []
  const inFlight = new Set()
  const replays = createReplayCache()
  /** Past settled judgements by level, returned by the deterministic fallback. */
  const recordedVerdicts = new Map()
  let cachedJudge = null

  /**
   * Resolve (and cache) the model route.
   *
   * @returns {Promise<object>} the `selectJudge` resolution.
   */
  async function judgeRoute() {
    if (cachedJudge !== null && cachedJudge.ok) return cachedJudge
    const resolved = await selectJudge(llm, config, { warnings })
    cachedJudge = resolved
    return resolved
  }

  /** Shared check-context options for this playground. */
  function checkOptions() {
    return {
      root: playground.root,
      fs: options.fs,
      relativePath: (root, path) => resolveInside(root, path),
    }
  }

  /** Run a level's deterministic checks, tolerating per-check path failures. */
  function runLevelChecks(level) {
    const context = createCheckContext(checkOptions())
    return level.checks.map((check) => {
      try {
        return executeCheck(check, context)
      } catch (error) {
        return { id: check.id, label: check.label, kind: check.kind, pass: false, evidence: `检查执行失败：${error instanceof Error ? error.message : String(error)}` }
      }
    })
  }

  return {
    /** `GET /health` */
    async health() {
      const route = await judgeRoute()
      const recovery = store.recovery()
      const base = {
        plugin: '@local/good-at-ai',
        playground: {
          root: playground.root,
          source: playground.source,
          candidates: playground.candidates,
          exists: ensurePlayground(playground.root).ok,
        },
        progressFile: store.filePath,
        warnings: [...warnings],
        recovery,
      }
      if (!route.ok) {
        return { status: 503, body: { ok: false, ...base, judge: null, error: route.error } }
      }
      return {
        status: 200,
        body: {
          ok: true,
          ...base,
          judge: { provider: route.provider, providerName: route.providerName, model: route.model, auto: route.auto },
        },
      }
    },

    /** `GET /catalog` */
    async catalog() {
      const route = await judgeRoute()
      const ensured = ensurePlayground(playground.root)
      return {
        status: 200,
        body: {
          plugin: '@local/good-at-ai',
          levels: catalogPayload(),
          limits: {
            maxAnswerChars: config.maxAnswerChars,
            maxBodyBytes: MAX_BODY_BYTES,
            requestTimeoutMs: config.requestTimeoutMs,
            maxTokens: config.maxTokens,
            allowDeterministicFallback: config.allowDeterministicFallback,
            enableReset: config.enableReset,
          },
          playground: {
            root: playground.root,
            source: playground.source,
            available: ensured.ok,
            error: ensured.ok ? null : ensured.error,
          },
          judge: route.ok
            ? { provider: route.provider, providerName: route.providerName, model: route.model, auto: route.auto }
            : null,
          judgeError: route.ok ? null : route.error,
        },
      }
    },

    /** `GET /state` */
    async state() {
      const snapshot = store.snapshot()
      const levels = LEVELS.map((level) => {
        const record = snapshot.levels[level.id] ?? null
        return {
          id: level.id,
          title: level.title,
          chapter: level.chapter,
          order: level.order,
          passed: record?.passed === true,
          bestScore: record?.bestScore ?? null,
          attempts: record?.attempts ?? 0,
          lastAt: record?.lastAt ?? null,
          lastVerdict: record?.lastVerdict ?? null,
          judgeModel: record?.judgeModel ?? null,
        }
      })
      return {
        status: 200,
        body: {
          version: snapshot.version,
          updatedAt: snapshot.updatedAt,
          levels,
          summary: {
            total: levels.length,
            passed: levels.filter((level) => level.passed).length,
          },
        },
      }
    },

    /** `POST /submit` */
    async submit(input) {
      const { requestId, levelId } = input
      if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) {
        return {
          status: 400,
          body: { error: { code: ERROR_CODES.badRequest, message: 'requestId 必须是 8–100 位的字母、数字、下划线或连字符。' } },
        }
      }
      const level = getLevel(levelId)
      if (level === undefined) {
        return { status: 404, body: { error: { code: ERROR_CODES.unknownLevel, message: `未知关卡：${String(levelId)}` } } }
      }
      const answerField = level.submit.fields.find((field) => field.type === 'text')
      const answer = typeof input.answer === 'string' ? input.answer : ''
      if (answer.trim().length === 0) {
        return { status: 400, body: { error: { code: ERROR_CODES.badRequest, message: '提交内容不能为空。' } } }
      }
      const answerLimit = Math.min(config.maxAnswerChars, answerField?.maxLength ?? config.maxAnswerChars)
      if (answer.length > answerLimit) {
        return {
          status: 413,
          body: { error: { code: ERROR_CODES.answerTooLarge, message: `提交内容超过上限 ${answerLimit} 字，请精简后重试。` } },
        }
      }
      const artifacts = Array.isArray(input.artifacts)
        ? input.artifacts.filter((item) => typeof item === 'string').slice(0, 20)
        : []

      const replayKey = `${level.id}:${requestId}`
      const replayed = replays.get(replayKey)
      if (replayed !== undefined) return { status: 200, body: { ...replayed, replayed: true } }

      if (inFlight.has(level.id)) {
        return { status: 409, body: { error: { code: ERROR_CODES.busy, message: `关卡「${level.title}」正在判定中，请稍候。` } } }
      }

      const ensured = ensurePlayground(playground.root)
      if (!ensured.ok) {
        return { status: 500, body: { error: ensured.error } }
      }

      inFlight.add(level.id)
      try {
        const checks = runLevelChecks(level)
        const checksFailed = checks.some((check) => check.pass !== true)
        const route = await judgeRoute()
        if (!route.ok) {
          return { status: 503, body: { error: route.error, checks } }
        }

        const judgement = await judgeSubmission({
          llm,
          model: { provider: route.provider, model: route.model },
          level,
          answer,
          artifacts,
          checks,
          signal: input.signal,
          timeoutMs: config.requestTimeoutMs,
          maxTokens: config.maxTokens,
        })

        const judgeModelLabel = `${route.provider}/${route.model}`
        const judgeMeta = { provider: route.provider, model: route.model, label: judgeModelLabel, auto: route.auto }

        if (judgement.status === 'cancelled') {
          return { status: 200, body: { status: 'cancelled', cancelled: true, checks, judge: judgeMeta, message: '判定已取消，未计入进度。' } }
        }

        if (judgement.status === 'error') {
          if (config.allowDeterministicFallback === true && !checksFailed) {
            const previous = recordedVerdicts.get(level.id)
            const reasons = [`确定性检查全部通过：${checks.map((check) => check.label).join('、')}。`]
            if (previous !== undefined) reasons.push(`沿用上一次模型评审结论：${(previous.reasons ?? []).join('；') || '（无理由）'}`)
            reasons.push(`本次模型评审失败：${judgement.error.message}`)
            const fallback = {
              status: 'ok',
              pass: true,
              score: previous?.score ?? 100,
              reasons,
              misses: previous?.misses ?? [],
              feedback: previous === undefined ? '文件证据全部通过且未启用模型复核（配置允许）。建议在模型可用时重新提交，以获得完整评审。' : '沿用上一次模型评审结论；建议在模型可用时重新提交以刷新评审。',
              incomplete: false,
              manualReview: false,
              judgeOverridden: false,
              fallbackJudge: true,
              usage: null,
              checks,
              judge: judgeMeta,
              error: judgement.error,
            }
            store.recordAttempt(level.id, {
              pass: true,
              score: fallback.score,
              judgeModel: judgeModelLabel,
              verdict: { fallback: true, score: fallback.score, feedback: fallback.feedback, at: new Date().toISOString() },
            })
            fallback.recorded = true
            replays.set(replayKey, fallback)
            return { status: 200, body: fallback }
          }
          return {
            status: 500,
            body: { status: 'error', error: { code: ERROR_CODES.modelError, ...judgement.error }, checks, judge: judgeMeta },
          }
        }

        if (judgement.status === 'manual-review') {
          const body = {
            status: 'manual-review',
            pass: null,
            score: null,
            reasons: [],
            misses: [],
            feedback: '模型没有返回可解析的评审结果，本次不计入进度。请重试，或缩短提交内容。',
            incomplete: judgement.incomplete === true,
            manualReview: true,
            raw: judgement.raw ?? '',
            usage: judgement.usage ?? null,
            checks,
            judge: judgeMeta,
            error: judgement.error ?? null,
          }
          replays.set(replayKey, body)
          return { status: 200, body }
        }

        const verdict = judgement.verdict
        const pass = checksFailed ? false : verdict.pass
        const judgeOverridden = checksFailed && verdict.pass === true
        const body = {
          status: 'ok',
          pass,
          score: verdict.score,
          reasons: verdict.reasons,
          misses: verdict.misses,
          feedback: verdict.feedback,
          incomplete: judgement.incomplete === true,
          repaired: judgement.repaired === true,
          manualReview: false,
          judgeOverridden,
          usage: judgement.usage ?? null,
          checks,
          judge: judgeMeta,
        }
        recordedVerdicts.set(level.id, { score: verdict.score, reasons: verdict.reasons, misses: verdict.misses })

        if (!checksFailed || config.allowDeterministicFallback === true) {
          store.recordAttempt(level.id, {
            pass,
            score: verdict.score,
            judgeModel: judgeModelLabel,
            verdict: {
              pass,
              score: verdict.score,
              reasons: verdict.reasons.slice(0, 5),
              misses: verdict.misses.slice(0, 5),
              feedback: verdict.feedback.slice(0, 400),
              at: new Date().toISOString(),
            },
          })
          body.recorded = true
        } else {
          body.recorded = false
          body.recordNote = '本次判定未通过，未写入进度；修正后可以重新提交。'
        }

        replays.set(replayKey, body)
        return { status: 200, body }
      } catch (error) {
        return toErrorBody(error)
      } finally {
        inFlight.delete(level.id)
      }
    },

    /** `POST /reset` */
    async reset() {
      if (config.enableReset !== true) {
        return { status: 404, body: { error: { code: ERROR_CODES.resetDisabled, message: '该插件配置里已关闭 /reset。' } } }
      }
      const snapshot = store.reset()
      replays.clear()
      recordedVerdicts.clear()
      return { status: 200, body: { ok: true, version: snapshot.version, updatedAt: snapshot.updatedAt } }
    },

    /** Test hook: drop the cached model route, replay cache, and past verdicts. */
    invalidate() {
      cachedJudge = null
      replays.clear()
      recordedVerdicts.clear()
    },

    /** Test hook: the accumulated diagnostic warnings. */
    warnings,
  }
}

/**
 * Read a request body with a hard byte cap.
 *
 * @param {import('node:http').IncomingMessage} req - the request.
 * @param {number} [limit] - byte cap.
 * @returns {Promise<{ ok: true, text: string } | { ok: false, code: string, status: number, message: string }>} the body outcome.
 */
export function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve) => {
    const declared = Number.parseInt(String(req.headers['content-length'] ?? ''), 10)
    if (Number.isFinite(declared) && declared > limit) {
      resolve({ ok: false, code: ERROR_CODES.bodyTooLarge, status: 413, message: `请求体超过上限 ${limit} 字节。` })
      return
    }
    const chunks = []
    let size = 0
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      req.removeListener('close', onClose)
      resolve(value)
    }
    const onClose = () => {
      // A normal end sets `complete` before 'close' arrives; anything else is a
      // disconnect, which must settle the read instead of hanging forever.
      if (req.complete === true) return
      finish({ ok: false, code: ERROR_CODES.cancelled, status: 200, message: '请求已中断。' })
    }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > limit) {
        finish({ ok: false, code: ERROR_CODES.bodyTooLarge, status: 413, message: `请求体超过上限 ${limit} 字节。` })
        req.destroy?.()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => finish({ ok: true, text: Buffer.concat(chunks).toString('utf8') }))
    req.on('close', onClose)
    req.on('error', (error) => {
      finish({ ok: false, code: ERROR_CODES.badRequest, status: 400, message: error instanceof Error ? error.message : String(error) })
    })
  })
}

/**
 * Adapt the handler table to `ctx.webServer.register`.
 *
 * @param {object} options - wiring.
 * @param {object} options.handlers - a {@link createHandlers} result.
 * @param {string} options.prefix - API prefix (for logging only).
 * @returns {{ health: Function, catalog: Function, state: Function, submit: Function, reset: Function }} node-style handlers.
 */
export function createHttpHandlers(options) {
  const { handlers } = options
  const prefix = options.prefix ?? ROUTES.catalog.replace(/\/catalog$/, '')

  /** Write one JSON response. */
  function send(res, status, body) {
    if (res.writableEnded === true) return
    const payload = JSON.stringify(body ?? null)
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Length', Buffer.byteLength(payload))
    res.end(payload)
  }

  /** Wrap a handler with the guard, body reading, and error containment. */
  function wrap(handler, { withBody = false } = {}) {
    return async (req, res) => {
      try {
        const guard = guardRequest({ host: req.headers.host, origin: req.headers.origin })
        if (!guard.ok) {
          send(res, guard.status, guard.body)
          return
        }

        // Watch for disconnect from the start, but tell the two cases apart:
        // Node emits 'close' both when a client vanishes mid-body AND after a
        // normal request has been fully read. `req.complete` is true only in
        // the second case, so it is the discriminator that keeps a normal POST
        // from being reported as cancelled while still honouring a real abort.
        const controller = new AbortController()
        const onClose = () => {
          if (req.complete === true) return
          if (res.writableEnded === true) return
          controller.abort()
        }
        req.on('close', onClose)

        try {
          let input = { signal: controller.signal }
          if (withBody) {
            const body = await readBody(req)
            if (!body.ok) {
              if (body.code === ERROR_CODES.cancelled) controller.abort()
              send(res, body.status, { error: { code: body.code, message: body.message } })
              return
            }
            let parsed
            try {
              parsed = body.text.trim().length === 0 ? {} : JSON.parse(body.text)
            } catch {
              send(res, 400, { error: { code: ERROR_CODES.badJson, message: '请求体不是合法 JSON。' } })
              return
            }
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
              send(res, 400, { error: { code: ERROR_CODES.badRequest, message: '请求体必须是 JSON 对象。' } })
              return
            }
            input = { ...parsed, signal: controller.signal }
          }

          if (controller.signal.aborted) {
            send(res, 200, { status: 'cancelled', cancelled: true, message: '请求已中断，未开始判定。' })
            return
          }

          const settled = await handler(input)
          send(res, settled.status, settled.body)
        } finally {
          req.removeListener('close', onClose)
        }
      } catch (error) {
        send(res, 500, { error: { code: ERROR_CODES.internal, message: error instanceof Error ? error.message : String(error) } })
      }
    }
  }

  // `prefix` participates in diagnostics only; the exact paths live in ROUTES.
  void prefix

  return {
    health: wrap(() => handlers.health()),
    catalog: wrap(() => handlers.catalog()),
    state: wrap(() => handlers.state()),
    submit: wrap((input) => handlers.submit(input), { withBody: true }),
    reset: wrap(() => handlers.reset(), { withBody: true }),
  }
}
