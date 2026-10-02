/**
 * Model judging: the probabilistic half of the pipeline.
 *
 * The service has no structured-output switch and reports failures as a
 * terminal chunk instead of throwing, so this module streams, collects, then
 * parses defensively: extract the first balanced JSON object, validate it by
 * hand, and on any parse or validation failure retry exactly once with the
 * error appended. A second failure yields `manual-review` with the raw output —
 * never a default pass.
 *
 * @module @local/good-at-ai/host/judge
 */

/** Hard ceiling on collected output; the stream is also bounded by `maxTokens`. */
const MAX_COLLECTED_CHARS = 20000

/** Excerpt budget for the raw output echoed back to the UI on manual review. */
const RAW_EXCERPT_CHARS = 2000

/**
 * Extract the first balanced JSON object from model output.
 *
 * Handles bare JSON, ```json fenced output, and prose before or after the
 * object. Scans brace depth while skipping string literals and escapes.
 *
 * @param {string} text - raw model output.
 * @returns {{ ok: true, value: unknown, raw: string } | { ok: false, reason: string }} the parse outcome.
 */
export function extractJson(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, reason: '模型没有输出任何内容。' }
  }
  const source = text
  let start = -1
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '{') {
      start = index
      break
    }
  }
  if (start === -1) return { ok: false, reason: '模型输出里没有找到 JSON 对象。' }

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        const candidate = source.slice(start, index + 1)
        try {
          return { ok: true, value: JSON.parse(candidate), raw: candidate }
        } catch (error) {
          return { ok: false, reason: `JSON 解析失败：${error instanceof Error ? error.message : String(error)}` }
        }
      }
    }
  }
  return { ok: false, reason: '模型输出的 JSON 对象没有闭合（可能被 max-tokens 截断）。' }
}

/** Clamp a number into an integer range. */
function clampInt(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/**
 * Hand-validate a parsed verdict against the rubric contract.
 *
 * @param {unknown} value - parsed JSON.
 * @returns {{ ok: true, verdict: object } | { ok: false, reason: string }} the normalized verdict or a repair hint.
 */
export function normalizeVerdict(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: '顶层必须是 JSON 对象。' }
  }
  if (typeof value.pass !== 'boolean') return { ok: false, reason: '`pass` 必须是布尔值 true/false。' }
  const score = Number.isFinite(value.score) ? clampInt(value.score, 0, 100, 0) : null
  if (score === null) return { ok: false, reason: '`score` 必须是 0–100 之间的数字。' }

  const readStringList = (input, field) => {
    if (input === undefined || input === null) return []
    if (!Array.isArray(input)) return { error: `\`${field}\` 必须是字符串数组。` }
    const items = []
    for (const item of input) {
      if (typeof item !== 'string') return { error: `\`${field}\` 的每一项都必须是字符串。` }
      const trimmed = item.trim()
      if (trimmed.length > 0) items.push(trimmed.slice(0, 300))
      if (items.length >= 8) break
    }
    return items
  }

  const reasons = readStringList(value.reasons, 'reasons')
  if (!Array.isArray(reasons)) return { ok: false, reason: reasons.error }
  const misses = readStringList(value.misses, 'misses')
  if (!Array.isArray(misses)) return { ok: false, reason: misses.error }

  const feedback = typeof value.feedback === 'string' ? value.feedback.trim().slice(0, 1200) : ''
  if (feedback.length === 0) return { ok: false, reason: '`feedback` 必须是非空字符串。' }

  return { ok: true, verdict: { pass: value.pass, score, reasons, misses, feedback } }
}

/**
 * Build the review system prompt for one level.
 *
 * @param {object} level - level definition.
 * @returns {string} the system prompt.
 */
export function buildSystemPrompt(level) {
  const rubric = level.rubric
    .map((item, index) => `${index + 1}. [${item.id}] ${item.label}（权重 ${item.weight}）`)
    .join('\n')
  const extra = typeof level.systemPromptExtra === 'string' ? level.systemPromptExtra.trim().slice(0, 2000) : ''
  return [
    '你是一个严格、公正的技能评审员，负责判断学员是否真正掌握了「用 AI 干活」的技能。',
    '',
    `关卡：${level.title}`,
    `章节：${level.chapter}`,
    `目标：${level.goal}`,
    `任务说明：${level.brief}`,
    '',
    '评分维度（rubric）：',
    rubric,
    `通过线：总分 ≥ ${level.passScore}，且没有任何 rubric 维度严重缺失。`,
    '',
    '评审规则：',
    '- 用 rubric 逐条核查学员提交的实际内容，不要凭印象给分。',
    '- 只要学员的提交缺少任务要求的关键要素（角色、上下文、输出格式约束、验收标准、具体指令等），就应判未通过。',
    '- 反作弊：如果提交只是复述评分标准/任务要求原文、粘贴示例、或把指令本身当作答案，直接判未通过，并在 reasons 里说明。',
    '- 如果提交是空话、占位符、或与任务无关，直接判未通过。',
    '- 评分要给具体证据：指出提交里哪一句满足或不满足哪条维度。',
    ...(extra.length > 0 ? ['', '本关额外要求：', extra] : []),
    '',
    '输出要求：只输出一个 JSON 对象，不要输出任何解释、前后缀或 Markdown 代码围栏。JSON 结构必须是：',
    '{"pass": true 或 false, "score": 0-100 的整数, "reasons": ["逐条通过的理由或扣分点"], "misses": ["缺失的关键要素"], "feedback": "给学员的下一步改进建议"}',
  ].join('\n')
}

/**
 * Build the user message payload for the first judging turn.
 *
 * @param {object} level - level definition.
 * @param {{ answer: string, artifacts?: string[], checks?: object[] }} submission - the user's submission.
 * @returns {string} the JSON-wrapped user payload.
 */
export function buildUserPayload(level, submission) {
  const payload = {
    level: { id: level.id, title: level.title, goal: level.goal, brief: level.brief, tips: level.tips },
    submission: {
      text: submission.answer,
      artifacts: Array.isArray(submission.artifacts) ? submission.artifacts : [],
    },
    deterministicChecks: Array.isArray(submission.checks)
      ? submission.checks.map((check) => ({
          label: check.label,
          pass: check.pass,
          evidence: typeof check.evidence === 'string' ? check.evidence.slice(0, 400) : '',
        }))
      : [],
  }
  return `以下是结构化提交（JSON），请按系统提示评审：\n${JSON.stringify(payload, null, 2)}`
}

/** Build a `RequestUserInput` message. */
function userMessage(text) {
  return { role: 'user', content: [{ type: 'text', text }] }
}

/** Turn an LlmFailure into a readable, non-leaking error. */
function describeFailure(failure) {
  if (failure === null || typeof failure !== 'object') {
    return { code: 'model-error', message: '模型调用失败（未返回错误详情）。' }
  }
  const code = typeof failure.code === 'string' ? failure.code : 'model-error'
  const message = typeof failure.message === 'string' && failure.message.length > 0 ? failure.message : '模型调用失败。'
  return {
    code,
    message,
    status: Number.isFinite(failure.status) ? failure.status : undefined,
  }
}

/**
 * Consume one streamed model call into a single outcome.
 *
 * Reasoning deltas are collected separately: a reasoning model can spend the
 * entire output budget thinking and emit no text at all, and without this the
 * caller only sees an empty string and cannot tell why.
 *
 * @param {AsyncIterable<object>} stream - the chunk stream from `ctx.llm.stream`.
 * @returns {Promise<object>} `{ kind, text, reasoning, usage, truncated, failure? }`.
 */
export async function collectStream(stream) {
  let text = ''
  let reasoning = ''
  let usage = null
  let truncated = false
  for await (const chunk of stream) {
    if (chunk === null || typeof chunk !== 'object') continue
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
      if (text.length < MAX_COLLECTED_CHARS) text += chunk.text
      else truncated = true
    } else if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
      if (reasoning.length < MAX_COLLECTED_CHARS) reasoning += chunk.text
    } else if (chunk.type === 'usage' && chunk.usage && typeof chunk.usage === 'object') {
      usage = chunk.usage
    } else if (chunk.type === 'finish') {
      const reason = chunk.reason && typeof chunk.reason === 'object' ? chunk.reason : {}
      const kind = typeof reason.kind === 'string' ? reason.kind : 'no-finish'
      return {
        kind,
        text,
        reasoning,
        usage,
        truncated,
        failure: reason.failure,
      }
    }
  }
  return { kind: 'no-finish', text, reasoning, usage, truncated }
}

/**
 * Explain an empty model reply that spent its whole budget on reasoning.
 *
 * @param {string} text - collected answer text.
 * @param {string} reasoning - collected reasoning text.
 * @param {object|null} usage - reported token usage.
 * @param {number} maxTokens - the cap that was requested.
 * @returns {string} a human-readable reason, or an empty string when not applicable.
 */
export function describeEmptyReply(text, reasoning, usage, maxTokens) {
  if (text.trim().length > 0) return ''
  if (reasoning.trim().length > 0) {
    return `模型把本次输出的 ${maxTokens} token 预算全部用在推理上，没有留下任何正文（推理内容 ${reasoning.length} 字）。请提高 judge.maxTokens、缩短提交内容，或换一个更简短的评审提示词。`
  }
  return `模型没有输出任何内容${usage ? `（输出 ${usage.outputTokens ?? '?'} token）` : ''}。请重试或提高 judge.maxTokens。`
}

/**
 * Judge one submission against one level.
 *
 * @param {object} options - judging inputs.
 * @param {object} options.llm - the `ctx.llm` service.
 * @param {{ provider: string, model: string }} options.model - the resolved route.
 * @param {object} options.level - level definition.
 * @param {string} options.answer - the user's answer text.
 * @param {string[]} [options.artifacts] - artifact paths the user claims.
 * @param {object[]} [options.checks] - deterministic check results already computed.
 * @param {AbortSignal} [options.signal] - cancellation.
 * @param {number} [options.maxTokens] - output cap.
 * @param {number} [options.timeoutMs] - hard timeout for the whole judging call.
 * @returns {Promise<object>} a settled judgement: `{ status, verdict, manualReview, incomplete, raw, usage, error }`.
 */
export async function judgeSubmission(options) {
  const { llm, model, level, answer, signal } = options
  const maxTokens = Number.isFinite(options.maxTokens) ? options.maxTokens : 3000
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 90000

  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (signal !== undefined) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const system = buildSystemPrompt(level)
  const messages = [userMessage(buildUserPayload(level, { answer, artifacts: options.artifacts, checks: options.checks }))]

  /** Run one streamed call and settle its terminal state. */
  async function call(turnMessages) {
    let settled
    try {
      const stream = llm.stream({
        provider: model.provider,
        model: model.model,
        system,
        messages: turnMessages,
        maxTokens,
        temperature: 0,
        signal: controller.signal,
      })
      settled = await collectStream(stream)
    } catch (error) {
      return {
        kind: 'error',
        text: '',
        reasoning: '',
        usage: null,
        failure: { code: 'stream-failed', message: error instanceof Error ? error.message : String(error) },
      }
    }
    return settled
  }

  /**
   * One repair turn: hand the model its own output plus the precise failure.
   *
   * @param {object[]} baseMessages - the original turn.
   * @param {object} previous - the first call's settled result.
   * @param {string} reason - why parsing or validation failed.
   * @param {boolean} incomplete - whether the first call hit the token cap.
   * @returns {Promise<object>} the settled judgement.
   */
  async function repair(baseMessages, previous, reason, incomplete) {
    const repairMessages = [
      ...baseMessages,
      {
        role: 'assistant',
        content: [{ type: 'text', text: previous.text.slice(0, 4000) || '(空输出)' }],
        source: { kind: 'model', provider: model.provider, model: model.model },
      },
      userMessage(
        [
          `你上一次的输出不符合要求：${reason}`,
          '请只输出一个合法的 JSON 对象，字段为 pass(布尔)、score(0-100 整数)、reasons(字符串数组)、misses(字符串数组)、feedback(字符串)。',
          '不要输出任何其他文字或 Markdown 代码围栏。',
        ].join('\n'),
      ),
    ]
    const second = await call(repairMessages)
    if (second.kind === 'aborted') {
      return { status: 'cancelled', error: { code: 'cancelled', message: '判定已取消。' } }
    }
    if (second.kind === 'error') {
      const failure = describeFailure(second.failure)
      return { status: 'error', error: { code: failure.code, message: failure.message, status: failure.status } }
    }
    const stillIncomplete = incomplete || second.kind === 'max-tokens' || second.truncated === true
    const secondParsed = extractJson(second.text)
    if (secondParsed.ok) {
      const normalized = normalizeVerdict(secondParsed.value)
      if (normalized.ok) {
        return {
          status: 'ok',
          verdict: normalized.verdict,
          incomplete: stillIncomplete,
          usage: second.usage ?? previous.usage,
          repaired: true,
        }
      }
      return {
        status: 'manual-review',
        raw: second.text.slice(0, RAW_EXCERPT_CHARS),
        incomplete: stillIncomplete,
        usage: second.usage ?? previous.usage,
        error: { code: 'model-error', message: `模型两次都没有返回合法评审 JSON：${normalized.reason}` },
      }
    }
    return {
      status: 'manual-review',
      raw: second.text.slice(0, RAW_EXCERPT_CHARS),
      incomplete: stillIncomplete,
      usage: second.usage ?? previous.usage,
      error: { code: 'model-error', message: `模型两次都没有返回合法评审 JSON：${secondParsed.reason}` },
    }
  }

  try {
    const first = await call(messages)
    if (first.kind === 'aborted') {
      return { status: 'cancelled', error: { code: 'cancelled', message: '判定已取消。' } }
    }
    if (first.kind === 'error') {
      const failure = describeFailure(first.failure)
      return { status: 'error', error: { code: failure.code, message: failure.message, status: failure.status } }
    }
    if (first.kind === 'tool-calls') {
      return {
        status: 'manual-review',
        raw: first.text.slice(0, RAW_EXCERPT_CHARS),
        incomplete: false,
        usage: first.usage,
        error: { code: 'model-error', message: '模型返回了工具调用而不是评审 JSON，请重试。' },
      }
    }

    const incomplete = first.kind === 'max-tokens' || first.truncated === true
    const parsed = extractJson(first.text)
    if (parsed.ok) {
      const normalized = normalizeVerdict(parsed.value)
      if (normalized.ok) {
        return {
          status: 'ok',
          verdict: normalized.verdict,
          incomplete,
          usage: first.usage,
        }
      }
      return await repair(messages, first, normalized.reason, incomplete)
    }
    // A reasoning model that spent the whole budget thinking deserves the
    // specific explanation, not "the output contained no JSON object".
    const emptyReason = describeEmptyReply(first.text, first.reasoning, first.usage, maxTokens)
    if (emptyReason.length > 0 && incomplete) {
      return {
        status: 'manual-review',
        raw: '',
        incomplete: true,
        usage: first.usage,
        error: { code: 'model-error', message: emptyReason },
      }
    }
    return await repair(messages, first, parsed.reason, incomplete)
  } finally {
    clearTimeout(timer)
    if (signal !== undefined) signal.removeEventListener('abort', onAbort)
  }
}
