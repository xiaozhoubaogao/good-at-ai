#!/usr/bin/env node
/**
 * Validate every level file without starting the plugin.
 *
 * A level file is parsed when the host half applies, so one YAML typo stops the
 * whole plugin from mounting — and then no route (not even `/health`) exists to
 * explain why. This script surfaces the same errors up front, with the file,
 * line, and offending source line, so a typo is fixable before a restart.
 *
 * Usage: node scripts/check-levels.mjs [levelsDir]
 *
 * @module @local/good-at-ai/scripts/check-levels
 */

import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LevelFileError } from '../host/mdlite.js'
import { YamlError } from '../host/yaml.js'
import { LEVELS_DIR, LevelDataError, validateLevels } from '../levels/index.js'
import { loadLevelFiles } from '../host/mdlite.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(process.argv[2] ?? LEVELS_DIR)

/** Print one failure in the `file:line reason` form with context. */
function report(error, fileById) {
  const fromLevel = error.levelId !== undefined && error.levelId !== '' ? fileById.get(error.levelId) : undefined
  const displayPath = error.displayPath ?? error.sourceFile ?? error.path ?? fromLevel ?? target
  const shown = String(displayPath).startsWith(repoRoot) ? relative(repoRoot, String(displayPath)) : String(displayPath)
  process.stderr.write(`✖ ${shown}:${error.line ?? 1} ${error.reason ?? error.message}\n`)
  if (typeof error.sourceLine === 'string' && error.sourceLine.trim().length > 0) {
    process.stderr.write(`    ${error.sourceLine.trim()}\n`)
  }
}

let fileById = new Map()
try {
  const { levels, files } = loadLevelFiles(target)
  fileById = new Map(levels.map((level, index) => [level.id, files[index]]))
  validateLevels(levels)
  process.stdout.write(`✔ ${files.length} 个关卡文件全部通过校验：${files.join('、')}\n`)
  for (const level of levels) {
    process.stdout.write(
      `  - ${String(level.order).padStart(2)} ${level.id.padEnd(16)} ${level.checks.length} 项检查 / ${level.rubric.length} 项评分维度\n`,
    )
  }
} catch (error) {
  if (error instanceof LevelFileError || error instanceof YamlError || error instanceof LevelDataError) {
    report(error, fileById)
  } else {
    process.stderr.write(`✖ 校验失败：${error instanceof Error ? error.stack : String(error)}\n`)
  }
  process.stderr.write(`\n提示：关卡文件格式见 ${join('levels', 'FORMAT.md')}\n`)
  process.exit(1)
}
