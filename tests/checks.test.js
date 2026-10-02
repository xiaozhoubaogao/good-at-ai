import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { MAX_FILES, createCheckContext, executeCheck, globToRegExp, matchText, runChecks } from '../host/checks.js'
import { resolveInside } from '../host/paths.js'
import { withTempDir } from './helpers.js'

/** Build a check context for one playground root. */
function contextFor(root) {
  return createCheckContext({ root, relativePath: (base, path) => resolveInside(base, path) })
}

/** Write a file inside a playground, creating parents. */
function write(root, relativePath, content) {
  const target = join(root, relativePath)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

describe('checks: globToRegExp', () => {
  it('matches recursive and single-segment patterns', () => {
    assert.ok(globToRegExp('**/*.md').test('notes/weekly.md'))
    assert.ok(globToRegExp('**/*.md').test('weekly.md'))
    assert.ok(globToRegExp('**/*.md').test('notes/2026/weekly.md'))
    assert.ok(!globToRegExp('**/*.md').test('notes/weekly.txt'))
    assert.ok(globToRegExp('notes/*.md').test('notes/a.md'))
    assert.ok(!globToRegExp('notes/*.md').test('notes/sub/a.md'))
    assert.ok(globToRegExp('*.py').test('wordcount.py'))
    assert.ok(!globToRegExp('*.py').test('scripts/wordcount.py'))
  })
})

describe('checks: matchText', () => {
  it('matches plain substrings and reports an excerpt', () => {
    const outcome = matchText('line one\n- [ ] do the thing\n', { pattern: '- [ ] do the thing' })
    assert.equal(outcome.matched, true)
    assert.ok(outcome.hit.includes('- [ ] do the thing'))
  })

  it('reports a missing substring', () => {
    assert.equal(matchText('abc', { pattern: 'zzz' }).matched, false)
  })

  it('matches regexes and rejects invalid ones', () => {
    assert.equal(matchText('# Title', { pattern: '^# \\S', flags: 'm', regex: true }).matched, true)
    assert.ok(matchText('x', { pattern: '([', regex: true }).error !== undefined)
  })
})

describe('checks: file-exists', () => {
  it('passes for a real file and fails for a missing one', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      write(root, 'notes/weekly.md', '# 周报\n')
      const context = contextFor(root)
      assert.equal(executeCheck({ id: 'a', label: 'A', kind: 'file-exists', path: 'notes/weekly.md' }, context).pass, true)
      assert.equal(executeCheck({ id: 'b', label: 'B', kind: 'file-exists', path: 'notes/missing.md' }, context).pass, false)
    })
  })

  it('fails closed for an escaping path', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      const outcome = executeCheck({ id: 'c', label: 'C', kind: 'file-exists', path: '../outside.txt' }, contextFor(root))
      assert.equal(outcome.pass, false)
      assert.ok(outcome.evidence.includes('..'))
    })
  })
})

describe('checks: file-matches', () => {
  it('requires every mustInclude and forbids mustExclude', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      write(root, 'notes/weekly.md', '# 周报\n\n## 完成\n- [ ] 修 bug\n')
      const context = contextFor(root)
      const ok = executeCheck(
        {
          id: 'm1',
          label: 'ok',
          kind: 'file-matches',
          path: 'notes/weekly.md',
          mustInclude: [
            { pattern: '^# \\S', flags: 'm', regex: true },
            { pattern: '^## \\S', flags: 'm', regex: true },
            { pattern: '^\\s*[-*] \\[[ xX]\\] \\S', flags: 'm', regex: true },
          ],
        },
        context,
      )
      assert.equal(ok.pass, true)
      assert.ok(ok.evidence.includes('满足全部要求'))

      const bad = executeCheck(
        { id: 'm2', label: 'bad', kind: 'file-matches', path: 'notes/weekly.md', mustInclude: [{ pattern: '# 不存在' }] },
        context,
      )
      assert.equal(bad.pass, false)
      assert.ok(bad.evidence.includes('缺少'))

      const excluded = executeCheck(
        { id: 'm3', label: 'excluded', kind: 'file-matches', path: 'notes/weekly.md', mustExclude: [{ pattern: '修 bug' }] },
        context,
      )
      assert.equal(excluded.pass, false)
      assert.ok(excluded.evidence.includes('不应出现'))
    })
  })

  it('fails when the file is missing', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      const outcome = executeCheck(
        { id: 'm4', label: 'missing', kind: 'file-matches', path: 'nope.md', mustInclude: [{ pattern: 'x' }] },
        contextFor(root),
      )
      assert.equal(outcome.pass, false)
    })
  })
})

describe('checks: dir-has', () => {
  it('counts recursive glob matches and respects min', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      write(root, 'notes/weekly.md', '# a')
      const context = contextFor(root)
      assert.equal(executeCheck({ id: 'd1', label: 'd1', kind: 'dir-has', path: 'notes', glob: '**/*.md', min: 1 }, context).pass, true)
      assert.equal(executeCheck({ id: 'd2', label: 'd2', kind: 'dir-has', path: 'notes', glob: '**/*.md', min: 3 }, context).pass, false)
      assert.equal(executeCheck({ id: 'd3', label: 'd3', kind: 'dir-has', path: 'missing-dir', glob: '**/*.md', min: 1 }, context).pass, false)
    })
  })

  it('ignores hidden directories', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      write(root, '.hidden/secret.md', '# hidden')
      const outcome = executeCheck({ id: 'd4', label: 'd4', kind: 'dir-has', path: '.', glob: '**/*.md', min: 1 }, contextFor(root))
      assert.equal(outcome.pass, false)
    })
  })
})

describe('checks: text-matches', () => {
  it('finds patterns across the tree and reports missing ones', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      write(root, 'scripts/wordcount.py', '#!/usr/bin/env python3\nfrom collections import Counter\n')
      const context = contextFor(root)
      const ok = executeCheck(
        {
          id: 't1',
          label: 't1',
          kind: 'text-matches',
          path: 'scripts',
          patterns: [{ pattern: 'Counter', regex: false }],
        },
        context,
      )
      assert.equal(ok.pass, true)
      const bad = executeCheck(
        { id: 't2', label: 't2', kind: 'text-matches', path: 'scripts', patterns: [{ pattern: 'never-present' }] },
        context,
      )
      assert.equal(bad.pass, false)
      assert.ok(bad.evidence.includes('未在任何产物文件中找到'))
    })
  })

  it('fails when the path holds no readable file', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      const outcome = executeCheck(
        { id: 't3', label: 't3', kind: 'text-matches', path: 'empty-dir', patterns: [{ pattern: 'x' }] },
        contextFor(root),
      )
      assert.equal(outcome.pass, false)
    })
  })
})

describe('checks: budget and failure containment', () => {
  it('enforces the per-file byte cap and marks truncation', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      write(root, 'big.txt', 'x'.repeat(300 * 1024))
      const outcome = executeCheck({ id: 'b1', label: 'b1', kind: 'file-matches', path: 'big.txt', mustInclude: [{ pattern: 'x' }] }, contextFor(root))
      assert.equal(outcome.pass, true)
      assert.ok(outcome.evidence.includes('仅检查了前'))
    })
  })

  it('fails closed on an unknown check kind', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      const outcome = executeCheck({ id: 'u1', label: 'u1', kind: 'nope' }, contextFor(root))
      assert.equal(outcome.pass, false)
      assert.ok(outcome.evidence.includes('未知的检查类型'))
    })
  })

  it('caps the number of files visited', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      for (let index = 0; index < MAX_FILES + 25; index += 1) {
        write(root, `many/f${String(index).padStart(4, '0')}.txt`, 'y')
      }
      const outcome = executeCheck({ id: 'c1', label: 'c1', kind: 'dir-has', path: 'many', glob: '**/*.txt', min: MAX_FILES + 50 }, contextFor(root))
      assert.equal(outcome.pass, false)
      assert.ok(outcome.evidence.includes('上限'))
    })
  })

  it('runChecks shares one budget and reports every check', async () => {
    await withTempDir((dir) => {
      const root = join(dir, 'pg')
      mkdirSync(root, { recursive: true })
      write(root, 'notes/weekly.md', '# 周报\n')
      const results = runChecks(
        [
          { id: 'one', label: 'one', kind: 'file-exists', path: 'notes/weekly.md' },
          { id: 'two', label: 'two', kind: 'file-exists', path: 'notes/missing.md' },
        ],
        { root, relativePath: (base, path) => resolveInside(base, path) },
      )
      assert.equal(results.length, 2)
      assert.deepEqual(
        results.map((item) => item.pass),
        [true, false],
      )
      assert.ok(results.every((item) => typeof item.evidence === 'string'))
    })
  })
})
