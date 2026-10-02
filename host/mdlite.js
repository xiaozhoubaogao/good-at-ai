/**
 * Markdown ↔ level-object translation.
 *
 * A level file is `---` frontmatter (the machine-readable contract) followed by
 * the prose a human reads. This module owns that split, the assertion mini
 * language used by `checks`, and the per-file error context: every failure
 * carries the file, line, the offending source line, and a reason, so a typo in
 * a level file is fixable without reading this code.
 *
 * @module @local/good-at-ai/host/mdlite
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { YamlError, lineOf, parseYaml } from './yaml.js'

/** A level file could not be turned into a level definition. */
export class LevelFileError extends Error {
  /**
   * @param {string} displayPath - the file, relative to the levels directory.
   * @param {number} line - 1-based line number, or 1 when unknown.
   * @param {string} reason - what is wrong, in Chinese.
   * @param {string} [sourceLine] - the offending line, when known.
   */
  constructor(displayPath, line, reason, sourceLine) {
    super(`${displayPath}:${line} ${reason}`)
    this.name = 'LevelFileError'
    this.displayPath = displayPath
    this.line = line
    this.reason = reason
    this.sourceLine = sourceLine
  }
}

/** Body sections with a meaning for the level object. */
export const BODY_SECTIONS = Object.freeze({
  goal: ['目标'],
  brief: ['任务说明', '任务'],
  tips: ['提示'],
})

/** Regular expression flags this mini language accepts. */
const ALLOWED_FLAGS = new Set(['i', 'm', 's', 'u'])

/**
 * Split a level file into frontmatter and body.
 *
 * @param {string} text - the raw file contents.
 * @param {string} displayPath - the file name used in errors.
 * @returns {{ yaml: string, yamlStartLine: number, body: string, bodyStartLine: number }} the split.
 * @throws {LevelFileError} when the delimiters are missing or unbalanced.
 */
export function splitFrontmatter(text, displayPath) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let open = -1
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    if (trimmed === '---') open = index
    break
  }
  if (open === -1) {
    throw new LevelFileError(displayPath, 1, '文件必须以 `---` 开头的 frontmatter 块开始（第一行不能是空行或正文）')
  }
  let close = -1
  for (let index = open + 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      close = index
      break
    }
  }
  if (close === -1) {
    throw new LevelFileError(displayPath, open + 1, 'frontmatter 没有闭合：缺少结束的 `---`')
  }
  return {
    yaml: lines.slice(open + 1, close).join('\n'),
    yamlStartLine: open + 2,
    body: lines.slice(close + 1).join('\n'),
    bodyStartLine: close + 2,
  }
}

/**
 * Parse one assertion from the mini language.
 *
 * Accepted forms: `文本`, `re:正则`, `!文本`, `!re:正则`, and a trailing
 * `@flags` on regular expressions. Inline flags such as `(?i)` are rejected by
 * the regex compiler later; use the `@` suffix instead.
 *
 * @param {unknown} raw - the raw assertion value from the frontmatter.
 * @param {string} displayPath - file name for errors.
 * @param {number} line - 1-based line for errors.
 * @returns {{ pattern: string, regex: boolean, flags: string, negate: boolean }} the parsed assertion.
 * @throws {LevelFileError} when the value is not a non-empty string.
 */
export function parseAssertion(raw, displayPath, line) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new LevelFileError(displayPath, line, '断言必须是非空字符串，例如 \'re:^# \\S\' 或 \'!re:TODO\'')
  }
  let text = raw.trim()
  let negate = false
  if (text.startsWith('!')) {
    negate = true
    text = text.slice(1).trim()
    if (text.length === 0) {
      throw new LevelFileError(displayPath, line, '`!` 后面必须跟要排除的内容')
    }
  }

  if (!text.startsWith('re:')) {
    // Plain text: keep the text with the negation marker removed, so a `!foo`
    // assertion matches on `foo` and negate decides which way to read it.
    return { pattern: text, regex: false, flags: '', negate }
  }

  let body = text.slice(3)
  let flags = ''
  const flagMatch = /^(.*\S)\s+@([A-Za-z]+)$/s.exec(body)
  if (flagMatch !== null) {
    body = flagMatch[1]
    flags = flagMatch[2]
    for (const flag of flags) {
      if (!ALLOWED_FLAGS.has(flag)) {
        throw new LevelFileError(displayPath, line, `不支持的正则标志 @${flag}（可用：i、m、s、u）`)
      }
    }
  }
  if (body.length === 0) {
    throw new LevelFileError(displayPath, line, '`re:` 后面必须跟正则表达式')
  }
  return { pattern: body, regex: true, flags, negate }
}

/**
 * Split a Markdown body into `##` sections.
 *
 * @param {string} body - the body text.
 * @returns {Map<string, string[]>} section title → its lines (fence-aware).
 */
export function parseBodySections(body) {
  const sections = new Map()
  let current = null
  let fence = null
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)
    if (fenceMatch !== null) {
      if (fence === null) fence = fenceMatch[1][0]
      else if (line.trimStart().startsWith(fence)) fence = null
      if (current !== null) sections.get(current).push(line)
      continue
    }
    if (fence === null) {
      const heading = /^##\s+(.+?)\s*$/.exec(line)
      if (heading !== null) {
        current = heading[1]
        if (!sections.has(current)) sections.set(current, [])
        continue
      }
    }
    if (current !== null) sections.get(current).push(line)
  }
  return sections
}

/** Join section lines into trimmed prose. */
function proseOf(sections, names, displayPath, line) {
  for (const name of names) {
    if (!sections.has(name)) continue
    const text = sections.get(name).join('\n').trim()
    if (text.length > 0) return text
  }
  throw new LevelFileError(displayPath, line, `正文缺少 \`## ${names[0]}\` 段（或该段为空）`)
}

/** Extract `- ` list items from the tips section. */
function listOf(sections, names) {
  for (const name of names) {
    if (!sections.has(name)) continue
    return sections
      .get(name)
      .map((line) => /^\s*[-*]\s+(.*)$/.exec(line))
      .filter((match) => match !== null)
      .map((match) => match[1].trim())
      .filter((item) => item.length > 0)
  }
  return []
}

/**
 * Translate one parsed frontmatter document plus its body into a level object.
 *
 * The result is still unvalidated: {@link validateLevels} in `levels/index.js`
 * remains the single source of truth for the schema, so this function only
 * reshapes and translates (notably `mustInclude` entries into pattern specs).
 *
 * @param {object} frontmatter - parsed YAML.
 * @param {Map<string, string[]>} sections - parsed body sections.
 * @param {string} displayPath - file name for errors.
 * @returns {object} the level candidate.
 * @throws {LevelFileError} on a missing or malformed structural field.
 */
export function toLevel(frontmatter, sections, displayPath) {
  const doc = frontmatter === null || typeof frontmatter !== 'object' || Array.isArray(frontmatter) ? {} : frontmatter
  const lineFor = (key) => lineOf(frontmatter, key) ?? 1

  const checks = doc.checks === null || doc.checks === undefined ? [] : doc.checks
  if (!Array.isArray(checks)) {
    throw new LevelFileError(displayPath, lineFor('checks'), '`checks` 必须是列表；没有检查时写 `checks: []`')
  }

  const translatedChecks = checks.map((check, index) => {
    if (check === null || typeof check !== 'object' || Array.isArray(check)) {
      throw new LevelFileError(displayPath, lineFor('checks'), `checks[${index}] 必须是映射`)
    }
    const checkLine = lineOf(checks, index) ?? lineFor('checks')
    const next = { ...check }
    if (next.mustInclude !== undefined) {
      if (!Array.isArray(next.mustInclude)) {
        throw new LevelFileError(displayPath, checkLine, `checks[${index}].mustInclude 必须是列表`)
      }
      next.mustInclude = next.mustInclude.map((item, itemIndex) =>
        parseAssertion(item, displayPath, lineOf(next.mustInclude, itemIndex) ?? checkLine),
      )
    }
    if (next.mustExclude !== undefined) {
      if (!Array.isArray(next.mustExclude)) {
        throw new LevelFileError(displayPath, checkLine, `checks[${index}].mustExclude 必须是列表`)
      }
      next.mustExclude = next.mustExclude.map((item, itemIndex) =>
        parseAssertion(item, displayPath, lineOf(next.mustExclude, itemIndex) ?? checkLine),
      )
    }
    if (next.patterns !== undefined) {
      if (!Array.isArray(next.patterns)) {
        throw new LevelFileError(displayPath, checkLine, `checks[${index}].patterns 必须是列表`)
      }
      next.patterns = next.patterns.map((item, itemIndex) =>
        parseAssertion(item, displayPath, lineOf(next.patterns, itemIndex) ?? checkLine),
      )
    }
    if (next.match !== undefined) {
      next.match = parseAssertion(next.match, displayPath, checkLine)
    }
    // `!`-prefixed mustInclude entries are exclusions; fold them into mustExclude
    // so the engine keeps its single, simple notion of each list.
    if (Array.isArray(next.mustInclude)) {
      const exclusions = next.mustInclude.filter((spec) => spec.negate === true)
      if (exclusions.length > 0) {
        next.mustInclude = next.mustInclude.filter((spec) => spec.negate !== true)
        next.mustExclude = [...(Array.isArray(next.mustExclude) ? next.mustExclude : []), ...exclusions]
      }
    }
    return next
  })

  if (doc.submit === undefined || doc.submit === null) {
    throw new LevelFileError(displayPath, lineFor('submit'), '缺少 `submit` 段（提交表单定义）')
  }

  return {
    id: doc.id,
    order: doc.order,
    chapter: doc.chapter,
    title: doc.title,
    goal: proseOf(sections, BODY_SECTIONS.goal, displayPath, 1),
    brief: proseOf(sections, BODY_SECTIONS.brief, displayPath, 1),
    tips: listOf(sections, BODY_SECTIONS.tips),
    requiresAI: doc.requiresAI === undefined ? true : doc.requiresAI,
    submit: doc.submit,
    checks: translatedChecks,
    rubric: doc.rubric,
    passScore: doc.passScore,
    systemPromptExtra: doc.systemPromptExtra,
  }
}

/**
 * Parse one level file.
 *
 * @param {string} text - the file contents.
 * @param {string} displayPath - the file name used in errors.
 * @returns {object} the level candidate.
 * @throws {LevelFileError | YamlError} with the exact location on any problem.
 */
export function parseLevelFile(text, displayPath) {
  const split = splitFrontmatter(text, displayPath)
  const frontmatter = parseYaml(split.yaml, { displayPath })
  const sections = parseBodySections(split.body)
  return toLevel(frontmatter, sections, displayPath)
}

/**
 * Load every `*.md` level file from a directory, sorted by file name.
 *
 * Failure is deliberately fatal: a level file that does not parse means the
 * catalog cannot be trusted, and a loud error at load time is far easier to
 * diagnose than a level that silently misbehaves later.
 *
 * @param {string} dir - the levels directory.
 * @returns {{ levels: object[], files: string[] }} parsed candidates plus their file names.
 * @throws {LevelFileError} when the directory is missing, empty, or has a bad file.
 */
export function loadLevelFiles(dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    throw new LevelFileError(dir, 1, `无法读取关卡目录：${error instanceof Error ? error.message : String(error)}`)
  }
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name)
    .filter((name) => name.toUpperCase() !== 'FORMAT.MD')
    .sort()
  if (files.length === 0) {
    throw new LevelFileError(dir, 1, '关卡目录里没有任何 `.md` 关卡文件（每个关卡一个文件）')
  }

  const levels = files.map((name) => {
    let text
    try {
      text = readFileSync(join(dir, name), 'utf8')
    } catch (error) {
      throw new LevelFileError(name, 1, `无法读取文件：${error instanceof Error ? error.message : String(error)}`)
    }
    try {
      return parseLevelFile(text, name)
    } catch (error) {
      if (error instanceof LevelFileError || error instanceof YamlError) throw error
      throw new LevelFileError(name, 1, `解析失败：${error instanceof Error ? error.message : String(error)}`)
    }
  })
  return { levels, files }
}

/**
 * Remember which file each parsed level came from.
 *
 * `validateLevels` reports schema problems against the level, so the file name
 * has to survive on the object for an error message to name the right file.
 *
 * @param {object[]} levels - parsed level candidates, in the same order as `files`.
 * @param {string[]} files - their file names.
 * @returns {object[]} the annotated levels.
 */
export function annotateSourceFiles(levels, files) {
  levels.forEach((level, index) => {
    if (level !== null && typeof level === 'object' && typeof files[index] === 'string') {
      Object.defineProperty(level, 'sourceFile', { value: files[index], enumerable: false, configurable: true })
    }
  })
  return levels
}
