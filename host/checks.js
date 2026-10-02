/**
 * Deterministic checks: the zero-cost hard evidence half of the judging
 * pipeline. Every check works only on relative paths inside the playground and
 * fails closed — an unreadable file, an exhausted byte budget, or a rejected
 * path produces `pass: false` with a readable explanation, never a silent pass.
 *
 * The engine is a pure function of (check, context); the context injects the
 * filesystem so tests can run without touching a real directory.
 *
 * @module @local/good-at-ai/host/checks
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** Per-file read cap for one check (256 KiB). */
export const PER_FILE_BYTES = 256 * 1024

/** Total read cap for one submission's checks (2 MiB). */
export const TOTAL_BYTES = 2 * 1024 * 1024

/** Maximum number of files any single check will visit. */
export const MAX_FILES = 200

/** Excerpt length kept in evidence strings. */
const EXCERPT_LENGTH = 80

/**
 * Build the default filesystem surface used by the engine.
 *
 * @returns {object} the fs surface.
 */
export function defaultFs() {
  return {
    /**
     * @param {string} path - absolute path.
     * @returns {{ kind: 'file' | 'dir', size: number } | null} stat summary or null.
     */
    stat(path) {
      try {
        const info = statSync(path)
        if (info.isDirectory()) return { kind: 'dir', size: 0 }
        if (info.isFile()) return { kind: 'file', size: info.size }
        return null
      } catch {
        return null
      }
    },

    /**
     * @param {string} path - absolute directory path.
     * @returns {string[]} entry names, or an empty list when unreadable.
     */
    list(path) {
      try {
        return readdirSync(path)
      } catch {
        return []
      }
    },

    /**
     * @param {string} path - absolute file path.
     * @param {number} maxBytes - upper bound; longer files are truncated in memory.
     * @returns {{ ok: true, text: string, bytes: number, truncated: boolean } | { ok: false, message: string }}
     */
    readText(path, maxBytes) {
      try {
        const buffer = readFileSync(path)
        const truncated = buffer.byteLength > maxBytes
        const slice = truncated ? buffer.subarray(0, maxBytes) : buffer
        return { ok: true, text: slice.toString('utf8'), bytes: slice.byteLength, truncated }
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}

/** Convert a `**`-aware glob into an anchored RegExp. */
export function globToRegExp(pattern) {
  let out = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1
        if (pattern[index + 1] === '/' || pattern[index + 1] === '\\') {
          index += 1
          out += '(?:.*[\\\\/])?'
        } else {
          out += '.*'
        }
      } else {
        out += '[^\\\\/]*'
      }
    } else if (char === '?') {
      out += '[^\\\\/]'
    } else if (char === '/' || char === '\\') {
      out += '[\\\\/]'
    } else {
      out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${out}$`)
}

/** Normalize a relative path to forward slashes for matching and display. */
function toPosix(relativePath) {
  return relativePath.split(sep).join('/')
}

/** Build a short excerpt around a match, collapsing whitespace. */
function excerpt(line) {
  const collapsed = line.replace(/\s+/g, ' ').trim()
  return collapsed.length > EXCERPT_LENGTH ? `${collapsed.slice(0, EXCERPT_LENGTH)}…` : collapsed
}

/**
 * Create the check context that owns the read budget for one submission.
 *
 * @param {{ root: string, fs?: object, relativePath: (root: string, path: string) => string }} options - confinement wiring.
 * @returns {object} the context passed to {@link executeCheck}.
 */
export function createCheckContext(options) {
  const fs = options.fs ?? defaultFs()
  const root = options.root
  const relativePath = options.relativePath
  const textCache = new Map()
  const budget = { used: 0, files: 0 }

  /**
   * Read one file under the shared budget, caching repeated reads.
   *
   * @param {string} absolutePath - confined absolute path.
   * @returns {{ ok: true, text: string, truncated: boolean } | { ok: false, message: string }}
   */
  function read(absolutePath) {
    const cached = textCache.get(absolutePath)
    if (cached !== undefined) return cached
    if (budget.used >= TOTAL_BYTES) {
      const exhausted = { ok: false, message: '本次提交的总读取预算（2 MiB）已用尽，请减少产物文件数量后重试。' }
      textCache.set(absolutePath, exhausted)
      return exhausted
    }
    budget.files += 1
    if (budget.files > MAX_FILES) {
      const tooMany = { ok: false, message: `单次检查最多读取 ${MAX_FILES} 个文件，请减少产物文件数量。` }
      textCache.set(absolutePath, tooMany)
      return tooMany
    }
    const remaining = Math.min(PER_FILE_BYTES, TOTAL_BYTES - budget.used)
    const result = fs.readText(absolutePath, remaining)
    if (!result.ok) {
      const failed = { ok: false, message: `无法读取 ${toPosix(relative(root, absolutePath))}：${result.message}` }
      textCache.set(absolutePath, failed)
      return failed
    }
    budget.used += result.bytes
    const value = { ok: true, text: result.text, truncated: result.truncated }
    textCache.set(absolutePath, value)
    return value
  }

  /**
   * Recursively collect files under a confined directory.
   *
   * @param {string} absoluteDir - confined absolute directory.
   * @returns {{ files: string[], truncated: boolean }} absolute file paths plus whether the walk was capped.
   */
  function walk(absoluteDir) {
    const files = []
    const queue = [absoluteDir]
    let capped = false
    while (queue.length > 0) {
      const current = queue.shift()
      for (const name of fs.list(current)) {
        if (files.length >= MAX_FILES) {
          capped = true
          break
        }
        const child = join(current, name)
        const info = fs.stat(child)
        if (info === null) continue
        if (info.kind === 'dir') {
          if (name.startsWith('.')) continue
          queue.push(child)
        } else {
          files.push(child)
        }
      }
      if (capped) break
    }
    files.sort()
    return { files, truncated: capped }
  }

  return {
    root,
    fs,
    relativePath,
    read,
    walk,
    toDisplay(absolutePath) {
      return toPosix(relative(root, absolutePath))
    },
    budgetUsed: () => budget.used,
    filesRead: () => budget.files,
  }
}

/** Guard a check input path, returning either the confined path or a failure. */
function confine(context, value) {
  try {
    return { ok: true, path: context.relativePath(context.root, value) }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      code: error && typeof error === 'object' && 'code' in error ? error.code : 'path-invalid',
    }
  }
}

/** Render one settled check result. */
function result(check, pass, evidence) {
  return {
    id: check.id,
    label: check.label,
    kind: check.kind,
    pass: pass === true,
    evidence,
  }
}

/** `file-exists`: the confined path resolves to a regular file. */
function runFileExists(check, context) {
  const confined = confine(context, check.path)
  if (!confined.ok) return result(check, false, confined.message)
  const info = context.fs.stat(confined.path)
  if (info === null) return result(check, false, `未找到文件：${check.path}`)
  if (info.kind !== 'file') return result(check, false, `路径存在但不是普通文件：${check.path}`)
  return result(check, true, `已找到 ${check.path}（${info.size} 字节）`)
}

/**
 * Match one text pattern against file content.
 *
 * @param {string} text - full file text.
 * @param {{ pattern: string, flags?: string, regex?: boolean }} spec - pattern spec.
 * @returns {{ matched: boolean, hit?: string, error?: string }} the outcome.
 */
export function matchText(text, spec) {
  if (spec.regex === true) {
    let expression
    try {
      expression = new RegExp(spec.pattern, (spec.flags ?? '').replace(/[gy]/g, ''))
    } catch (error) {
      return { matched: false, error: `正则无效：${error instanceof Error ? error.message : String(error)}` }
    }
    const match = expression.exec(text)
    return match === null ? { matched: false } : { matched: true, hit: excerpt(match[0]) }
  }
  if (!text.includes(spec.pattern)) return { matched: false }
  const lines = text.split(/\r?\n/)
  const line = lines.find((candidate) => candidate.includes(spec.pattern)) ?? spec.pattern
  return { matched: true, hit: excerpt(line) }
}

/** `file-matches`: content includes every `mustInclude` and none of `mustExclude`. */
function runFileMatches(check, context) {
  const confined = confine(context, check.path)
  if (!confined.ok) return result(check, false, confined.message)
  const info = context.fs.stat(confined.path)
  if (info === null || info.kind !== 'file') return result(check, false, `未找到文件：${check.path}`)
  const loaded = context.read(confined.path)
  if (!loaded.ok) return result(check, false, loaded.message)

  const mustInclude = Array.isArray(check.mustInclude) ? check.mustInclude : []
  const mustExclude = Array.isArray(check.mustExclude) ? check.mustExclude : []
  const failures = []
  const hits = []

  for (const spec of mustInclude) {
    const outcome = matchText(loaded.text, spec)
    if (outcome.error !== undefined) return result(check, false, `${check.path} 检查规则无效：${outcome.error}`)
    const satisfied = spec.negate === true ? !outcome.matched : outcome.matched
    if (!satisfied) failures.push(`缺少「${spec.pattern}」`)
    else hits.push(`${spec.pattern} → ${spec.negate === true ? '未出现' : outcome.hit}`)
  }
  for (const spec of mustExclude) {
    const outcome = matchText(loaded.text, spec)
    if (outcome.error !== undefined) return result(check, false, `${check.path} 检查规则无效：${outcome.error}`)
    const violated = spec.negate === true ? !outcome.matched : outcome.matched
    if (violated) failures.push(`出现了不应出现的内容「${spec.pattern}」`)
  }

  if (failures.length > 0) return result(check, false, `${check.path}：${failures.join('；')}`)
  const suffix = loaded.truncated ? '（文件较长，仅检查了前 256 KiB）' : ''
  return result(check, true, `${check.path} 满足全部要求${suffix}：${hits.join('；')}`)
}

/** `dir-has`: a glob inside the playground matches at least `min` entries. */
function runDirHas(check, context) {
  const baseRelative = typeof check.path === 'string' && check.path.trim().length > 0 ? check.path.trim() : '.'
  const confined = confine(context, baseRelative)
  if (!confined.ok) return result(check, false, confined.message)
  const info = context.fs.stat(confined.path)
  if (info === null) return result(check, false, `目录不存在：${baseRelative}`)
  if (info.kind !== 'dir') return result(check, false, `不是目录：${baseRelative}`)

  const glob = String(check.glob ?? '')
  if (glob.length === 0) return result(check, false, '检查规则缺少 glob。')
  const expression = globToRegExp(glob)
  const min = Number.isFinite(check.min) ? Math.max(1, Math.trunc(check.min)) : 1
  const { files, truncated } = context.walk(confined.path)
  const matches = files.filter((file) => expression.test(context.toDisplay(file)))
  if (matches.length < min) {
    return result(
      check,
      false,
      `在 ${baseRelative} 下匹配 ${glob} 的文件数为 ${matches.length}，少于要求的 ${min}${truncated ? '（文件数量已达扫描上限）' : ''}`,
    )
  }
  const shown = matches.slice(0, 3).map((file) => context.toDisplay(file))
  return result(check, true, `匹配 ${glob} 的文件共 ${matches.length} 个：${shown.join('、')}${matches.length > 3 ? ' 等' : ''}`)
}

/** `text-matches`: every pattern must appear somewhere in the playground tree. */
function runTextMatches(check, context) {
  const patterns = Array.isArray(check.patterns) ? check.patterns : []
  if (patterns.length === 0) return result(check, false, '检查规则缺少 patterns。')
  const baseRelative = typeof check.path === 'string' && check.path.trim().length > 0 ? check.path.trim() : '.'
  const confined = confine(context, baseRelative)
  if (!confined.ok) return result(check, false, confined.message)
  const info = context.fs.stat(confined.path)
  if (info === null) return result(check, false, `路径不存在：${baseRelative}`)

  const { files, truncated } = context.walk(info.kind === 'dir' ? confined.path : join(confined.path, '..'))
  const candidates = info.kind === 'file' ? [confined.path] : files
  const loaded = []
  const readErrors = []
  for (const file of candidates) {
    const content = context.read(file)
    if (!content.ok) {
      readErrors.push(content.message)
      continue
    }
    loaded.push({ file, text: content.text })
  }
  if (loaded.length === 0) {
    const detail = readErrors.length > 0 ? readErrors[0] : '该路径下没有可读取的文件'
    return result(check, false, detail)
  }

  const missing = []
  const hits = []
  for (const spec of patterns) {
    let found = null
    for (const entry of loaded) {
      const outcome = matchText(entry.text, spec)
      if (outcome.error !== undefined) return result(check, false, `检查规则无效：${outcome.error}`)
      if (outcome.matched) {
        found = `${context.toDisplay(entry.file)} 中的「${outcome.hit}」`
        break
      }
    }
    if (found === null) missing.push(spec.pattern)
    else hits.push(`${spec.pattern} → ${found}`)
  }
  if (missing.length > 0) {
    return result(check, false, `以下内容未在任何产物文件中找到：${missing.map((item) => `「${item}」`).join('、')}`)
  }
  const suffix = truncated ? '（扫描已达文件数量上限）' : ''
  return result(check, true, `全部内容均已找到${suffix}：${hits.join('；')}`)
}

/**
 * `count`: the number of matches of one assertion must fall inside a range.
 *
 * This is what makes "exactly three level-2 sections" a hard, evidence-based
 * check instead of something only the model can judge.
 */
function runCount(check, context) {
  const confined = confine(context, check.path)
  if (!confined.ok) return result(check, false, confined.message)
  const info = context.fs.stat(confined.path)
  if (info === null || info.kind !== 'file') return result(check, false, `未找到文件：${check.path}`)

  const spec = check.match
  if (spec === null || typeof spec !== 'object' || typeof spec.pattern !== 'string') {
    return result(check, false, '检查规则缺少 match。')
  }
  const loaded = context.read(confined.path)
  if (!loaded.ok) return result(check, false, loaded.message)

  const lines = loaded.text.split(/\r?\n/)
  let count = 0
  if (spec.regex === true) {
    let expression
    try {
      expression = new RegExp(spec.pattern, `${(spec.flags ?? '').replace(/[y]/g, '')}g`)
    } catch (error) {
      return result(check, false, `正则无效：${error instanceof Error ? error.message : String(error)}`)
    }
    const matches = loaded.text.match(expression)
    count = matches === null ? 0 : matches.length
  } else {
    for (const line of lines) {
      if (line.includes(spec.pattern)) count += 1
    }
  }

  const min = Number.isFinite(check.min) ? Math.max(0, Math.trunc(check.min)) : null
  const max = Number.isFinite(check.max) ? Math.max(0, Math.trunc(check.max)) : null
  const lowerBreach = min !== null && count < min
  const upperBreach = max !== null && count > max

  if (lowerBreach || upperBreach) {
    const expected = min !== null && max !== null ? `应为 ${min}–${max}` : min !== null ? `至少 ${min}` : `至多 ${max}`
    return result(check, false, `${check.path} 中匹配「${spec.pattern}」的次数为 ${count}，${expected} 次`)
  }
  const expected = min !== null && max !== null ? `正好 ${min} 次` : min !== null ? `不少于 ${min} 次` : `不超过 ${max} 次`
  return result(check, true, `${check.path} 中匹配「${spec.pattern}」的次数为 ${count}，满足${expected}`)
}

const RUNNERS = {
  'file-exists': runFileExists,
  'file-matches': runFileMatches,
  'dir-has': runDirHas,
  'text-matches': runTextMatches,
  count: runCount,
}

/**
 * Execute one deterministic check.
 *
 * @param {object} check - `{ id, label, kind, ... }` from the level data.
 * @param {object} context - a {@link createCheckContext} result.
 * @returns {{ id: string, label: string, kind: string, pass: boolean, evidence: string }} the settled result.
 */
export function executeCheck(check, context) {
  const runner = RUNNERS[check.kind]
  if (runner === undefined) {
    return result(check, false, `未知的检查类型：${String(check.kind)}`)
  }
  try {
    return runner(check, context)
  } catch (error) {
    return result(check, false, `检查执行失败：${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Execute every check declared by one level, sharing a single read budget.
 *
 * @param {object[]} checks - the level's checks.
 * @param {object} options - {@link createCheckContext} options.
 * @returns {object[]} one result per check, in declaration order.
 */
export function runChecks(checks, options) {
  const context = createCheckContext(options)
  return (Array.isArray(checks) ? checks : []).map((check) => executeCheck(check, context))
}
