import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { YamlError, lineOf, parseScalar, parseYaml, stripComment } from '../host/yaml.js'

/** Parse with a stable display path so error messages are comparable. */
function parse(text) {
  return parseYaml(text, { displayPath: 'level.md' })
}

/** Assert a parse error, returning it for further inspection. */
function expectError(text) {
  try {
    parse(text)
  } catch (error) {
    assert.ok(error instanceof YamlError, `expected YamlError, got ${error}`)
    return error
  }
  assert.fail('expected the parse to fail')
}

describe('yaml: scalars', () => {
  it('parses booleans, null, integers, and decimals', () => {
    const doc = parse(['a: true', 'b: False', 'c: null', 'd: ~', 'e: 42', 'f: -7', 'g: 0.25', 'h: 1e3'].join('\n'))
    assert.deepEqual(doc, { a: true, b: false, c: null, d: null, e: 42, f: -7, g: 0.25, h: 1000 })
  })

  it('keeps unquoted text as a string', () => {
    const doc = parse('title: 让 AI 在指定目录建一份结构化周报')
    assert.equal(doc.title, '让 AI 在指定目录建一份结构化周报')
  })

  it('decodes double-quoted escapes and single-quote doubling', () => {
    assert.equal(parse('a: "line\\nbreak"').a, 'line\nbreak')
    assert.equal(parse('a: "quote \\" inside"').a, 'quote " inside')
    assert.equal(parse("a: 'it''s fine'").a, "it's fine")
  })

  it('accepts a colon inside a quoted value', () => {
    assert.equal(parse('a: "正则: ^x$"').a, '正则: ^x$')
  })

  it('leaves an empty value as null', () => {
    assert.equal(parse('a:').a, null)
  })

  it('supports empty flow collections', () => {
    const doc = parse('checks: []\nmeta: {}')
    assert.deepEqual(doc.checks, [])
    assert.deepEqual(doc.meta, {})
  })

  it('parses scalars through parseScalar directly', () => {
    assert.equal(parseScalar('7', 'x', 1, 'x'), 7)
    assert.equal(parseScalar('"x"', 'x', 1, 'x'), 'x')
    assert.equal(parseScalar('  ', 'x', 1, 'x'), null)
  })
})

describe('yaml: comments and blank lines', () => {
  it('drops whole-line comments and keeps blank structure', () => {
    const doc = parse(['# leading comment', '', 'a: 1', '', '# trailing comment'].join('\n'))
    assert.deepEqual(doc, { a: 1 })
  })

  it('strips trailing comments only when preceded by whitespace', () => {
    assert.equal(parse('a: 1 # note').a, 1)
    assert.equal(parse('a: abc#def').a, 'abc#def')
    assert.equal(parse('a: "x # y"  # real comment').a, 'x # y')
  })

  it('stripComment respects quoting', () => {
    assert.equal(stripComment('v # c'), 'v')
    assert.equal(stripComment('"a # b"'), '"a # b"')
    assert.equal(stripComment("'a # b' # c"), "'a # b'")
  })
})

describe('yaml: nesting', () => {
  it('parses nested maps', () => {
    const doc = parse(['submit:', '  artifactNote: 相对路径', '  fields:', '    - name: prompt'].join('\n'))
    assert.deepEqual(doc, { submit: { artifactNote: '相对路径', fields: [{ name: 'prompt' }] } })
  })

  it('parses sequences of scalars, maps, and nested sequences on their own lines', () => {
    const doc = parse(
      [
        'scalars:',
        '  - one',
        '  - two',
        'maps:',
        '  - id: a',
        '    weight: 0.5',
        '  - id: b',
        '    weight: 0.5',
        'nested:',
        '  - -',
        '    - 1',
        '    - 2',
        'emptyItem:',
        '  -',
      ].join('\n'),
    )
    assert.deepEqual(doc.scalars, ['one', 'two'])
    assert.deepEqual(doc.maps, [
      { id: 'a', weight: 0.5 },
      { id: 'b', weight: 0.5 },
    ])
    assert.deepEqual(doc.nested, [[1, 2]])
    assert.deepEqual(doc.emptyItem, [null])
  })

  it('parses a sequence item whose first key has a nested block', () => {
    const doc = parse(['checks:', '  - id: c1', '    opts:', '      a: 1', '    label: L'].join('\n'))
    assert.deepEqual(doc.checks, [{ id: 'c1', opts: { a: 1 }, label: 'L' }])
  })
})

describe('yaml: block scalars', () => {
  it('parses literal and folded styles with chomping', () => {
    const doc = parse(
      [
        'literal: |',
        '  第一行',
        '  第二行',
        'folded: >',
        '  折叠',
        '  成一行',
        'stripped: |-',
        '  no trailing newline',
      ].join('\n'),
    )
    assert.equal(doc.literal, '第一行\n第二行\n')
    assert.equal(doc.folded, '折叠 成一行\n')
    assert.equal(doc.stripped, 'no trailing newline')
  })
})

describe('yaml: line tracking', () => {
  it('records the line of keys and sequence items', () => {
    const doc = parse(['a: 1', 'b:', '  c: 2', 'list:', '  - x', '  - y'].join('\n'))
    assert.equal(lineOf(doc, 'a'), 1)
    assert.equal(lineOf(doc, 'b'), 2)
    assert.equal(lineOf(doc.b, 'c'), 3)
    assert.equal(lineOf(doc, 'list'), 4)
    assert.equal(lineOf(doc.list, 0), 5)
    assert.equal(lineOf(doc.list, 1), 6)
  })

  it('returns undefined for unknown keys', () => {
    assert.equal(lineOf(parse('a: 1'), 'nope'), undefined)
  })
})

describe('yaml: rejected syntax reports the exact line', () => {
  it('rejects tab indentation', () => {
    const error = expectError('a:\n\tb: 1')
    assert.equal(error.line, 2)
    assert.ok(error.reason.includes('Tab'), error.reason)
  })

  it('rejects anchors, tags, and non-empty flow collections', () => {
    assert.ok(expectError('a: &x 1').reason.includes('锚点'))
    assert.ok(expectError('a: *x').reason.includes('锚点'))
    assert.ok(expectError('a: !!js 1').reason.includes('标签'))
    assert.ok(expectError('a: {b: 1}').reason.includes('flow'))
    assert.ok(expectError('a: [1, 2]').reason.includes('flow'))
  })

  it('rejects unclosed quotes', () => {
    assert.ok(expectError('a: "oops').reason.includes('双引号'))
    assert.ok(expectError("a: 'oops").reason.includes('单引号'))
  })

  it('rejects inline nested sequences with a clear instruction', () => {
    const error = expectError('nested:\n  - - 1')
    assert.equal(error.line, 2)
    assert.ok(error.reason.includes('内联嵌套序列'), error.reason)
  })

  it('rejects a line that is not a key/value pair', () => {
    const error = expectError('a: 1\nthis line has no colon')
    assert.equal(error.line, 2)
    assert.ok(error.reason.includes('键: 值'))
  })

  it('rejects a second document marker', () => {
    assert.ok(expectError('---\na: 1').reason.includes('多文档'))
  })

  it('rejects duplicate keys', () => {
    const error = expectError('a: 1\na: 2')
    assert.equal(error.line, 2)
    assert.ok(error.reason.includes('键重复'))
  })

  it('rejects inconsistent indentation', () => {
    const error = expectError('a:\n    b: 1\n  c: 2')
    assert.equal(error.line, 3)
    assert.ok(error.reason.includes('缩进不一致'))
  })

  it('rejects non-string input', () => {
    assert.throws(() => parseYaml(null), YamlError)
  })
})

describe('yaml: line endings', () => {
  it('handles CRLF and a trailing blank line', () => {
    assert.deepEqual(parse('a: 1\r\nb: two\r\n\r\n'), { a: 1, b: 'two' })
  })

  it('returns an empty object for empty input', () => {
    assert.deepEqual(parse(''), {})
    assert.deepEqual(parse('\n\n# only a comment\n'), {})
  })
})
