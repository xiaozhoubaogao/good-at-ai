/**
 * Path resolution and confinement for the practice playground.
 *
 * The host half uses native `node:fs` and is NOT subject to the agent fs
 * sandbox (the dsh fs sandbox fences agents, not plugins), so confinement has
 * to be enforced here explicitly: every path that reaches the filesystem goes
 * through {@link resolveInside}, which rejects absolute paths, drive letters,
 * UNC prefixes, `..` segments, NUL bytes, and symlink escapes.
 *
 * @module @local/good-at-ai/host/paths
 */

import { realpathSync, lstatSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/** Basename of the practice directory created inside the workspace. */
export const PLAYGROUND_DIRNAME = 'good-at-ai-playground'

/** Environment variable that overrides the resolved playground root. */
export const PLAYGROUND_ENV = 'GOOD_AT_AI_PLAYGROUND'

/**
 * A rejected path. Carries a machine-readable code plus a Chinese, actionable
 * message so the route layer can surface it verbatim.
 */
export class PathError extends Error {
  /**
   * @param {string} code - machine-readable reason.
   * @param {string} message - user-facing message.
   * @param {string} [input] - the offending input, echoed for diagnosis.
   */
  constructor(code, message, input) {
    super(message)
    this.name = 'PathError'
    this.code = code
    if (input !== undefined) this.input = input
  }
}

/** True when the platform's filesystem is case-insensitive (Windows/macOS). */
function caseInsensitiveFs() {
  return process.platform === 'win32' || process.platform === 'darwin'
}

/** Normalize a path for comparison according to platform case sensitivity. */
function canonicalForCompare(path) {
  const normalized = resolve(path)
  return caseInsensitiveFs() ? normalized.toLowerCase() : normalized
}

/**
 * Whether `child` resolves inside (or equals) `parent`.
 *
 * @param {string} parent - absolute container path.
 * @param {string} child - absolute candidate path.
 * @returns {boolean} true when the containment holds.
 */
export function isInside(parent, child) {
  const p = canonicalForCompare(parent)
  const c = canonicalForCompare(child)
  if (p === c) return true
  return c.startsWith(p.endsWith(sep) ? p : p + sep)
}

/**
 * Walk up from `path` to the nearest existing ancestor.
 *
 * @param {string} path - absolute path that may not exist.
 * @returns {string} the path itself when it exists, else its nearest existing ancestor.
 */
export function nearestExistingAncestor(path) {
  let current = resolve(path)
  for (;;) {
    try {
      lstatSync(current)
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) return current
      current = parent
    }
  }
}

/**
 * Realpath a path even when its tail does not exist yet (creation case).
 *
 * @param {string} path - absolute path.
 * @returns {string} the realpath of the nearest existing ancestor joined with the missing tail.
 */
export function realpathDeep(path) {
  const absolute = resolve(path)
  try {
    return realpathSync(absolute)
  } catch {
    const ancestor = nearestExistingAncestor(absolute)
    let real
    try {
      real = realpathSync(ancestor)
    } catch {
      real = ancestor
    }
    return join(real, relative(ancestor, absolute))
  }
}

/**
 * Validate one caller-supplied relative path and confine it to the playground.
 *
 * @param {string} root - absolute playground root (confinement fence).
 * @param {unknown} relativePath - caller-supplied relative path.
 * @param {{ allowEmpty?: boolean }} [options] - `allowEmpty` permits the root itself.
 * @returns {string} the confined absolute path.
 * @throws {PathError} when the input is malformed or escapes the root.
 */
export function resolveInside(root, relativePath, options = {}) {
  if (typeof relativePath !== 'string') {
    throw new PathError('path-invalid', '路径必须是字符串。')
  }
  const raw = relativePath.trim()
  if (raw.length === 0) {
    if (options.allowEmpty === true) return resolve(root)
    throw new PathError('path-invalid', '路径不能为空。')
  }
  if (raw.includes('\0')) {
    throw new PathError('path-invalid', '路径不能包含空字节。', raw)
  }
  if (isAbsolute(raw) || /^[A-Za-z]:/.test(raw) || raw.startsWith('\\\\') || raw.startsWith('//')) {
    throw new PathError('path-outside-playground', '只允许练习目录内的相对路径，已拒绝绝对路径。', raw)
  }
  const segments = raw.split(/[\\/]+/).filter((segment) => segment.length > 0 && segment !== '.')
  if (segments.some((segment) => segment === '..')) {
    throw new PathError('path-outside-playground', '路径不能包含 “..”，已拒绝越界路径。', raw)
  }

  const rootReal = realpathDeep(root)
  const target = resolve(rootReal, ...segments)
  const targetReal = realpathDeep(target)
  if (!isInside(rootReal, targetReal)) {
    throw new PathError('path-outside-playground', '该路径经符号链接解析后落在练习目录之外，已拒绝。', raw)
  }
  return targetReal
}

/**
 * Ensure the playground root exists.
 *
 * @param {string} root - absolute playground root.
 * @returns {{ ok: true } | { ok: false, error: { code: string, message: string, path: string, cause: string } }}
 */
export function ensurePlayground(root) {
  try {
    mkdirSync(root, { recursive: true })
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'playground-unavailable',
        message: `无法创建练习目录：${root}`,
        path: root,
        cause: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

/**
 * Resolve the playground root from config, environment, or well-known defaults.
 *
 * Precedence: explicit `config.playgroundDir` → `GOOD_AT_AI_PLAYGROUND` →
 * `<pluginDir>/good-at-ai-playground` → `<cwd>/good-at-ai-playground`. The
 * plugin-directory candidate comes before cwd so a `dsh web` process started
 * from an unrelated directory still lands next to the user's workspace when the
 * plugin itself lives there.
 *
 * @param {{ playgroundDir?: unknown }} config - resolved plugin config.
 * @param {{ env?: Record<string, string | undefined>, cwd?: string, pluginDir?: string }} [env] - injectable environment.
 * @returns {{ root: string, source: 'config' | 'env' | 'plugin-dir' | 'cwd', candidates: string[] }} the chosen root and every considered candidate.
 */
export function resolvePlaygroundRoot(config = {}, env = {}) {
  const environment = env.env ?? process.env
  const cwd = env.cwd ?? process.cwd()
  const pluginDir = env.pluginDir
  const candidates = []

  const fromConfig = typeof config.playgroundDir === 'string' ? config.playgroundDir.trim() : ''
  const fromEnv = typeof environment[PLAYGROUND_ENV] === 'string' ? environment[PLAYGROUND_ENV].trim() : ''

  if (fromConfig.length > 0) {
    const root = resolve(fromConfig)
    candidates.push(root)
    return { root, source: 'config', candidates }
  }
  if (fromEnv.length > 0) {
    const root = resolve(fromEnv)
    candidates.push(root)
    return { root, source: 'env', candidates }
  }
  if (typeof pluginDir === 'string' && pluginDir.length > 0) {
    candidates.push(resolve(pluginDir, PLAYGROUND_DIRNAME))
    const root = resolve(pluginDir, PLAYGROUND_DIRNAME)
    candidates.push(resolve(cwd, PLAYGROUND_DIRNAME))
    return { root, source: 'plugin-dir', candidates }
  }
  const root = resolve(cwd, PLAYGROUND_DIRNAME)
  candidates.push(root)
  return { root, source: 'cwd', candidates }
}
