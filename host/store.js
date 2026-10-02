/**
 * Progress persistence for the AI 通关 plugin.
 *
 * State lives at `$DSH_HOME/good-at-ai/progress.json`, owned by the plugin (the
 * user's practice artifacts live in the workspace playground instead). Writes
 * are atomic — mkdir, exclusive-create temp file, write, fsync, close, rename —
 * so a host restart or crash mid-write can never leave a half-written file.
 * A corrupt file is renamed aside rather than silently discarded.
 *
 * @module @local/good-at-ai/host/store
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Current on-disk schema version. */
export const STATE_VERSION = 1

/** Empty state for a first run or a recovered corrupt file. */
function emptyState() {
  return { version: STATE_VERSION, levels: {}, updatedAt: null }
}

/**
 * Resolve `$DSH_HOME` the same way the shipped plugins do.
 *
 * @param {{ env?: Record<string, string | undefined>, home?: string }} [env] - injectable environment.
 * @returns {string} absolute DSH home directory.
 */
export function resolveDshHome(env = {}) {
  const environment = env.env ?? process.env
  const home = env.home ?? homedir()
  const configured = typeof environment.DSH_HOME === 'string' ? environment.DSH_HOME.trim() : ''
  return configured.length > 0 ? configured : join(home, '.dsh')
}

/**
 * Atomic JSON writer: temp file in the same directory, fsync, rename.
 *
 * @param {string} filePath - destination file.
 * @param {unknown} value - JSON-serializable value.
 * @throws {Error} when the directory cannot be created or the rename fails.
 */
export function writeJsonAtomic(filePath, value) {
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now().toString(36)}`
  const payload = `${JSON.stringify(value, null, 2)}\n`
  const fd = openSync(tmpPath, 'wx', 0o600)
  try {
    writeSync(fd, payload, null, 'utf8')
    try {
      fsyncSync(fd)
    } catch {
      // fsync is a durability nicety; some Windows filesystems reject it.
    }
  } catch (error) {
    try {
      closeSync(fd)
    } catch {
      // The original failure is the one worth reporting.
    }
    throw error
  } finally {
    try {
      closeSync(fd)
    } catch {
      // Already closed on the error path above.
    }
  }
  renameSync(tmpPath, filePath)
  try {
    const dirFd = openSync(dir, 'r')
    try {
      fsyncSync(dirFd)
    } finally {
      closeSync(dirFd)
    }
  } catch {
    // Directory fsync is unsupported on Windows; durability of the file itself is unaffected.
  }
}

/** Validate and normalize one persisted level record. */
function normalizeLevelRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const attempts = Number.isFinite(value.attempts) ? Math.max(0, Math.trunc(value.attempts)) : 0
  const bestScore = Number.isFinite(value.bestScore) ? Math.min(100, Math.max(0, Math.trunc(value.bestScore))) : null
  return {
    passed: value.passed === true,
    bestScore,
    attempts,
    lastAt: typeof value.lastAt === 'string' ? value.lastAt : null,
    lastVerdict: value.lastVerdict && typeof value.lastVerdict === 'object' ? value.lastVerdict : null,
    judgeModel: typeof value.judgeModel === 'string' ? value.judgeModel : null,
  }
}

/** Validate and normalize a whole persisted state document. */
function normalizeState(value) {
  const state = emptyState()
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return state
  const levels = value.levels && typeof value.levels === 'object' && !Array.isArray(value.levels) ? value.levels : {}
  for (const [id, record] of Object.entries(levels)) {
    const normalized = normalizeLevelRecord(record)
    if (normalized !== undefined) state.levels[id] = normalized
  }
  state.updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : null
  return state
}

/**
 * Create the progress store.
 *
 * Reading is lazy and cached; a corrupt document is renamed to
 * `progress.json.corrupt-<ts>` and replaced by an empty state so the plugin
 * keeps working and the user can inspect what was there.
 *
 * @param {{ dir?: string, filePath?: string, env?: Record<string, string | undefined>, home?: string }} [options] - injectable location.
 * @returns {object} the store handle.
 */
export function createStore(options = {}) {
  const dir = options.dir ?? join(resolveDshHome(options), 'good-at-ai')
  const filePath = options.filePath ?? join(dir, 'progress.json')
  let cache = null
  /** @type {{ path: string, reason: string } | null} */
  let lastRecovery = null

  /** Load state from disk, recovering from corruption at most once per call. */
  function load() {
    if (cache !== null) return cache
    if (!existsSync(filePath)) {
      cache = emptyState()
      return cache
    }
    let raw
    try {
      raw = readFileSync(filePath, 'utf8')
    } catch (error) {
      lastRecovery = { path: filePath, reason: `读取失败：${error instanceof Error ? error.message : String(error)}` }
      cache = emptyState()
      return cache
    }
    try {
      cache = normalizeState(JSON.parse(raw))
      return cache
    } catch (error) {
      const quarantined = `${filePath}.corrupt-${Date.now()}`
      let reason = `解析失败：${error instanceof Error ? error.message : String(error)}`
      try {
        renameSync(filePath, quarantined)
        reason += `（已隔离为 ${quarantined}）`
      } catch {
        reason += '（隔离重命名失败，将以空进度继续）'
      }
      lastRecovery = { path: filePath, reason }
      cache = emptyState()
      return cache
    }
  }

  /** Persist the in-memory state atomically. */
  function save(next) {
    const state = next ?? cache ?? emptyState()
    state.version = STATE_VERSION
    state.updatedAt = new Date().toISOString()
    writeJsonAtomic(filePath, state)
    cache = state
    return state
  }

  return {
    /** Absolute path of the progress document (exposed by `/health` for debugging). */
    filePath,
    /** Directory holding the progress document. */
    dir,

    /** @returns {object} a detached copy of the current state. */
    snapshot() {
      const state = load()
      return {
        version: state.version,
        updatedAt: state.updatedAt,
        levels: JSON.parse(JSON.stringify(state.levels)),
      }
    },

    /**
     * Read one level's record.
     *
     * @param {string} levelId - level id.
     * @returns {object | null} the record, or null when the level has no history.
     */
    getLevel(levelId) {
      const state = load()
      const record = state.levels[levelId]
      return record === undefined ? null : JSON.parse(JSON.stringify(record))
    },

    /**
     * Record one judged attempt and persist it.
     *
     * @param {string} levelId - level id.
     * @param {{ pass: boolean, score: number | null, judgeModel: string | null, verdict?: unknown }} attempt - the settled verdict.
     * @returns {object} the updated level record.
     */
    recordAttempt(levelId, attempt) {
      const state = load()
      const previous = state.levels[levelId] ?? {
        passed: false,
        bestScore: null,
        attempts: 0,
        lastAt: null,
        lastVerdict: null,
        judgeModel: null,
      }
      const score = Number.isFinite(attempt.score) ? Math.min(100, Math.max(0, Math.trunc(attempt.score))) : null
      const next = {
        passed: previous.passed === true || attempt.pass === true,
        bestScore: score === null ? previous.bestScore : Math.max(previous.bestScore ?? 0, score),
        attempts: previous.attempts + 1,
        lastAt: new Date().toISOString(),
        lastVerdict: attempt.verdict ?? null,
        judgeModel: attempt.judgeModel ?? previous.judgeModel,
      }
      state.levels[levelId] = next
      save(state)
      return JSON.parse(JSON.stringify(next))
    },

    /** Clear every level record and persist. */
    reset() {
      cache = emptyState()
      return save(cache)
    },

    /** @returns {{ path: string, reason: string } | null} the last corruption recovery, if any. */
    recovery() {
      return lastRecovery
    },
  }
}
