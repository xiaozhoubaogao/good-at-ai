import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { collectStream, extractJson, judgeSubmission, normalizeVerdict } from '../host/judge.js'
import { fakeLlm } from './helpers.js'

/** A minimal level used by the judge tests. */
const LEVEL = {
  id: 'demo',
  chapter: '测试',
  title: '演示关卡',
  goal: '验证判分解析',
  brief: '随便写点什么',
  tips: [],
  rubric: [{ id: 'a', label: '维度 A', weight: 1 }],
  checks: [],
  passScore: 70,
}

/** Stream chunks from an array. */
function streamOf(chunks) {
  return (async function* generate() {
    for (const chunk of chunks) yield chunk
  })()
}

describe('judge: extractJson', () => {
  it('parses bare JSON', () => {
    const outcome = extractJson('{"pass":true,"score":80,"reasons":[],"misses":[],"feedback":"ok"}')
    assert.equal(outcome.ok, true)
    assert.equal(outcome.value.pass, true)
  })

  it('parses fenced JSON with surrounding prose', () => {
    const outcome = extractJson('好的，这是我的评审：\n```json\n{"pass":false,"score":12,"reasons":["缺少角色"],"misses":["角色"],"feedback":"补上角色"}\n```\n希望有帮助。')
    assert.equal(outcome.ok, true)
    assert.equal(outcome.value.score, 12)
  })

  it('keeps brace balance across strings and escapes', () => {
    const outcome = extractJson('prefix {"pass":true,"score":70,"reasons":["含 } 与 \\" 引号"],"misses":[],"feedback":"f"} suffix')
    assert.equal(outcome.ok, true)
    assert.deepEqual(outcome.value.reasons, ['含 } 与 " 引号'])
  })

  it('reports truncated and non-object output', () => {
    assert.equal(extractJson('{"pass": true, "score": 80,').ok, false)
    assert.equal(extractJson('完全没有 JSON').ok, false)
    assert.equal(extractJson('').ok, false)
    assert.equal(extractJson(null).ok, false)
  })

  it('reports a JSON syntax error inside a balanced object', () => {
    const outcome = extractJson('{"pass": tru}')
    assert.equal(outcome.ok, false)
    assert.ok(outcome.reason.includes('解析失败'))
  })
})

describe('judge: normalizeVerdict', () => {
  const valid = { pass: true, score: 90, reasons: ['r'], misses: [], feedback: 'f' }

  it('accepts a valid verdict', () => {
    const outcome = normalizeVerdict(valid)
    assert.equal(outcome.ok, true)
    assert.equal(outcome.verdict.score, 90)
  })

  it('clamps out-of-range scores', () => {
    assert.equal(normalizeVerdict({ ...valid, score: 250 }).verdict.score, 100)
    assert.equal(normalizeVerdict({ ...valid, score: -4 }).verdict.score, 0)
  })

  it('rejects non-objects, wrong pass type, and bad score type', () => {
    assert.equal(normalizeVerdict([]).ok, false)
    assert.equal(normalizeVerdict(null).ok, false)
    assert.equal(normalizeVerdict({ ...valid, pass: 'true' }).ok, false)
    assert.equal(normalizeVerdict({ ...valid, score: 'eighty' }).ok, false)
  })

  it('rejects non-array reasons and empty feedback', () => {
    assert.equal(normalizeVerdict({ ...valid, reasons: 'good' }).ok, false)
    assert.equal(normalizeVerdict({ ...valid, feedback: '' }).ok, false)
    assert.equal(normalizeVerdict({ ...valid, reasons: ['ok', 3] }).ok, false)
  })

  it('defaults missing lists and truncates long ones', () => {
    const outcome = normalizeVerdict({ pass: false, score: 10, feedback: 'f' })
    assert.equal(outcome.ok, true)
    assert.deepEqual(outcome.verdict.reasons, [])
    const many = normalizeVerdict({ ...valid, reasons: Array.from({ length: 20 }, (_, index) => `r${index}`) })
    assert.equal(many.verdict.reasons.length, 8)
  })
})

describe('judge: collectStream', () => {
  it('accumulates text, usage, and the terminal reason', async () => {
    const settled = await collectStream(
      streamOf([
        { type: 'text-delta', index: 0, text: 'abc' },
        { type: 'text-delta', index: 0, text: 'def' },
        { type: 'usage', usage: { inputTokens: 10, outputTokens: 3 } },
        { type: 'finish', reason: { kind: 'stop' } },
      ]),
    )
    assert.equal(settled.text, 'abcdef')
    assert.equal(settled.kind, 'stop')
    assert.deepEqual(settled.usage, { inputTokens: 10, outputTokens: 3 })
  })

  it('reports a missing finish chunk', async () => {
    const settled = await collectStream(streamOf([{ type: 'text-delta', index: 0, text: 'x' }]))
    assert.equal(settled.kind, 'no-finish')
  })
})

describe('judge: judgeSubmission outcomes', () => {
  const base = { level: LEVEL, answer: '我的答案', model: { provider: 'deepseek', model: 'deepseek-chat' } }

  it('returns the parsed verdict on a clean stop', async () => {
    const llm = fakeLlm()
    const settled = await judgeSubmission({ ...base, llm })
    assert.equal(settled.status, 'ok')
    assert.equal(settled.verdict.pass, true)
    assert.equal(settled.incomplete, false)
    assert.equal(llm.calls(), 1)
  })

  it('retries exactly once, then reports manual-review with raw output', async () => {
    const llm = fakeLlm({ mode: 'garbage' })
    const settled = await judgeSubmission({ ...base, llm })
    assert.equal(settled.status, 'manual-review')
    assert.equal(llm.calls(), 2)
    assert.ok(settled.raw.includes('抱歉'))
  })

  it('recovers when the repair turn returns valid JSON', async () => {
    const verdict = { pass: false, score: 40, reasons: ['太笼统'], misses: ['验收标准'], feedback: '写具体些' }
    const llm = fakeLlm({
      mode: 'garbage',
      onStream: (options, call) => {
        if (call === 1) return undefined
        return streamOf([
          { type: 'text-delta', index: 0, text: JSON.stringify(verdict) },
          { type: 'finish', reason: { kind: 'stop' } },
        ])
      },
    })
    const settled = await judgeSubmission({ ...base, llm })
    assert.equal(settled.status, 'ok')
    assert.equal(settled.repaired, true)
    assert.equal(settled.verdict.score, 40)
  })

  it('sends the repair turn with the previous output echoed back', async () => {
    const seen = []
    const llm = fakeLlm({
      mode: 'garbage',
      onStream: (options) => {
        seen.push(options.messages.length)
        return undefined
      },
    })
    await judgeSubmission({ ...base, llm })
    assert.deepEqual(seen, [1, 3])
  })

  it('maps a model error terminal chunk to a readable error', async () => {
    const settled = await judgeSubmission({ ...base, llm: fakeLlm({ mode: 'error' }) })
    assert.equal(settled.status, 'error')
    assert.equal(settled.error.code, 'rate-limited')
    assert.equal(settled.error.status, 429)
  })

  it('maps abort to cancelled', async () => {
    const settled = await judgeSubmission({ ...base, llm: fakeLlm({ mode: 'abort' }) })
    assert.equal(settled.status, 'cancelled')
  })

  it('propagates a pre-aborted caller signal into the adapter call', async () => {
    const llm = fakeLlm({
      onStream: (options) =>
        options.signal.aborted
          ? streamOf([{ type: 'finish', reason: { kind: 'aborted', failure: { code: 'aborted', message: '已取消' } } }])
          : undefined,
    })
    const controller = new AbortController()
    controller.abort()
    const settled = await judgeSubmission({ ...base, llm, signal: controller.signal })
    assert.equal(settled.status, 'cancelled')
    assert.equal(llm.lastOptions().signal.aborted, true)
  })

  it('flags max-tokens output as incomplete', async () => {
    const settled = await judgeSubmission({ ...base, llm: fakeLlm({ mode: 'maxtokens' }) })
    assert.equal(settled.status, 'manual-review')
    assert.equal(settled.incomplete, true)
  })

  it('treats a tool-call finish as manual review', async () => {
    const settled = await judgeSubmission({ ...base, llm: fakeLlm({ mode: 'toolcalls' }) })
    assert.equal(settled.status, 'manual-review')
  })

  it('reports a reasoning-only reply as a spent budget, not as missing JSON', async () => {
    // Regression: with a small maxTokens a reasoning model can emit reasoning
    // deltas only and zero text. The user needs that specific explanation.
    const llm = fakeLlm({
      onStream: () =>
        streamOf([
          { type: 'reasoning-delta', index: 0, text: '先看 rubric……' },
          { type: 'usage', usage: { inputTokens: 172, outputTokens: 900, reasoningTokens: 900 } },
          { type: 'finish', reason: { kind: 'max-tokens' } },
        ]),
    })
    const settled = await judgeSubmission({ ...base, llm, maxTokens: 900 })
    assert.equal(settled.status, 'manual-review')
    assert.equal(settled.incomplete, true)
    assert.ok(settled.error.message.includes('推理'), settled.error.message)
  })

  it('collects reasoning deltas separately from answer text', async () => {
    const settled = await collectStream(
      streamOf([
        { type: 'reasoning-delta', index: 0, text: '思考中' },
        { type: 'text-delta', index: 0, text: '正文' },
        { type: 'finish', reason: { kind: 'stop' } },
      ]),
    )
    assert.equal(settled.text, '正文')
    assert.equal(settled.reasoning, '思考中')
  })

  it('passes the configured token budget to the adapter', async () => {
    const llm = fakeLlm()
    await judgeSubmission({ ...base, llm, maxTokens: 3000 })
    assert.equal(llm.lastOptions().maxTokens, 3000)
  })

  it('surfaces a throwing adapter as an error, not an exception', async () => {
    const llm = fakeLlm({
      onStream: () => {
        throw new Error('adapter exploded')
      },
    })
    const settled = await judgeSubmission({ ...base, llm })
    assert.equal(settled.status, 'error')
    assert.equal(settled.error.code, 'stream-failed')
  })

  it('passes the configured route, system prompt, and temperature to the adapter', async () => {
    const llm = fakeLlm()
    await judgeSubmission({ ...base, llm })
    const options = llm.lastOptions()
    assert.equal(options.provider, 'deepseek')
    assert.equal(options.model, 'deepseek-chat')
    assert.equal(options.temperature, 0)
    assert.ok(options.system.includes('反作弊'))
    assert.ok(options.system.includes('维度 A'))
    assert.ok(options.messages[0].content[0].text.includes('我的答案'))
  })
})
