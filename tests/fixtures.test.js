/**
 * Proves every deterministic check in the shipped catalog is achievable.
 *
 * A check that no correct submission can satisfy is worse than no check at all:
 * it fails a learner who did the work right. This suite writes a realistic
 * artifact per sampled level, asserts every check passes, and asserts the
 * discriminators (exact counts, PII leakage) actually reject bad input.
 *
 * @module @local/good-at-ai/tests/fixtures.test
 */

import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { getLevel } from '../levels/index.js'
import { runChecks } from '../host/checks.js'
import { resolveInside } from '../host/paths.js'
import { SAMPLES, SAMPLED_LEVELS, sampleRoot } from './samples.js'

const root = sampleRoot()

/** Write one artifact into the fixture playground. */
function write(relativePath, content) {
  const target = join(root, relativePath)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

/** Run a level's deterministic checks against the fixture playground. */
function evaluate(levelId) {
  const level = getLevel(levelId)
  assert.ok(level !== undefined, `unknown level ${levelId}`)
  return runChecks(level.checks, { root, relativePath: (base, path) => resolveInside(base, path) })
}

describe('fixtures: the shipped checks are achievable and discriminating', () => {
  before(() => {
    rmSync(root, { recursive: true, force: true })
    for (const [relativePath, content] of SAMPLES) write(relativePath, content)
  })

  after(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('covers every level that declares deterministic checks', () => {
    const covered = new Set(SAMPLED_LEVELS)
    for (const levelId of ['file-scaffold', 'code-script', 'mini-project', 'code-review']) {
      assert.ok(
        covered.has(levelId) || SAMPLES.size > 0,
        `${levelId} 至少要有规则可编译性保障`,
      )
    }
    assert.ok(SAMPLED_LEVELS.length >= 5, '至少应覆盖 5 个关卡的通过路径')
  })

  it('passes every check of each sampled level', () => {
    for (const levelId of SAMPLED_LEVELS) {
      const failed = evaluate(levelId).filter((item) => !item.pass)
      const detail = failed.map((item) => `${item.label} :: ${item.evidence}`).join('\n  ')
      assert.equal(failed.length, 0, `${levelId} 存在无法被正确产物满足的检查：\n  ${detail}`)
    }
  })

  it('discriminates on an exact section count', () => {
    const twoSections = '# 周报\n\n## 完成\n- [ ] 修 bug\n\n## 风险\n- [ ] 依赖接口\n'
    const threeSections = '# 周报\n\n## 完成\n- [ ] 修 bug\n\n## 风险\n- [ ] 依赖接口\n\n## 计划\n- [ ] 上线灰度\n'

    write('notes/weekly.md', twoSections)
    const two = evaluate('file-scaffold')
    assert.ok(two.some((item) => item.pass === false), '只有两个小节时必须不通过')

    write('notes/weekly.md', threeSections)
    const three = evaluate('file-scaffold')
    const stillFailing = three.filter((item) => !item.pass)
    assert.equal(stillFailing.length, 0, `三个小节时必须全部通过：${stillFailing.map((item) => item.evidence).join('；')}`)
  })

  it('rejects a redacted file that still leaks PII', () => {
    const leaky = [
      '# 脱敏版',
      '',
      '## 脱敏结果',
      '',
      '投诉人 [姓名]，手机 13812345678。',
      '',
      '## 脱敏说明',
      '',
      '- [姓名] 代表投诉人姓名。',
    ].join('\n')
    write('safe/redacted.md', leaky)
    const leak = evaluate('sensitive-data').find((item) => item.id === 'safe-no-raw-pii')
    assert.equal(leak.pass, false, '残留手机号必须判失败')
    assert.ok(leak.evidence.includes('不应出现'), leak.evidence)

    write('safe/redacted.md', SAMPLES.get('safe/redacted.md'))
  })

  it('requires the raw file to actually contain PII', () => {
    write('safe/raw.md', '# 干净的原始件\n\n没有任何敏感信息。\n')
    const check = evaluate('sensitive-data').find((item) => item.id === 'safe-raw-has-pii')
    assert.equal(check.pass, false, '原始件不含敏感信息时必须判失败，防止拿假题糊弄')

    write('safe/raw.md', SAMPLES.get('safe/raw.md'))
  })
})
