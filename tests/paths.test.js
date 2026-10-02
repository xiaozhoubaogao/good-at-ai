import assert from 'node:assert/strict'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { PathError, isInside, realpathDeep, resolveInside, resolvePlaygroundRoot } from '../host/paths.js'
import { withTempDir } from './helpers.js'

describe('paths: resolveInside', () => {
  it('accepts a plain relative path inside the root', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(join(root, 'notes'), { recursive: true })
      writeFileSync(join(root, 'notes', 'a.md'), '# hi', 'utf8')
      const resolved = resolveInside(root, 'notes/a.md')
      assert.equal(resolved, realpathDeep(join(root, 'notes', 'a.md')))
    })
  })

  it('accepts a path whose tail does not exist yet', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      const resolved = resolveInside(root, 'notes/new/deep.md')
      assert.ok(isInside(realpathDeep(root), resolved))
      assert.ok(resolved.endsWith('deep.md'))
    })
  })

  it('rejects parent traversal', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      assert.throws(() => resolveInside(root, '../secrets.txt'), (error) => {
        assert.ok(error instanceof PathError)
        assert.equal(error.code, 'path-outside-playground')
        return true
      })
      assert.throws(() => resolveInside(root, 'notes/../../x'), PathError)
      assert.throws(() => resolveInside(root, '..\\windows'), PathError)
    })
  })

  it('rejects absolute, drive-letter, and UNC paths', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      for (const candidate of ['/etc/passwd', 'C:\\Windows\\win.ini', 'c:/temp/x', '\\\\server\\share\\x', '//server/share']) {
        assert.throws(() => resolveInside(root, candidate), PathError, `should reject ${candidate}`)
      }
    })
  })

  it('rejects NUL bytes and empty input', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      assert.throws(() => resolveInside(root, 'a\0b'), PathError)
      assert.throws(() => resolveInside(root, '   '), PathError)
      assert.throws(() => resolveInside(root, 42), PathError)
      assert.equal(resolveInside(root, '', { allowEmpty: true }), realpathDeep(root))
    })
  })

  it('rejects a symlink that escapes the playground', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      const outside = join(dir, 'outside')
      mkdirSync(outside, { recursive: true })
      writeFileSync(join(outside, 'secret.txt'), 'top secret', 'utf8')
      try {
        symlinkSync(outside, join(root, 'link'), 'dir')
      } catch {
        return // Symlink creation needs privileges on some Windows setups.
      }
      assert.throws(() => resolveInside(root, 'link/secret.txt'), (error) => {
        assert.ok(error instanceof PathError)
        assert.equal(error.code, 'path-outside-playground')
        return true
      })
    })
  })

  it('treats case differences correctly for the platform', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      // A differently-cased path must still be confined (Windows/macOS) or rejected (Linux).
      const resolved = resolveInside(root, 'Notes/A.md')
      assert.ok(isInside(realpathDeep(root), resolved))
    })
  })
})

describe('paths: isInside', () => {
  it('accepts the container itself and rejects siblings', () => {
    assert.equal(isInside('C:\\a\\b', 'C:\\a\\b'), true)
    assert.equal(isInside('C:\\a\\b', 'C:\\a\\b\\c'), true)
    assert.equal(isInside('C:\\a\\b', 'C:\\a\\bc'), false)
    assert.equal(isInside('C:\\a\\b', 'C:\\a'), false)
  })
})

describe('paths: resolvePlaygroundRoot', () => {
  it('prefers explicit config', () => {
    const result = resolvePlaygroundRoot({ playgroundDir: 'D:\\custom\\pg' }, { cwd: 'C:\\cwd', pluginDir: 'C:\\plugin' })
    assert.equal(result.source, 'config')
    assert.equal(result.root, 'D:\\custom\\pg')
  })

  it('uses the environment variable when config is empty', () => {
    const result = resolvePlaygroundRoot({}, { cwd: 'C:\\cwd', pluginDir: 'C:\\plugin', env: { GOOD_AT_AI_PLAYGROUND: 'D:\\env\\pg' } })
    assert.equal(result.source, 'env')
    assert.equal(result.root, 'D:\\env\\pg')
  })

  it('falls back to the plugin directory before cwd', () => {
    const result = resolvePlaygroundRoot({}, { cwd: 'C:\\cwd', pluginDir: 'D:\\gitee\\Good_At_AI', env: {} })
    assert.equal(result.source, 'plugin-dir')
    assert.equal(result.root, join('D:\\gitee\\Good_At_AI', 'good-at-ai-playground'))
    assert.equal(result.candidates.length, 2)
  })

  it('falls back to cwd when there is no plugin directory', () => {
    const result = resolvePlaygroundRoot({}, { cwd: 'C:\\cwd', env: {} })
    assert.equal(result.source, 'cwd')
    assert.equal(result.root, join('C:\\cwd', 'good-at-ai-playground'))
  })
})
