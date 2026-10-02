import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { LEVELS, LevelDataError, catalogPayload, getLevel, validateLevels } from '../levels/index.js'

/** A minimal valid level for mutation tests. */
function level(overrides = {}) {
  return {
    id: 'demo',
    order: 1,
    chapter: '章节',
    title: '标题',
    goal: '目标',
    brief: '说明',
    tips: ['提示'],
    requiresAI: true,
    submit: {
      fields: [{ name: 'prompt', label: '提示词', type: 'text', maxLength: 1000 }],
      artifactNote: '',
    },
    checks: [],
    rubric: [{ id: 'a', label: '维度 A', weight: 1 }],
    passScore: 70,
    ...overrides,
  }
}

describe('levels: shipped catalog', () => {
  it('exposes three ordered levels', () => {
    assert.equal(LEVELS.length, 3)
    assert.deepEqual(
      LEVELS.map((item) => item.order),
      [1, 2, 3],
    )
    assert.deepEqual(
      LEVELS.map((item) => item.id),
      ['prompt-role', 'file-scaffold', 'code-script'],
    )
  })

  it('gives every level a rubric summing to 1 and a sane pass score', () => {
    for (const item of LEVELS) {
      const sum = item.rubric.reduce((total, entry) => total + entry.weight, 0)
      assert.ok(Math.abs(sum - 1) < 0.011, `${item.id} rubric weight sum ${sum}`)
      assert.ok(item.passScore > 0 && item.passScore <= 100)
      assert.ok(item.submit.fields.length > 0)
    }
  })

  it('marks artifact levels with deterministic checks and level 1 with none', () => {
    assert.equal(getLevel('prompt-role').checks.length, 0)
    assert.ok(getLevel('file-scaffold').checks.length >= 3)
    assert.ok(getLevel('code-script').checks.length >= 3)
  })

  it('includes the hard "exactly three sections" count check for level 2', () => {
    const count = getLevel('file-scaffold').checks.find((check) => check.kind === 'count')
    assert.ok(count !== undefined, 'level 2 should carry a count check')
    assert.equal(count.min, 3)
    assert.equal(count.max, 3)
    assert.equal(count.match.regex, true)
  })

  it('loads every level from a Markdown file and keeps prose intact', () => {
    for (const item of LEVELS) {
      assert.ok(item.goal.length > 0, `${item.id} 缺少目标`)
      assert.ok(item.brief.length > 0, `${item.id} 缺少任务说明`)
      assert.ok(Array.isArray(item.tips), `${item.id} 的提示不是数组`)
    }
    // The body sections are prose, so they must contain paragraph breaks rather
    // than a single squashed line.
    assert.ok(getLevel('file-scaffold').brief.includes('\n\n'), '任务说明应保留段落换行')
  })

  it('resolves levels by id and returns undefined otherwise', () => {
    assert.equal(getLevel('file-scaffold').title.length > 0, true)
    assert.equal(getLevel('nope'), undefined)
    assert.equal(getLevel(42), undefined)
  })

  it('projects a catalog payload without internal check details', () => {
    const payload = catalogPayload()
    assert.equal(payload.length, 3)
    assert.equal(payload[0].checkSummary.length, 0)
    assert.ok(payload[1].checkSummary.length > 0)
    assert.ok(payload.every((item) => typeof item.brief === 'string' && Array.isArray(item.tips)))
  })
})

describe('levels: validation', () => {
  it('accepts a minimal valid level', () => {
    assert.equal(validateLevels([level()]).length, 1)
  })

  it('rejects missing required fields', () => {
    for (const field of ['id', 'chapter', 'title', 'goal', 'brief']) {
      const broken = { ...level(), [field]: '' }
      assert.throws(() => validateLevels([broken]), LevelDataError, `should reject empty ${field}`)
    }
  })

  it('rejects an empty catalog and non-object levels', () => {
    assert.throws(() => validateLevels([]), LevelDataError)
    assert.throws(() => validateLevels([null]), LevelDataError)
  })

  it('rejects duplicate ids and orders', () => {
    assert.throws(() => validateLevels([level(), level()]), LevelDataError)
    assert.throws(() => validateLevels([level(), level({ id: 'other' })]), LevelDataError)
  })

  it('rejects malformed ids, orders, and pass scores', () => {
    assert.throws(() => validateLevels([level({ id: 'Bad_Id' })]), LevelDataError)
    assert.throws(() => validateLevels([level({ order: 0 })]), LevelDataError)
    assert.throws(() => validateLevels([level({ passScore: 101 })]), LevelDataError)
    assert.throws(() => validateLevels([level({ passScore: 'high' })]), LevelDataError)
  })

  it('rejects rubrics that do not sum to 1 or have non-positive weights', () => {
    assert.throws(() => validateLevels([level({ rubric: [{ id: 'a', label: 'A', weight: 0.5 }] })]), LevelDataError)
    assert.throws(() => validateLevels([level({ rubric: [{ id: 'a', label: 'A', weight: 0 }] })]), LevelDataError)
    assert.throws(
      () =>
        validateLevels([
          level({
            rubric: [
              { id: 'a', label: 'A', weight: 0.5 },
              { id: 'a', label: 'B', weight: 0.5 },
            ],
          }),
        ]),
      LevelDataError,
    )
  })

  it('rejects malformed checks', () => {
    const cases = [
      [{ kind: 'nope', id: 'c', label: 'C' }],
      [{ kind: 'file-exists', id: 'c', label: 'C' }],
      [{ kind: 'file-matches', id: 'c', label: 'C', path: 'a.md' }],
      [{ kind: 'file-matches', id: 'c', label: 'C', path: 'a.md', mustInclude: [{}] }],
      [{ kind: 'dir-has', id: 'c', label: 'C', path: '.', min: 1 }],
      [{ kind: 'dir-has', id: 'c', label: 'C', glob: '**/*.md', min: 0 }],
      [{ kind: 'text-matches', id: 'c', label: 'C', path: '.', patterns: [] }],
    ]
    for (const checks of cases) {
      assert.throws(() => validateLevels([level({ checks })]), LevelDataError, JSON.stringify(checks))
    }
  })

  it('rejects a regex that JavaScript cannot compile', () => {
    // `(?s)` is an inline flag, which JS has no syntax for. It must fail at load
    // time instead of becoming a check that silently fails forever at runtime.
    const inlineFlag = [
      { kind: 'file-matches', id: 'c', label: 'C', path: 'a.md', mustInclude: [{ pattern: '(?s)def \\w+', regex: true }] },
    ]
    assert.throws(() => validateLevels([level({ checks: inlineFlag })]), (error) => {
      assert.ok(error instanceof LevelDataError)
      assert.ok(error.message.includes('正则无法编译'), error.message)
      return true
    })

    const unbalanced = [{ kind: 'text-matches', id: 'c', label: 'C', path: '.', patterns: [{ pattern: '([', regex: true }] }]
    assert.throws(() => validateLevels([level({ checks: unbalanced })]), LevelDataError)
  })

  it('accepts the supported workaround: flags field instead of inline flags', () => {
    const withFlags = [
      {
        kind: 'file-matches',
        id: 'c',
        label: 'C',
        path: 'a.md',
        mustInclude: [{ pattern: 'def \\w+\\s*\\([^)]*\\)\\s*:\\s*("""|#)', flags: 's', regex: true }],
      },
    ]
    assert.equal(validateLevels([level({ checks: withFlags })]).length, 1)
  })

  it('requires usable submit fields', () => {
    assert.throws(() => validateLevels([level({ submit: { fields: [] } })]), LevelDataError)
    assert.throws(
      () => validateLevels([level({ submit: { fields: [{ name: 'a', label: 'A', type: 'select', maxLength: 10 }] } })]),
      LevelDataError,
    )
    assert.throws(() => validateLevels([level({ submit: { fields: [{ name: 'a', label: 'A', type: 'text' }] } })]), LevelDataError)
  })

  it('fills the requiresAI default', () => {
    const withoutFlag = level()
    delete withoutFlag.requiresAI
    assert.equal(validateLevels([withoutFlag])[0].requiresAI, true)
  })

  it('sorts by order regardless of input order', () => {
    const validated = validateLevels([level({ id: 'b', order: 2 }), level({ id: 'a', order: 1 })])
    assert.deepEqual(
      validated.map((item) => item.id),
      ['a', 'b'],
    )
  })
})
