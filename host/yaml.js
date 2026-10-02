/**
 * A tiny, dependency-free YAML subset parser for level frontmatter.
 *
 * The plugin is symlinked into a profile, so Node's module resolution never
 * reaches the profile's `node_modules` and any npm import would fail at load
 * time. That is why this is hand-written rather than delegated to `js-yaml`.
 *
 * Supported: block mappings, block sequences, nested indentation, single- and
 * double-quoted scalars, plain scalars, block scalars (`|`, `>`, with `-`/`+`
 * chomping), `true`/`false`/`null`/`~`, integers, decimals, empty flow
 * collections (`[]`, `{}`), `#` comments (whole-line and trailing), blank
 * lines, and `\n`/`\r\n` line endings.
 *
 * Deliberately NOT supported — these raise a `YamlError` naming the line
 * instead of being silently misread: tab indentation, anchors/aliases/tags
 * (`&`, `*`, `!!`), multiple documents (`---` inside the body), non-empty flow
 * collections (`{a: 1}`, `[1, 2]`), and an inline nested sequence (`- - 1`,
 * which must be written one item per line as `- -` / `  - 1`).
 *
 * @module @local/good-at-ai/host/yaml
 */

/** A parse failure carrying the exact place in the source. */
export class YamlError extends Error {
  /**
   * @param {string} displayPath - file path shown to the user.
   * @param {number} line - 1-based line number.
   * @param {number} column - 1-based column number.
   * @param {string} sourceLine - the offending source line, for context.
   * @param {string} reason - what went wrong, in Chinese.
   */
  constructor(displayPath, line, column, sourceLine, reason) {
    super(`${displayPath}:${line}:${column} ${reason}`)
    this.name = 'YamlError'
    this.displayPath = displayPath
    this.line = line
    this.column = column
    this.sourceLine = sourceLine
    this.reason = reason
  }
}

/** Matches the start of a mapping entry: `key:` or `"key":` or `'key':`. */
const KEY_LINE_RE = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:#[\]{}]+?)\s*:(?:\s|$)/

/** Cursor state shared by every parse step. */
class Cursor {
  /** @param {string[]} lines @param {string} displayPath */
  constructor(lines, displayPath) {
    this.lines = lines
    this.displayPath = displayPath
    this.index = 0
  }

  /** True when every remaining line is blank or a comment. */
  atEnd() {
    let probe = this.index
    while (probe < this.lines.length) {
      const text = this.lines[probe].trim()
      if (text.length > 0 && !text.startsWith('#')) return false
      probe += 1
    }
    return true
  }

  /**
   * Advance past blank and comment-only lines.
   *
   * @returns {{ line: number, raw: string, content: string, indent: number } | null} the next content line.
   */
  next() {
    while (this.index < this.lines.length) {
      const raw = this.lines[this.index]
      const stripped = raw.trim()
      if (stripped.length === 0 || stripped.startsWith('#')) {
        this.index += 1
        continue
      }
      const indent = raw.length - raw.trimStart().length
      if (raw.slice(0, indent).includes('\t')) {
        throw new YamlError(this.displayPath, this.index + 1, indent + 1, raw, '不允许用 Tab 缩进（YAML 只接受空格）')
      }
      return { line: this.index + 1, raw, content: raw.slice(indent), indent }
    }
    return null
  }

  /** Consume the current content line. */
  take() {
    this.index += 1
  }

  /**
   * Read a line as a mapping entry.
   *
   * @param {{ line: number, raw: string, content: string, indent: number }} entry - the content line.
   * @param {{ skipTake?: boolean }} [options] - `skipTake` parses a synthetic entry
   *   whose line is already consumed (an inline `- key: value` item), so the
   *   cursor must not advance a second time.
   * @returns {{ key: string, valueText: string, keyColumn: number, blockScalar: object | null }} the split entry.
   */
  readKey(entry, options = {}) {
    const column = entry.indent + 1
    const content = entry.content
    const keyMatch = KEY_LINE_RE.exec(content)
    if (keyMatch === null) {
      throw new YamlError(
        this.displayPath,
        entry.line,
        column,
        entry.raw,
        '无法解析这一行：期望 `键: 值`。若这是多行文本的一部分，请缩进续行；若正文里含半角冒号，请把整行用引号包起来',
      )
    }

    // KEY_LINE_RE is capture-free for reuse, so take the key token here: it is
    // everything before the final `:` of the matched `key:` prefix.
    const matched = keyMatch[0]
    const colonAt = matched.lastIndexOf(':')
    const rawKey = matched.slice(0, colonAt).trim()
    const key = rawKey.startsWith('"')
      ? rawKey.slice(1, -1).replace(/\\(["\\/nrt])/g, (_, escape) => (escape === 'n' ? '\n' : escape === 'r' ? '\r' : escape === 't' ? '\t' : escape))
      : rawKey.startsWith("'")
        ? rawKey.slice(1, -1).replace(/''/g, "'")
        : rawKey
    if (key.length === 0) {
      throw new YamlError(this.displayPath, entry.line, column, entry.raw, '键名不能为空')
    }
    const valueText = content.slice(matched.length).trim()

    if (/^[|>][+-]?$/.test(valueText)) {
      const style = valueText[0]
      const chomping = valueText[1] ?? ''
      if (options.skipTake !== true) this.take()
      return { key, valueText: '', keyColumn: column, blockScalar: this.readBlockScalar(entry, style, chomping) }
    }

    if (options.skipTake !== true) this.take()
    return { key, valueText, keyColumn: column, blockScalar: null }
  }

  /**
   * Consume the indented body of a block scalar.
   *
   * @param {{ line: number, raw: string, indent: number }} entry - the `key: |` line.
   * @param {string} style - `|` (literal) or `>` (folded).
   * @param {string} chomping - `-`, `+`, or empty.
   * @returns {string} the assembled scalar.
   */
  readBlockScalar(entry, style, chomping) {
    const collected = []
    let minIndent = Number.POSITIVE_INFINITY
    let probe = this.index
    while (probe < this.lines.length) {
      const raw = this.lines[probe]
      if (raw.trim().length === 0) {
        collected.push('')
        probe += 1
        continue
      }
      const indent = raw.length - raw.trimStart().length
      if (indent <= entry.indent) break
      minIndent = Math.min(minIndent, indent)
      collected.push(raw)
      probe += 1
    }
    this.index = probe
    const body = collected.map((raw) => (raw.trim().length === 0 ? '' : raw.slice(minIndent))).join('\n')
    const folded = style === '>' ? body.replace(/\n(?!\n)/g, ' ') : body
    if (chomping === '-') return folded.replace(/\n+$/, '')
    return folded.replace(/\n*$/, '\n')
  }
}

/** Reject the YAML features this subset intentionally omits. */
function assertPlainScalarSupported(valueText, displayPath, line, raw) {
  if (valueText.startsWith('&') || valueText.startsWith('*')) {
    throw new YamlError(displayPath, line, 1, raw, '不支持锚点/别名（& / *）')
  }
  if (valueText.startsWith('!!')) {
    throw new YamlError(displayPath, line, 1, raw, '不支持 YAML 标签（!!）')
  }
  if (valueText.startsWith('{') || valueText.startsWith('[')) {
    throw new YamlError(displayPath, line, 1, raw, '不支持 flow 风格（{} / []），请改用缩进嵌套')
  }
}

/**
 * Remove a trailing comment while respecting quoting.
 *
 * @param {string} text - the raw value text.
 * @returns {string} the text with any trailing comment removed.
 */
export function stripComment(text) {
  let quote = null
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== null) {
      if (quote === "'" && char === "'") {
        if (text[index + 1] === "'") index += 1
        else quote = null
      } else if (quote === '"' && char === '\\') {
        index += 1
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
    } else if (char === '#' && index > 0 && /\s/.test(text[index - 1])) {
      return text.slice(0, index).trimEnd()
    }
  }
  return text.trimEnd()
}

/**
 * Parse one scalar token into a JavaScript value.
 *
 * @param {string} rawText - the value text (comments already stripped).
 * @param {string} displayPath - file path for errors.
 * @param {number} line - 1-based line number.
 * @param {string} sourceLine - the full source line for errors.
 * @returns {string | number | boolean | null} the scalar value.
 */
export function parseScalar(rawText, displayPath, line, sourceLine) {
  const text = rawText.trim()
  if (text.length === 0) return null

  if (text.startsWith('"')) {
    if (!text.endsWith('"') || text.length < 2) {
      throw new YamlError(displayPath, line, 1, sourceLine, '双引号没有闭合')
    }
    const inner = text.slice(1, -1)
    return inner.replace(/\\(["\\/nrt])/g, (_, escape) => {
      if (escape === 'n') return '\n'
      if (escape === 'r') return '\r'
      if (escape === 't') return '\t'
      return escape
    })
  }
  if (text.startsWith("'")) {
    if (!text.endsWith("'") || text.length < 2) {
      throw new YamlError(displayPath, line, 1, sourceLine, '单引号没有闭合')
    }
    return text.slice(1, -1).replace(/''/g, "'")
  }

  // Empty flow collections are unambiguous and idiomatic (`checks: []`), so
  // they are the one flow syntax this subset accepts. Non-empty flow is still
  // rejected below rather than half-implemented.
  if (text === '[]') return []
  if (text === '{}') return {}

  assertPlainScalarSupported(text, displayPath, line, sourceLine)

  if (text === '~' || text === 'null' || text === 'Null' || text === 'NULL') return null
  if (text === 'true' || text === 'True' || text === 'TRUE') return true
  if (text === 'false' || text === 'False' || text === 'FALSE') return false
  if (/^[+-]?\d+$/.test(text)) return Number.parseInt(text, 10)
  if (/^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(text)) return Number.parseFloat(text)
  return text
}

/** Attach line metadata to a container without polluting its keys. */
const LINE_INFO = new WeakMap()

/** Record where one key or sequence item came from. */
function recordLine(container, key, line) {
  let info = LINE_INFO.get(container)
  if (info === undefined) {
    info = new Map()
    LINE_INFO.set(container, info)
  }
  info.set(key, line)
}

/**
 * Look up the source line recorded for a key or sequence index.
 *
 * @param {object | any[]} container - the parsed container.
 * @param {string | number} key - the key or index.
 * @returns {number | undefined} the 1-based line, when known.
 */
export function lineOf(container, key) {
  const info = LINE_INFO.get(container)
  return info === undefined ? undefined : info.get(key)
}

/** Parse a block mapping at exactly `indent`. */
function parseMap(cursor, indent) {
  const map = {}
  for (;;) {
    const entry = cursor.next()
    if (entry === null) return map
    if (entry.indent < indent) return map
    if (entry.indent > indent) {
      throw new YamlError(cursor.displayPath, entry.line, entry.indent + 1, entry.raw, `缩进不一致：期望 ${indent} 个空格`)
    }
    if (entry.content.startsWith('- ') || entry.content === '-') return map

    const parsed = cursor.readKey(entry)
    if (Object.hasOwn(map, parsed.key)) {
      throw new YamlError(cursor.displayPath, entry.line, entry.indent + 1, entry.raw, `键重复：${parsed.key}`)
    }
    recordLine(map, parsed.key, entry.line)
    map[parsed.key] = valueFor(cursor, parsed, indent, entry.line, entry.raw)
  }
}

/**
 * Produce the value for one parsed mapping entry, consuming any nested block.
 *
 * @param {Cursor} cursor - the cursor, positioned after the entry's own line.
 * @param {{ key: string, valueText: string, blockScalar: object | null }} parsed - the split entry.
 * @param {number} indent - the indent of the entry's own block.
 * @param {number} line - the entry's 1-based line, for error reporting.
 * @param {string} raw - the entry's raw text, for error reporting.
 * @returns {unknown} the value (`null` when the key has nothing after it).
 */
function valueFor(cursor, parsed, indent, line, raw) {
  if (parsed.blockScalar !== null) return parsed.blockScalar
  if (parsed.valueText.length === 0) {
    const child = cursor.next()
    if (child === null || child.indent <= indent) return null
    return child.content.startsWith('- ') || child.content === '-'
      ? parseSeq(cursor, child.indent)
      : parseMap(cursor, child.indent)
  }
  return parseScalar(stripComment(parsed.valueText), cursor.displayPath, line, raw)
}

/** Parse a block sequence at exactly `indent`. */
function parseSeq(cursor, indent) {
  const list = []
  for (;;) {
    const entry = cursor.next()
    if (entry === null) return list
    if (entry.indent < indent) return list
    if (entry.indent > indent) {
      throw new YamlError(cursor.displayPath, entry.line, entry.indent + 1, entry.raw, `缩进不一致：期望 ${indent} 个空格`)
    }
    if (!entry.content.startsWith('- ') && entry.content !== '-') return list

    const itemLine = entry.line
    const restRaw = entry.content === '-' ? '' : entry.content.slice(2)
    const restIndent = entry.indent + 2
    const rest = restRaw.trim()
    cursor.take()

    if (rest.length === 0 || rest === '-') {
      // A bare `-`, optionally with a second dash on the same line (the
      // one-item-per-line form of a nested sequence): the value is the following
      // more-indented block, or null when this dash was alone on its level.
      const child = cursor.next()
      if (child === null || child.indent <= indent) {
        list.push(null)
      } else if (child.content.startsWith('- ') || child.content === '-') {
        list.push(parseSeq(cursor, child.indent))
      } else {
        list.push(parseMap(cursor, child.indent))
      }
      recordLine(list, list.length - 1, itemLine)
      continue
    }

    // Only a dash followed by inline content is rejected: outside flow style
    // `- - 1` is vanishingly rare, and mis-parsing it silently would be worse
    // than asking for the clearer one-item-per-line form handled above.
    if (rest.startsWith('- ') && entry.raw.indexOf('-', entry.indent + 1) === restIndent) {
      throw new YamlError(
        cursor.displayPath,
        itemLine,
        restIndent + 1,
        entry.raw,
        '不支持内联嵌套序列（`- - 1`），请把内层序列另起一行并缩进',
      )
    }

    // `- key: value` starts a mapping inside the item. The item's own line is
    // already consumed, so the first key is parsed with skipTake; further keys
    // of the same item sit at exactly `restIndent` and are consumed here rather
    // than by a fresh parseMap, which would spill into the rest of the document.
    if (KEY_LINE_RE.test(rest)) {
      const itemMap = {}
      let keyLine = itemLine
      let keyRaw = entry.raw
      let current = rest
      let currentIndent = restIndent
      for (;;) {
        const parsedKey = cursor.readKey({ line: keyLine, raw: keyRaw, content: current, indent: currentIndent }, { skipTake: true })
        if (Object.hasOwn(itemMap, parsedKey.key)) {
          throw new YamlError(cursor.displayPath, keyLine, currentIndent + 1, keyRaw, `键重复：${parsedKey.key}`)
        }
        recordLine(itemMap, parsedKey.key, keyLine)
        itemMap[parsedKey.key] = valueFor(cursor, parsedKey, currentIndent, keyLine, keyRaw)

        const nextKey = cursor.next()
        if (nextKey === null) break
        if (nextKey.indent !== restIndent) break
        if (nextKey.content.startsWith('- ') || nextKey.content === '-') break
        if (!KEY_LINE_RE.test(nextKey.content)) break
        cursor.take()
        keyLine = nextKey.line
        keyRaw = nextKey.raw
        current = nextKey.content
        currentIndent = nextKey.indent
      }
      list.push(itemMap)
      recordLine(list, list.length - 1, itemLine)
      continue
    }

    list.push(parseScalar(stripComment(rest), cursor.displayPath, itemLine, entry.raw))
    recordLine(list, list.length - 1, itemLine)
  }
}

/**
 * Parse a YAML subset document.
 *
 * @param {string} text - the YAML source.
 * @param {{ displayPath?: string }} [options] - a path used in error messages.
 * @returns {object | any[] | string | number | boolean | null} the parsed value.
 * @throws {YamlError} on unsupported syntax or malformed input.
 */
export function parseYaml(text, options = {}) {
  const displayPath = options.displayPath ?? '<yaml>'
  if (typeof text !== 'string') {
    throw new YamlError(displayPath, 1, 1, '', 'YAML 内容必须是字符串')
  }
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  const cursor = new Cursor(lines, displayPath)
  const first = cursor.next()
  if (first === null) return {}

  const rootIndent = first.indent
  if (first.content === '---') {
    throw new YamlError(displayPath, first.line, 1, first.raw, '不支持多文档（frontmatter 内不能再出现 ---）')
  }
  return first.content.startsWith('- ') || first.content === '-'
    ? parseSeq(cursor, rootIndent)
    : parseMap(cursor, rootIndent)
}
