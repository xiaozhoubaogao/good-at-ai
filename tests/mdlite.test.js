import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  LevelFileError,
  loadLevelFiles,
  parseAssertion,
  parseBodySections,
  parseLevelFile,
  splitFrontmatter,
  toLevel,
} from '../host/mdlite.js'
import { withTempDir } from './helpers.js'

/** A minimal valid level file used as the base for mutations. */
const MINIMAL = [
  '---',
  'id: demo',
  'order: 1',
  'chapter: 章节',
  'title: 标题',
  'passScore: 70',
  'submit:',
  '  fields:',
  '    - name: prompt',
  '      label: 提示词',
  '      type: text',
  '      maxLength: 1000',
  'checks: []',
  'rubric:',
  '  - id: a',
  '    label: 维度 A',
  '    weight: 1',
  '---',
  '',
  '## 目标',
  '',
  '目标文本',
  '',
  '## 任务说明',
  '',
  '任务文本',
  '',
  '## 提示',
  '',
  '- 提示一',
  '- 提示二',
].join('\n')

describe('mdlite: splitFrontmatter', () => {
  it('splits frontmatter from the body with line offsets', () => {
    const split = splitFrontmatter(MINIMAL, 'demo.md')
    assert.ok(split.yaml.startsWith('id: demo'))
    assert.ok(split.body.includes('## 目标'))
    assert.equal(split.yamlStartLine, 2)
    assert.ok(split.bodyStartLine > split.yamlStartLine)
  })

  it('rejects a file without frontmatter', () => {
    assert.throws(() => splitFrontmatter('## 目标\n文本', 'x.md'), (error) => {
      assert.ok(error instanceof LevelFileError)
      assert.ok(error.reason.includes('frontmatter'))
      return true
    })
  })

  it('rejects an unclosed frontmatter block', () => {
    assert.throws(() => splitFrontmatter('---\nid: a\n\n## 目标\n', 'x.md'), (error) => {
      assert.ok(error.reason.includes('没有闭合'))
      return true
    })
  })
})

describe('mdlite: parseAssertion', () => {
  it('parses plain text, regex, negation, and flag suffixes', () => {
    assert.deepEqual(parseAssertion('hello', 'x.md', 1), { pattern: 'hello', regex: false, flags: '', negate: false })
    assert.deepEqual(parseAssertion('re:^# \\S @m', 'x.md', 1), { pattern: '^# \\S', regex: true, flags: 'm', negate: false })
    assert.deepEqual(parseAssertion('!TODO', 'x.md', 1), { pattern: 'TODO', regex: false, flags: '', negate: true })
    assert.deepEqual(parseAssertion('!re:FIXME @i', 'x.md', 1), { pattern: 'FIXME', regex: true, flags: 'i', negate: true })
  })

  it('rejects nonsensical assertions', () => {
    assert.throws(() => parseAssertion('', 'x.md', 1), LevelFileError)
    assert.throws(() => parseAssertion('!', 'x.md', 1), LevelFileError)
    assert.throws(() => parseAssertion('re:', 'x.md', 1), LevelFileError)
    assert.throws(() => parseAssertion(42, 'x.md', 1), LevelFileError)
    assert.throws(() => parseAssertion('re:x @q', 'x.md', 1), (error) => {
      assert.ok(error.reason.includes('@q'))
      return true
    })
  })

  it('strips the negation marker from plain text', () => {
    assert.equal(parseAssertion('!weekly', 'x.md', 1).pattern, 'weekly')
  })
})

describe('mdlite: parseBodySections', () => {
  it('splits sections and ignores headings inside fenced code', () => {
    const sections = parseBodySections(['## 目标', '目标', '', '## 提示', '```md', '## 这不是标题', '```', '- 一条'].join('\n'))
    assert.deepEqual(sections.get('目标'), ['目标', ''])
    assert.ok(sections.get('提示').some((line) => line.includes('## 这不是标题')))
    assert.ok(sections.get('提示').some((line) => line.includes('- 一条')))
  })
})

describe('mdlite: toLevel', () => {
  it('maps frontmatter and body into a level object', () => {
    const level = parseLevelFile(MINIMAL, 'demo.md')
    assert.equal(level.id, 'demo')
    assert.equal(level.goal, '目标文本')
    assert.equal(level.brief, '任务文本')
    assert.deepEqual(level.tips, ['提示一', '提示二'])
    assert.deepEqual(level.checks, [])
    assert.equal(level.rubric[0].weight, 1)
  })

  it('translates assertions inside checks and folds negations', () => {
    const withChecks = MINIMAL.replace(
      'checks: []',
      [
        'checks:',
        '  - id: c1',
        '    label: C1',
        '    kind: file-matches',
        '    path: notes/a.md',
        '    mustInclude:',
        "      - 're:^# \\S @m'",
        "      - '!TODO'",
        '    mustExclude:',
        "      - '!re:FIXME'",
      ].join('\n'),
    )
    const level = parseLevelFile(withChecks, 'demo.md')
    const check = level.checks[0]
    // Authored `mustExclude` entries keep their order and come first; `!`-prefixed
    // mustInclude entries are appended after them.
    assert.deepEqual(check.mustInclude, [{ pattern: '^# \\S', regex: true, flags: 'm', negate: false }])
    assert.deepEqual(check.mustExclude, [
      { pattern: 'FIXME', regex: true, flags: '', negate: true },
      { pattern: 'TODO', regex: false, flags: '', negate: true },
    ])
  })

  it('translates a count match assertion', () => {
    const withCount = MINIMAL.replace(
      'checks: []',
      ['checks:', '  - id: c2', '    label: C2', '    kind: count', '    path: notes/a.md', "    match: 're:^## \\S @m'", '    min: 3', '    max: 3'].join('\n'),
    )
    const level = parseLevelFile(withCount, 'demo.md')
    assert.deepEqual(level.checks[0].match, { pattern: '^## \\S', regex: true, flags: 'm', negate: false })
    assert.equal(level.checks[0].min, 3)
  })

  it('rejects a missing goal section and a missing submit block', () => {
    const noGoal = MINIMAL.replace('## 目标', '## 别的')
    assert.throws(() => parseLevelFile(noGoal, 'demo.md'), (error) => {
      assert.ok(error.reason.includes('## 目标'))
      return true
    })
    const noSubmit = MINIMAL.replace(/^submit:[\s\S]*?^checks:/m, 'checks:')
    assert.throws(() => parseLevelFile(noSubmit, 'demo.md'), (error) => {
      assert.ok(error.reason.includes('submit'))
      return true
    })
  })

  it('rejects a non-list checks value', () => {
    assert.throws(() => parseLevelFile(MINIMAL.replace('checks: []', 'checks: nope'), 'demo.md'), (error) => {
      assert.ok(error.reason.includes('checks'))
      return true
    })
  })

  it('defaults requiresAI to true and honours an explicit value', () => {
    assert.equal(parseLevelFile(MINIMAL, 'demo.md').requiresAI, true)
    assert.equal(parseLevelFile(MINIMAL.replace('passScore: 70', 'passScore: 70\nrequiresAI: false'), 'demo.md').requiresAI, false)
  })
})

describe('mdlite: toLevel error context', () => {
  it('reports the file and a usable reason for a bad assertion', () => {
    const sections = parseBodySections('## 目标\nG\n\n## 任务说明\nB\n')
    assert.throws(
      () =>
        toLevel(
          {
            id: 'x',
            checks: [{ id: 'c', label: 'C', kind: 'file-matches', path: 'a', mustInclude: [42] }],
            submit: { fields: [] },
            rubric: [],
          },
          sections,
          'bad.md',
        ),
      (error) => {
        assert.ok(error instanceof LevelFileError)
        assert.equal(error.displayPath, 'bad.md')
        return true
      },
    )
  })
})

describe('mdlite: loadLevelFiles', () => {
  it('loads every .md file sorted, and skips FORMAT.md', async () => {
    await withTempDir((dir) => {
      writeFileSync(join(dir, '02-b.md'), MINIMAL.replace('id: demo', 'id: b').replace('order: 1', 'order: 2'), 'utf8')
      writeFileSync(join(dir, '01-a.md'), MINIMAL.replace('id: demo', 'id: a'), 'utf8')
      writeFileSync(join(dir, 'FORMAT.md'), '# 格式说明\n', 'utf8')
      const { levels, files } = loadLevelFiles(dir)
      assert.deepEqual(files, ['01-a.md', '02-b.md'])
      assert.deepEqual(
        levels.map((level) => level.id),
        ['a', 'b'],
      )
    })
  })

  it('rejects an empty directory', async () => {
    await withTempDir((dir) => {
      assert.throws(() => loadLevelFiles(dir), (error) => {
        assert.ok(error.reason.includes('没有任何'))
        return true
      })
    })
  })

  it('rejects a missing directory', () => {
    assert.throws(() => loadLevelFiles('Z:\\definitely-not-here'), LevelFileError)
  })

  it('propagates a parse failure with the file name', async () => {
    await withTempDir((dir) => {
      mkdirSync(join(dir, 'sub'), { recursive: true })
      writeFileSync(join(dir, '01-bad.md'), '---\nid: x\n', 'utf8')
      assert.throws(() => loadLevelFiles(dir), (error) => {
        assert.equal(error.displayPath, '01-bad.md')
        return true
      })
    })
  })
})
