import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { createHttpHandlers, createHandlers, guardRequest, isLoopbackHost, parseHostHeader, readBody } from '../host/routes.js'
import { createStore } from '../host/store.js'
import { LEVELS } from '../levels/index.js'
import { resolveConfig } from '../index.js'
import { fakeLlm, makeHandlers, withTempDir } from './helpers.js'

/** Write a file under a directory, creating parents. */
function write(root, relativePath, content) {
  const target = join(root, relativePath)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

/** The passing verdict used by most tests. */
const PASS_VERDICT = { pass: true, score: 88, reasons: ['四要素齐全'], misses: [], feedback: '写得更具体些' }

describe('routes: host and origin guard', () => {
  it('parses Host headers including IPv6 and ports', () => {
    assert.deepEqual(parseHostHeader('127.0.0.1:19387'), { host: '127.0.0.1', port: '19387' })
    assert.deepEqual(parseHostHeader('localhost'), { host: 'localhost', port: '' })
    assert.deepEqual(parseHostHeader('[::1]:8080'), { host: '[::1]', port: '8080' })
    assert.equal(parseHostHeader(''), undefined)
    assert.equal(parseHostHeader(undefined), undefined)
  })

  it('accepts only loopback hosts', () => {
    assert.equal(isLoopbackHost('localhost:1234'), true)
    assert.equal(isLoopbackHost('127.0.0.1:1234'), true)
    assert.equal(isLoopbackHost('[::1]:1234'), true)
    assert.equal(isLoopbackHost('evil.example.com'), false)
    assert.equal(isLoopbackHost('192.168.1.5:19387'), false)
    assert.equal(isLoopbackHost(undefined), false)
  })

  it('rejects a non-loopback Host and a foreign Origin', () => {
    assert.equal(guardRequest({ host: 'evil.example.com' }).status, 403)
    assert.equal(guardRequest({ host: 'localhost:1', origin: 'https://evil.example.com' }).status, 403)
    assert.equal(guardRequest({ host: 'localhost:1', origin: 'not a url' }).status, 403)
    assert.equal(guardRequest({ host: 'localhost:1', origin: 'http://127.0.0.1:19387' }).ok, true)
    assert.equal(guardRequest({ host: 'localhost:1' }).ok, true)
    assert.equal(guardRequest({ host: 'localhost:1', origin: 'null' }).ok, true)
  })
})

describe('routes: health', () => {
  it('reports the auto-discovered model and the resolved playground', async () => {
    await withTempDir(async (dir) => {
      const { handlers, playground } = makeHandlers({ dir })
      const settled = await handlers.health()
      assert.equal(settled.status, 200)
      assert.equal(settled.body.ok, true)
      assert.equal(settled.body.judge.provider, 'deepseek')
      assert.equal(settled.body.judge.model, 'deepseek-chat')
      assert.equal(settled.body.judge.auto, true)
      assert.equal(settled.body.playground.root, playground.root)
      assert.equal(settled.body.playground.exists, true)
    })
  })

  it('records a provider without models as a diagnostic warning and moves on', async () => {
    await withTempDir(async (dir) => {
      const llm = fakeLlm({ modelProviders: ['openai-compatible'] })
      const { handlers } = makeHandlers({ dir, llm })
      const settled = await handlers.health()
      assert.equal(settled.body.judge.provider, 'openai-compatible')
      assert.ok(settled.body.warnings.some((warning) => warning.includes('deepseek')))
    })
  })

  it('honours an explicit provider and model from config', async () => {
    await withTempDir(async (dir) => {
      const { handlers } = makeHandlers({ dir, config: { judge: { provider: 'openai-compatible', model: 'gpt-x' } } })
      const settled = await handlers.health()
      assert.equal(settled.body.judge.provider, 'openai-compatible')
      assert.equal(settled.body.judge.model, 'gpt-x')
      assert.equal(settled.body.judge.auto, false)
    })
  })

  it('fails with 503 and an actionable hint when the configured provider does not exist', async () => {
    await withTempDir(async (dir) => {
      const { handlers } = makeHandlers({ dir, config: { judge: { provider: 'nope', model: '' } } })
      const settled = await handlers.health()
      assert.equal(settled.status, 503)
      assert.equal(settled.body.ok, false)
      assert.equal(settled.body.error.code, 'no-model')
      assert.ok(settled.body.error.hint.includes('deepseek'))
    })
  })

  it('fails with 503 when no provider reports any model', async () => {
    await withTempDir(async (dir) => {
      const { handlers } = makeHandlers({ dir, llm: fakeLlm({ modelProviders: [] }) })
      const settled = await handlers.health()
      assert.equal(settled.status, 503)
      assert.equal(settled.body.error.code, 'no-model')
    })
  })

  it('fails with 503 when listing providers throws', async () => {
    await withTempDir(async (dir) => {
      const llm = fakeLlm()
      llm.listProviders = () => {
        throw new Error('no adapter')
      }
      const { handlers } = makeHandlers({ dir, llm })
      const settled = await handlers.health()
      assert.equal(settled.status, 503)
      assert.equal(settled.body.error.hint, 'no adapter')
    })
  })
})

describe('routes: catalog and state', () => {
  it('returns levels, limits, and judge info', async () => {
    await withTempDir(async (dir) => {
      const { handlers } = makeHandlers({ dir })
      const settled = await handlers.catalog()
      assert.equal(settled.status, 200)
      assert.equal(settled.body.levels.length, LEVELS.length)
      assert.equal(settled.body.judge.model, 'deepseek-chat')
      assert.equal(settled.body.limits.enableReset, true)
      assert.equal(settled.body.playground.available, true)
    })
  })

  it('reports a playground that cannot be created without throwing', async () => {
    await withTempDir(async (dir) => {
      // A file where the playground directory should be makes mkdir fail.
      write(dir, 'playground', 'not a directory')
      const { handlers } = makeHandlers({ dir })
      const settled = await handlers.catalog()
      assert.equal(settled.status, 200)
      assert.equal(settled.body.playground.available, false)
      assert.equal(settled.body.playground.error.code, 'playground-unavailable')
    })
  })

  it('starts empty and reflects recorded attempts', async () => {
    await withTempDir(async (dir) => {
      const { handlers, store } = makeHandlers({ dir })
      const empty = await handlers.state()
      assert.equal(empty.body.summary.passed, 0)
      assert.equal(empty.body.levels.length, LEVELS.length)
      assert.ok(empty.body.levels.every((level) => level.attempts === 0))

      store.recordAttempt('prompt-role', { pass: true, score: 91, judgeModel: 'deepseek/deepseek-chat' })
      const filled = await handlers.state()
      const record = filled.body.levels.find((level) => level.id === 'prompt-role')
      assert.equal(record.passed, true)
      assert.equal(record.bestScore, 91)
      assert.equal(record.attempts, 1)
      assert.equal(filled.body.summary.passed, 1)
    })
  })
})

describe('routes: submit', () => {
  it('passes a model-only level', async () => {
    await withTempDir(async (dir) => {
      const { handlers } = makeHandlers({ dir })
      const settled = await handlers.submit({ requestId: 'req-00000001', levelId: 'prompt-role', answer: '你是我的项目助理……' })
      assert.equal(settled.status, 200)
      assert.equal(settled.body.pass, true)
      assert.equal(settled.body.score, 88)
      assert.equal(settled.body.recorded, true)
      assert.equal(settled.body.judge.model, 'deepseek-chat')
      assert.equal(settled.body.usage.outputTokens, 90)
    })
  })

  it('replays the same requestId instead of calling the model again', async () => {
    await withTempDir(async (dir) => {
      const llm = fakeLlm()
      const { handlers } = makeHandlers({ dir, llm })
      await handlers.submit({ requestId: 'req-00000002', levelId: 'prompt-role', answer: 'x' })
      const second = await handlers.submit({ requestId: 'req-00000002', levelId: 'prompt-role', answer: 'x' })
      assert.equal(second.body.replayed, true)
      assert.equal(llm.calls(), 1)
    })
  })

  it('fails deterministic checks closed and overrides a passing model verdict', async () => {
    await withTempDir(async (dir) => {
      const { handlers, store } = makeHandlers({ dir })
      const settled = await handlers.submit({ requestId: 'req-00000003', levelId: 'file-scaffold', answer: '请创建 weekly.md' })
      assert.equal(settled.status, 200)
      assert.equal(settled.body.pass, false)
      assert.equal(settled.body.judgeOverridden, true)
      assert.equal(settled.body.recorded, false)
      assert.ok(settled.body.checks.some((check) => check.pass === false))
      assert.equal(store.getLevel('file-scaffold'), null)
    })
  })

  it('records a pass when checks and the model agree', async () => {
    await withTempDir(async (dir) => {
      const { handlers, playground, store } = makeHandlers({ dir })
      write(playground.root, 'notes/weekly.md', '# 周报\n\n## 完成\n- [ ] 修 bug\n\n## 风险\n- [ ] 依赖第三方接口\n\n## 计划\n- [ ] 上线灰度\n')
      const settled = await handlers.submit({ requestId: 'req-00000004', levelId: 'file-scaffold', answer: '请创建 weekly.md' })
      assert.equal(settled.body.pass, true)
      assert.equal(settled.body.recorded, true)
      assert.ok(settled.body.checks.every((check) => check.pass === true))
      assert.equal(store.getLevel('file-scaffold').passed, true)
    })
  })

  it('rejects a malformed requestId and an unknown level', async () => {
    await withTempDir(async (dir) => {
      const { handlers } = makeHandlers({ dir })
      assert.equal((await handlers.submit({ requestId: 'short', levelId: 'prompt-role', answer: 'x' })).status, 400)
      assert.equal((await handlers.submit({ requestId: 'req-00000005', levelId: 'nope', answer: 'x' })).status, 404)
    })
  })

  it('rejects an empty answer and an over-long answer', async () => {
    await withTempDir(async (dir) => {
      const { handlers } = makeHandlers({ dir, config: { maxAnswerChars: 200 } })
      assert.equal((await handlers.submit({ requestId: 'req-00000006', levelId: 'prompt-role', answer: '   ' })).status, 400)
      const big = await handlers.submit({ requestId: 'req-00000007', levelId: 'prompt-role', answer: 'x'.repeat(300) })
      assert.equal(big.status, 413)
      assert.equal(big.body.error.code, 'answer-too-large')
    })
  })

  it('returns 503 without recording when no model is available', async () => {
    await withTempDir(async (dir) => {
      const { handlers, store } = makeHandlers({ dir, llm: fakeLlm({ modelProviders: [] }) })
      const settled = await handlers.submit({ requestId: 'req-00000008', levelId: 'prompt-role', answer: 'x' })
      assert.equal(settled.status, 503)
      assert.equal(settled.body.error.code, 'no-model')
      assert.equal(store.getLevel('prompt-role'), null)
    })
  })

  it('maps a model error to 500 without recording', async () => {
    await withTempDir(async (dir) => {
      const { handlers, store } = makeHandlers({ dir, llm: fakeLlm({ mode: 'error' }) })
      const settled = await handlers.submit({ requestId: 'req-00000009', levelId: 'prompt-role', answer: 'x' })
      assert.equal(settled.status, 500)
      assert.equal(settled.body.error.code, 'rate-limited')
      assert.equal(store.getLevel('prompt-role'), null)
    })
  })

  it('reports manual review for unusable model output after one repair', async () => {
    await withTempDir(async (dir) => {
      const llm = fakeLlm({ mode: 'garbage' })
      const { handlers, store } = makeHandlers({ dir, llm })
      const settled = await handlers.submit({ requestId: 'req-00000010', levelId: 'prompt-role', answer: 'x' })
      assert.equal(settled.status, 200)
      assert.equal(settled.body.status, 'manual-review')
      assert.equal(settled.body.pass, null)
      assert.equal(settled.body.manualReview, true)
      assert.equal(llm.calls(), 2)
      assert.equal(store.getLevel('prompt-role'), null)
    })
  })

  it('treats a cancelled judgement as untracked', async () => {
    await withTempDir(async (dir) => {
      const { handlers, store } = makeHandlers({ dir, llm: fakeLlm({ mode: 'abort' }) })
      const settled = await handlers.submit({ requestId: 'req-00000011', levelId: 'prompt-role', answer: 'x' })
      assert.equal(settled.status, 200)
      assert.equal(settled.body.cancelled, true)
      assert.equal(store.getLevel('prompt-role'), null)
    })
  })

  it('rejects a concurrent submission for the same level with 409', async () => {
    await withTempDir(async (dir) => {
      let release
      const gate = new Promise((resolve) => {
        release = resolve
      })
      let started
      const startedPromise = new Promise((resolve) => {
        started = resolve
      })
      const llm = fakeLlm({
        onStream: () => {
          started()
          return (async function* generate() {
            await gate
            yield { type: 'text-delta', index: 0, text: JSON.stringify(PASS_VERDICT) }
            yield { type: 'finish', reason: { kind: 'stop' } }
          })()
        },
      })
      const { handlers } = makeHandlers({ dir, llm })
      const first = handlers.submit({ requestId: 'req-00000012', levelId: 'prompt-role', answer: 'x' })
      await startedPromise
      const second = await handlers.submit({ requestId: 'req-00000013', levelId: 'prompt-role', answer: 'x' })
      assert.equal(second.status, 409)
      assert.equal(second.body.error.code, 'busy')
      release()
      assert.equal((await first).body.pass, true)
    })
  })

  it('allows the same level again after a settle', async () => {
    await withTempDir(async (dir) => {
      const { handlers } = makeHandlers({ dir })
      await handlers.submit({ requestId: 'req-00000014', levelId: 'prompt-role', answer: 'x' })
      const second = await handlers.submit({ requestId: 'req-00000015', levelId: 'prompt-role', answer: 'x' })
      assert.equal(second.status, 200)
      assert.equal(second.body.replayed, undefined)
    })
  })
})

describe('routes: reset', () => {
  it('clears progress and honours the config switch', async () => {
    await withTempDir(async (dir) => {
      const { handlers, store } = makeHandlers({ dir })
      store.recordAttempt('prompt-role', { pass: true, score: 80, judgeModel: 'x/y' })
      const cleared = await handlers.reset()
      assert.equal(cleared.status, 200)
      assert.equal(store.getLevel('prompt-role'), null)

      const disabled = makeHandlers({ dir, config: { enableReset: false } })
      assert.equal((await disabled.handlers.reset()).status, 404)
    })
  })
})

describe('routes: store durability', () => {
  it('writes the progress file atomically and reloads it', async () => {
    await withTempDir(async (dir) => {
      const store = createStore({ dir: join(dir, 'state') })
      store.recordAttempt('prompt-role', { pass: true, score: 77, judgeModel: 'x/y' })
      const file = store.filePath
      assert.ok(statSync(file).isFile())
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      assert.equal(parsed.version, 1)
      assert.equal(parsed.levels['prompt-role'].bestScore, 77)
      assert.equal(parsed.levels['prompt-role'].attempts, 1)
      assert.equal(readdirSync(join(dir, 'state')).filter((name) => name.includes('.tmp-')).length, 0)

      const reopened = createStore({ dir: join(dir, 'state') })
      assert.equal(reopened.getLevel('prompt-role').passed, true)
    })
  })

  it('quarantines a corrupt progress file and keeps working', async () => {
    await withTempDir((dir) => {
      write(dir, 'state/progress.json', '{ this is not json')
      const store = createStore({ dir: join(dir, 'state') })
      assert.equal(store.getLevel('prompt-role'), null)
      assert.ok(store.recovery() !== null)
      assert.ok(readdirSync(join(dir, 'state')).some((name) => name.includes('.corrupt-')))
      store.recordAttempt('prompt-role', { pass: true, score: 60, judgeModel: 'x/y' })
      assert.equal(store.getLevel('prompt-role').passed, true)
    })
  })

  it('takes the best score but never forgets a pass', async () => {
    await withTempDir((dir) => {
      const store = createStore({ dir: join(dir, 'state') })
      store.recordAttempt('prompt-role', { pass: true, score: 90, judgeModel: 'x/y' })
      store.recordAttempt('prompt-role', { pass: false, score: 20, judgeModel: 'x/y' })
      const record = store.getLevel('prompt-role')
      assert.equal(record.passed, true)
      assert.equal(record.bestScore, 90)
      assert.equal(record.attempts, 2)
    })
  })

  it('ignores malformed persisted records', async () => {
    await withTempDir((dir) => {
      write(dir, 'state/progress.json', JSON.stringify({ version: 1, levels: { good: { passed: true }, bad: 'nope' } }))
      const store = createStore({ dir: join(dir, 'state') })
      assert.ok(store.snapshot())
      assert.equal(store.getLevel('bad'), null)
      assert.equal(store.getLevel('good').passed, true)
    })
  })

  it('resolves DSH home from the environment', async () => {
    await withTempDir((dir) => {
      const store = createStore({ env: { DSH_HOME: dir }, home: dir })
      assert.equal(store.dir, join(dir, 'good-at-ai'))
    })
  })
})

describe('routes: http adapter', () => {
  it('reads a bounded body and rejects an over-large one', async () => {
    const makeReq = (chunks, contentLength) => {
      const req = new EventEmitter()
      req.headers = contentLength === undefined ? {} : { 'content-length': String(contentLength) }
      req.destroy = () => {}
      setImmediate(() => {
        for (const chunk of chunks) req.emit('data', Buffer.from(chunk))
        req.emit('end')
      })
      return req
    }
    const ok = await readBody(makeReq(['{"a":1}']))
    assert.deepEqual(ok, { ok: true, text: '{"a":1}' })

    const declared = await readBody(makeReq([], 999999))
    assert.equal(declared.ok, false)
    assert.equal(declared.status, 413)

    const streamed = await readBody(makeReq(['x'.repeat(64)]), 16)
    assert.equal(streamed.ok, false)
    assert.equal(streamed.code, 'body-too-large')
  })

  it('does not abort the handler when the request stream simply ended', async () => {
    // Regression: Node emits 'close' on the request after its body is fully
    // read, so listening for disconnect before consuming the body aborted every
    // POST that should have been judged.
    await withTempDir(async (dir) => {
      const real = makeHandlers({ dir })
      let observed = null
      const handlers = {
        ...real.handlers,
        submit: async (input) => {
          observed = input.signal ? input.signal.aborted : 'no-signal'
          return { status: 200, body: { ok: true, status: 'ok' } }
        },
      }
      const http = createHttpHandlers({ handlers })

      const req = new EventEmitter()
      req.headers = { host: 'localhost:19387' }
      req.destroy = () => {}
      const res = {
        writableEnded: false,
        setHeader() {},
        end() {
          this.writableEnded = true
        },
        statusCode: 0,
      }
      setImmediate(() => {
        req.emit('data', Buffer.from(JSON.stringify({ requestId: 'req-abc12345', levelId: 'prompt-role', answer: 'hi' })))
        req.emit('end')
      })
      await http.submit(req, res)
      assert.equal(observed, false, 'handler must receive a live signal after a normal request body')
    })
  })

  it('answers with JSON, status codes, and no-store', async () => {
    await withTempDir(async (dir) => {
      const { handlers } = makeHandlers({ dir })
      const http = createHttpHandlers({ handlers })

      /** Minimal IncomingMessage stub: an event emitter with headers. */
      function request(headers, body) {
        const req = new EventEmitter()
        req.headers = headers
        req.destroy = () => {}
        setImmediate(() => {
          if (body !== undefined) req.emit('data', Buffer.from(body))
          req.emit('end')
        })
        return req
      }

      /** Minimal ServerResponse stub capturing status, headers, and payload. */
      function response() {
        const state = { status: 0, headers: {}, payload: null, ended: false }
        return {
          state,
          writableEnded: false,
          setHeader(key, value) {
            state.headers[key] = value
          },
          end(payload) {
            state.payload = payload
            state.ended = true
          },
          set statusCode(value) {
            state.status = value
          },
          get statusCode() {
            return state.status
          },
        }
      }

      const call = async (name, headers = { host: 'localhost:19387' }, body) => {
        const req = request(headers, body)
        const res = response()
        await http[name](req, res)
        return { status: res.state.status, headers: res.state.headers, body: JSON.parse(res.state.payload) }
      }

      const catalog = await call('catalog')
      assert.equal(catalog.status, 200)
      assert.equal(catalog.headers['Content-Type'], 'application/json; charset=utf-8')
      assert.equal(catalog.headers['Cache-Control'], 'no-store')
      assert.equal(catalog.body.levels.length, LEVELS.length)

      const forbidden = await call('catalog', { host: 'evil.example.com' })
      assert.equal(forbidden.status, 403)
      assert.equal(forbidden.body.error.code, 'bad-host')

      const wrongOrigin = await call('catalog', { host: 'localhost', origin: 'https://evil.example.com' })
      assert.equal(wrongOrigin.status, 403)
      assert.equal(wrongOrigin.body.error.code, 'bad-origin')

      const badJson = await call('submit', { host: 'localhost', 'content-type': 'application/json' }, '{oops')
      assert.equal(badJson.status, 400)
      assert.equal(badJson.body.error.code, 'bad-json')

      const notAnObject = await call('submit', { host: 'localhost' }, '[]')
      assert.equal(notAnObject.status, 400)

      const submitted = await call(
        'submit',
        { host: 'localhost' },
        JSON.stringify({ requestId: 'req-http-00001', levelId: 'prompt-role', answer: '一个足够长的答案' }),
      )
      assert.equal(submitted.status, 200)
      assert.equal(submitted.body.pass, true)
    })
  })
})

describe('routes: config resolution', () => {
  it('clamps and defaults every knob', () => {
    const config = resolveConfig({
      playgroundDir: '  D:\\custom  ',
      judge: { provider: ' deepseek ', model: 'deepseek-chat' },
      enableReset: false,
      requestTimeoutMs: 1,
      maxAnswerChars: 9999999,
      allowDeterministicFallback: true,
    })
    assert.equal(config.playgroundDir, 'D:\\custom')
    assert.equal(config.judge.provider, 'deepseek')
    assert.equal(config.judge.model, 'deepseek-chat')
    assert.equal(config.enableReset, false)
    assert.equal(config.requestTimeoutMs, 5000)
    assert.equal(config.maxAnswerChars, 20000)
    assert.equal(config.allowDeterministicFallback, true)
  })

  it('survives malformed config without throwing', () => {
    assert.equal(resolveConfig(null).enableReset, true)
    assert.equal(resolveConfig('nonsense').judge.provider, '')
    assert.equal(resolveConfig({ judge: 'nope', playgroundDir: 42 }).playgroundDir, '')
    assert.equal(resolveConfig({ requestTimeoutMs: 'abc' }).requestTimeoutMs, 90000)
  })

  it('keeps failing closed when the deterministic fallback is disabled', async () => {
    await withTempDir(async (dir) => {
      const { handlers, playground, store } = makeHandlers({ dir, llm: fakeLlm({ mode: 'error' }) })
      write(playground.root, 'notes/weekly.md', '# 周报\n\n## 完成\n- [ ] 修 bug\n\n## 风险\n- [ ] 依赖第三方接口\n\n## 计划\n- [ ] 上线灰度\n')
      const settled = await handlers.submit({ requestId: 'req-00000016', levelId: 'file-scaffold', answer: 'x' })
      assert.equal(settled.status, 500)
      assert.equal(store.getLevel('file-scaffold'), null)
    })
  })

  it('passes on evidence alone when the fallback is enabled and every check passes', async () => {
    await withTempDir(async (dir) => {
      const { handlers, playground, store } = makeHandlers({
        dir,
        config: { allowDeterministicFallback: true },
        llm: fakeLlm({ mode: 'error' }),
      })
      write(playground.root, 'notes/weekly.md', '# 周报\n\n## 完成\n- [ ] 修 bug\n\n## 风险\n- [ ] 依赖第三方接口\n\n## 计划\n- [ ] 上线灰度\n')
      const settled = await handlers.submit({ requestId: 'req-00000017', levelId: 'file-scaffold', answer: 'x' })
      assert.equal(settled.status, 200)
      assert.equal(settled.body.pass, true)
      assert.equal(settled.body.fallbackJudge, true)
      assert.equal(settled.body.recorded, true)
      assert.ok(settled.body.reasons[0].includes('确定性检查全部通过'))
      assert.equal(store.getLevel('file-scaffold').passed, true)
    })
  })

  it('never falls back when a deterministic check fails', async () => {
    await withTempDir(async (dir) => {
      const { handlers, store } = makeHandlers({
        dir,
        config: { allowDeterministicFallback: true },
        llm: fakeLlm({ mode: 'error' }),
      })
      const settled = await handlers.submit({ requestId: 'req-00000018', levelId: 'file-scaffold', answer: 'x' })
      assert.equal(settled.status, 500)
      assert.equal(store.getLevel('file-scaffold'), null)
    })
  })
})
