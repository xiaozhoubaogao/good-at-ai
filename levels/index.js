/**
 * Level data for AI 通关.
 *
 * Levels live as Markdown files (`levels/*.md`): YAML frontmatter carries the
 * machine-readable contract, the body carries the prose. Adding a level means
 * adding one file — no code change and no registration list. {@link validateLevels}
 * is still the single source of truth for the schema and runs at module load, so
 * malformed data fails loudly instead of producing a confusing check later.
 *
 * @module @local/good-at-ai/levels
 */

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LevelFileError, annotateSourceFiles, loadLevelFiles } from '../host/mdlite.js'

/** Directory holding the Markdown level files. */
export const LEVELS_DIR = dirname(fileURLToPath(import.meta.url))

/** Level definitions loaded from disk, frozen for one process run. */
const LOADED = loadLevelFiles(LEVELS_DIR)
const RAW_LEVELS = Object.freeze(annotateSourceFiles(LOADED.levels, LOADED.files))

const CHECK_KINDS = new Set(['file-exists', 'file-matches', 'dir-has', 'text-matches', 'count'])

/** Thrown when level data is malformed; surfaced at `/catalog` as a 500. */
export class LevelDataError extends Error {
  /**
   * @param {string} message - what is wrong.
   * @param {string} levelId - the offending level.
   */
  constructor(message, levelId) {
    super(message)
    this.name = 'LevelDataError'
    this.levelId = levelId
  }
}

/** Assert a required non-empty string field. */
function requireString(level, field) {
  const value = level[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new LevelDataError(`关卡 ${level.id ?? '(无 id)'} 缺少必填字段 ${field}。`, level.id)
  }
}

/** Assert a required array field. */
function requireArray(level, field) {
  if (!Array.isArray(level[field])) {
    throw new LevelDataError(`关卡 ${level.id} 的 ${field} 必须是数组。`, level.id)
  }
}

/** Validate one text-pattern spec, including that its regex actually compiles. */
function validatePattern(where, spec, levelId) {
  if (spec === null || typeof spec !== 'object' || typeof spec.pattern !== 'string' || spec.pattern.length === 0) {
    throw new LevelDataError(`${where} 缺少 pattern。`, levelId)
  }
  if (spec.flags !== undefined && typeof spec.flags !== 'string') {
    throw new LevelDataError(`${where} 的 flags 必须是字符串。`, levelId)
  }
  if (spec.regex === true) {
    try {
      // `g`/`y` are stripped at match time; everything else must compile as-is.
      new RegExp(spec.pattern, (spec.flags ?? '').replace(/[gy]/g, ''))
    } catch (error) {
      // Catches JavaScript-invalid syntax such as an inline `(?s)` flag, which
      // would otherwise become a check that fails forever at runtime.
      throw new LevelDataError(
        `${where} 的正则无法编译：${spec.pattern} —— ${error instanceof Error ? error.message : String(error)}`,
        levelId,
      )
    }
  }
}

/** Validate one `checks[]` entry. */
function validateCheck(level, check, index) {
  const where = `关卡 ${level.id} 的第 ${index + 1} 个检查`
  if (check === null || typeof check !== 'object') throw new LevelDataError(`${where} 必须是对象。`, level.id)
  for (const field of ['id', 'label', 'kind']) {
    if (typeof check[field] !== 'string' || check[field].trim().length === 0) {
      throw new LevelDataError(`${where} 缺少字段 ${field}。`, level.id)
    }
  }
  if (!CHECK_KINDS.has(check.kind)) {
    throw new LevelDataError(`${where} 的 kind 非法：${check.kind}。`, level.id)
  }
  if (check.kind === 'file-exists' || check.kind === 'file-matches') {
    if (typeof check.path !== 'string' || check.path.trim().length === 0) {
      throw new LevelDataError(`${where}（${check.kind}）缺少 path。`, level.id)
    }
  }
  if (check.kind === 'file-matches') {
    const include = Array.isArray(check.mustInclude) ? check.mustInclude : []
    const exclude = Array.isArray(check.mustExclude) ? check.mustExclude : []
    if (include.length === 0 && exclude.length === 0) {
      throw new LevelDataError(`${where} 需要 mustInclude 或 mustExclude。`, level.id)
    }
    include.forEach((spec, position) => validatePattern(`${where} mustInclude[${position}]`, spec, level.id))
    exclude.forEach((spec, position) => validatePattern(`${where} mustExclude[${position}]`, spec, level.id))
    // A purely negative check cannot prove the artifact did anything right.
    if (include.length > 0 && include.every((spec) => spec !== null && typeof spec === 'object' && spec.negate === true)) {
      throw new LevelDataError(`${where} 的 mustInclude 至少需要一条正向断言（不能全是 ! 开头的排除项）。`, level.id)
    }
  }
  if (check.kind === 'count') {
    if (typeof check.path !== 'string' || check.path.trim().length === 0) {
      throw new LevelDataError(`${where}（count）缺少 path。`, level.id)
    }
    if (check.match === null || typeof check.match !== 'object') {
      throw new LevelDataError(`${where} 需要 match（要计数的断言）。`, level.id)
    }
    validatePattern(`${where} match`, check.match, level.id)
    const hasMin = Number.isFinite(check.min)
    const hasMax = Number.isFinite(check.max)
    if (!hasMin && !hasMax) {
      throw new LevelDataError(`${where} 需要 min 或 max（至少给一个计数边界）。`, level.id)
    }
    if (hasMin && check.min < 0) throw new LevelDataError(`${where} 的 min 不能为负。`, level.id)
    if (hasMax && check.max < 0) throw new LevelDataError(`${where} 的 max 不能为负。`, level.id)
    if (hasMin && hasMax && check.min > check.max) {
      throw new LevelDataError(`${where} 的 min 不能大于 max。`, level.id)
    }
  }
  if (check.kind === 'dir-has') {
    if (typeof check.glob !== 'string' || check.glob.trim().length === 0) {
      throw new LevelDataError(`${where} 缺少 glob。`, level.id)
    }
    if (!Number.isFinite(check.min) || check.min < 1) {
      throw new LevelDataError(`${where} 的 min 必须是不小于 1 的数字。`, level.id)
    }
  }
  if (check.kind === 'text-matches') {
    if (!Array.isArray(check.patterns) || check.patterns.length === 0) {
      throw new LevelDataError(`${where} 需要非空的 patterns。`, level.id)
    }
    check.patterns.forEach((spec, position) => validatePattern(`${where} patterns[${position}]`, spec, level.id))
  }
}

/**
 * Validate the whole catalog.
 *
 * @param {object[]} levels - raw level definitions.
 * @returns {object[]} the same levels, sorted by `order`, with defaults filled.
 * @throws {LevelDataError} on any malformed field.
 */
export function validateLevels(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new LevelDataError('关卡目录为空。', '')
  }
  const seenIds = new Set()
  const seenOrders = new Set()
  const normalized = levels.map((raw) => {
    if (raw === null || typeof raw !== 'object') throw new LevelDataError('关卡定义必须是对象。', '')
    const level = { ...raw }
    for (const field of ['id', 'chapter', 'title', 'goal', 'brief']) requireString(level, field)
    for (const field of ['tips', 'checks', 'rubric']) requireArray(level, field)

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(level.id)) {
      throw new LevelDataError(`关卡 id 必须是小写连字符形式：${level.id}。`, level.id)
    }
    if (seenIds.has(level.id)) throw new LevelDataError(`关卡 id 重复：${level.id}。`, level.id)
    seenIds.add(level.id)

    if (!Number.isFinite(level.order) || level.order < 1) {
      throw new LevelDataError(`关卡 ${level.id} 的 order 必须是正整数。`, level.id)
    }
    if (seenOrders.has(level.order)) throw new LevelDataError(`关卡 order 重复：${level.order}。`, level.id)
    seenOrders.add(level.order)

    if (typeof level.requiresAI !== 'boolean') level.requiresAI = true

    if (!Number.isFinite(level.passScore) || level.passScore < 0 || level.passScore > 100) {
      throw new LevelDataError(`关卡 ${level.id} 的 passScore 必须在 0–100 之间。`, level.id)
    }

    if (level.rubric.length === 0) throw new LevelDataError(`关卡 ${level.id} 的 rubric 不能为空。`, level.id)
    let weightSum = 0
    const rubricIds = new Set()
    for (const item of level.rubric) {
      if (item === null || typeof item !== 'object') {
        throw new LevelDataError(`关卡 ${level.id} 的 rubric 项必须是对象。`, level.id)
      }
      if (typeof item.id !== 'string' || item.id.length === 0) {
        throw new LevelDataError(`关卡 ${level.id} 的 rubric 项缺少 id。`, level.id)
      }
      if (rubricIds.has(item.id)) {
        throw new LevelDataError(`关卡 ${level.id} 的 rubric id 重复：${item.id}。`, level.id)
      }
      rubricIds.add(item.id)
      if (typeof item.label !== 'string' || item.label.length === 0) {
        throw new LevelDataError(`关卡 ${level.id} 的 rubric 项缺少 label。`, level.id)
      }
      if (!Number.isFinite(item.weight) || item.weight <= 0) {
        throw new LevelDataError(`关卡 ${level.id} 的 rubric 权重必须为正数：${item.id}。`, level.id)
      }
      weightSum += item.weight
    }
    if (weightSum < 0.99 || weightSum > 1.01) {
      throw new LevelDataError(`关卡 ${level.id} 的 rubric 权重之和必须为 1（当前 ${weightSum}）。`, level.id)
    }

    level.checks.forEach((check, index) => validateCheck(level, check, index))

    if (level.submit === null || typeof level.submit !== 'object' || !Array.isArray(level.submit.fields)) {
      throw new LevelDataError(`关卡 ${level.id} 缺少 submit.fields。`, level.id)
    }
    if (level.submit.fields.length === 0) {
      throw new LevelDataError(`关卡 ${level.id} 的 submit.fields 不能为空。`, level.id)
    }
    for (const field of level.submit.fields) {
      if (field === null || typeof field !== 'object') {
        throw new LevelDataError(`关卡 ${level.id} 的提交字段必须是对象。`, level.id)
      }
      if (typeof field.name !== 'string' || field.name.length === 0) {
        throw new LevelDataError(`关卡 ${level.id} 的提交字段缺少 name。`, level.id)
      }
      if (field.type !== 'text' && field.type !== 'artifacts') {
        throw new LevelDataError(`关卡 ${level.id} 的提交字段 ${field.name} 类型非法：${String(field.type)}。`, level.id)
      }
      if (!Number.isFinite(field.maxLength) || field.maxLength < 1) {
        throw new LevelDataError(`关卡 ${level.id} 的提交字段 ${field.name} 缺少 maxLength。`, level.id)
      }
      if (typeof field.label !== 'string' || field.label.length === 0) {
        throw new LevelDataError(`关卡 ${level.id} 的提交字段 ${field.name} 缺少 label。`, level.id)
      }
    }
    if (typeof level.submit.artifactNote !== 'string') level.submit.artifactNote = ''

    return level
  })
  return normalized.sort((left, right) => left.order - right.order)
}

/** Validated catalog, frozen against accidental mutation. */
export const LEVELS = Object.freeze(validateLevels(RAW_LEVELS))

/** Fast lookup by id. */
const BY_ID = new Map(LEVELS.map((level) => [level.id, level]))

/**
 * Find one level.
 *
 * @param {string} id - level id.
 * @returns {object | undefined} the level, when it exists.
 */
export function getLevel(id) {
  return typeof id === 'string' ? BY_ID.get(id) : undefined
}

/**
 * The public catalog projection sent to the browser.
 *
 * @returns {object[]} level summaries in `order` order.
 */
export function catalogPayload() {
  return LEVELS.map((level) => ({
    id: level.id,
    order: level.order,
    chapter: level.chapter,
    title: level.title,
    goal: level.goal,
    brief: level.brief,
    tips: level.tips,
    requiresAI: level.requiresAI,
    passScore: level.passScore,
    submit: level.submit,
    rubric: level.rubric,
    checkSummary: level.checks.map((check) => ({ id: check.id, label: check.label, kind: check.kind })),
  }))
}
