/**
 * Real-socket tests for the HTTP adapter.
 *
 * These bind an actual `node:http` server and speak to it over TCP, because the
 * bug this file guards against is invisible to hand-built request stubs: Node
 * emits `close` on an `IncomingMessage` once its body has been fully read, so a
 * disconnect listener attached before the body is consumed aborts every POST.
 *
 * @module @local/good-at-ai/tests/http.test
 */

import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import net from 'node:net'
import { describe, it } from 'node:test'

import { createHttpHandlers } from '../host/routes.js'

/**
 * Send a raw request through `node:http` so forbidden headers such as `Host`
 * can be set explicitly and the socket can be destroyed mid-flight.
 *
 * @param {string} base - server base URL.
 * @param {string} path - request path.
 * @param {object} options - `{ method, headers, body, destroyAfterMs }`.
 * @returns {Promise<{ status: number, body: string }>} the raw response.
 */
function raw(base, path, options = {}) {
  const url = new URL(path, base)
  const body = options.body === undefined ? undefined : Buffer.from(options.body)
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: url.hostname,
        port: url.port,
        path: url.pathname,
        method: options.method ?? 'GET',
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': String(body.byteLength) }),
          ...(options.headers ?? {}),
        },
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          text += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode, body: text }))
      },
    )
    req.on('error', (error) => {
      if (options.ignoreError === true) resolve({ status: 0, body: String(error.message) })
      else reject(error)
    })
    if (body !== undefined) req.write(body)
    req.end()
    if (options.destroyAfterMs !== undefined) {
      setTimeout(() => req.destroy(), options.destroyAfterMs)
    }
  })
}

/**
 * Start a server around the given handler table on an ephemeral port.
 *
 * @param {object} handlers - the handler table.
 * @returns {Promise<{ base: string, close: () => Promise<void> }>} the bound server.
 */
async function serve(handlers) {
  const http = createHttpHandlers({ handlers })
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname
    const name = path.endsWith('/submit') ? 'submit' : path.endsWith('/health') ? 'health' : 'catalog'
    void http[name](req, res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/** A handler table whose routes report what the adapter passed in. */
function probeHandlers(check) {
  return {
    health: async () => ({ status: 200, body: { ok: true, route: 'health' } }),
    catalog: async () => ({ status: 200, body: { ok: true } }),
    state: async () => ({ status: 200, body: { ok: true } }),
    reset: async () => ({ status: 200, body: { ok: true } }),
    submit: async (input) => {
      check(input)
      return { status: 200, body: { ok: true, route: 'submit' } }
    },
  }
}

describe('http: real socket semantics', () => {
  it('delivers a POST body and a live (non-aborted) signal to the handler', async () => {
    let observed
    const server = await serve(
      probeHandlers((input) => {
        observed = { aborted: input.signal ? input.signal.aborted : 'missing', answer: input.answer }
      }),
    )
    try {
      const response = await fetch(`${server.base}/api/good-at-ai/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'req-http-test1', levelId: 'prompt-role', answer: '真实的答案' }),
      })
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { ok: true, route: 'submit' })
      assert.notEqual(observed, undefined, 'the handler must run')
      assert.equal(observed.aborted, false, 'a normal request must not be marked cancelled')
      assert.equal(observed.answer, '真实的答案')
    } finally {
      await server.close()
    }
  })

  it('aborts the request when the client vanishes mid-body', async () => {
    let settled = false
    const server = await serve({
      health: async () => ({ status: 200, body: { ok: true } }),
      catalog: async () => ({ status: 200, body: { ok: true } }),
      state: async () => ({ status: 200, body: { ok: true } }),
      reset: async () => ({ status: 200, body: { ok: true } }),
      submit: async () => {
        settled = true
        return { status: 200, body: { ok: true } }
      },
    })
    try {
      const url = new URL(server.base)
      const socket = net.connect({ host: url.hostname, port: url.port }, () => {
        socket.write(
          [
            'POST /api/good-at-ai/submit HTTP/1.1',
            `Host: ${url.host}`,
            'Content-Type: application/json',
            'Content-Length: 4096',
            '',
            '{"requestId":"req-http-test2","answer":"partial',
          ].join('\r\n'),
        )
      })
      setTimeout(() => socket.destroy(), 120)
      // The read must settle on the disconnect rather than hang, and the
      // truncated body must never reach the judging handler.
      await new Promise((resolve) => setTimeout(resolve, 600))
      assert.equal(settled, false, 'a truncated body must not be judged')
    } finally {
      await server.close()
    }
  })

  it('does not abort a normal request merely because the stream ended', async () => {
    const observed = []
    const server = await serve(
      probeHandlers((input) => {
        observed.push(input.signal.aborted)
      }),
    )
    try {
      for (let index = 0; index < 3; index += 1) {
        const response = await raw(server.base, '/api/good-at-ai/submit', {
          method: 'POST',
          body: JSON.stringify({ requestId: `req-http-norm${index}`, answer: 'ok' }),
        })
        assert.equal(response.status, 200)
      }
      assert.deepEqual(observed, [false, false, false], 'no normal request may be reported as cancelled')
    } finally {
      await server.close()
    }
  })

  it('rejects an over-long body with 413 over a real socket', async () => {
    const server = await serve(probeHandlers(() => {}))
    try {
      const response = await fetch(`${server.base}/api/good-at-ai/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'req-http-test3', answer: 'x'.repeat(200 * 1024) }),
      })
      assert.equal(response.status, 413)
      assert.equal((await response.json()).error.code, 'body-too-large')
    } finally {
      await server.close()
    }
  })

  it('rejects malformed JSON with 400 and a non-loopback Host with 403', async () => {
    const server = await serve(probeHandlers(() => {}))
    try {
      const badJson = await raw(server.base, '/api/good-at-ai/submit', { method: 'POST', body: '{not json' })
      assert.equal(badJson.status, 400)
      assert.equal(JSON.parse(badJson.body).error.code, 'bad-json')

      // `fetch` refuses to set Host, so this one must go through node:http.
      const badHost = await raw(server.base, '/api/good-at-ai/health', { headers: { Host: 'evil.example.com' } })
      assert.equal(badHost.status, 403)
      assert.equal(JSON.parse(badHost.body).error.code, 'bad-host')
    } finally {
      await server.close()
    }
  })
})
