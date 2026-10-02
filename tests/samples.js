/**
 * Realistic artifact fixtures for the deterministic-check tests.
 *
 * These are written to a temporary playground by `fixtures.test.js` so that
 * every shipped check can be exercised against a submission that a competent
 * learner would actually produce.
 *
 * @module @local/good-at-ai/tests/samples
 */

import { join } from 'node:path'

/** Playground root the fixtures are written into. */
export function sampleRoot() {
  return join(process.env.TEMP ?? process.env.TMP ?? '/tmp', 'gaai-check-fixtures')
}

/** Levels whose full pass path is covered by these fixtures. */
export const SAMPLED_LEVELS = Object.freeze([
  'verify-claims',
  'iterate-refine',
  'decompose-task',
  'sensitive-data',
  'reusable-template',
])

/** A literal backtick, kept out of the template strings below. */
const B = String.fromCharCode(96)

/** Relative artifact path → file content. */
export const SAMPLES = new Map([
  [
    'verify/claims.md',
    [
      '# 关于 Node.js 的三条说法核实',
      '',
      '## 待核实清单',
      '',
      '1. Node.js 24 是当前的 LTS 版本，长期支持到 2028 年。',
      '2. Node.js 默认缓存 ES 模块，第二次 import 不会重新执行。',
      '3. Node.js 内置了 fetch，不需要安装 node-fetch。',
      '',
      '## 核实过程',
      '',
      '- 说法 1：查了官方发布页 [Node.js Releases](https://nodejs.org/en/about/previous-releases)，24 是 Current，LTS 仍是 22。',
      `- 说法 2：本机 ${B}node -v${B} 显示 v24.19.0，用脚本 import 同一模块两次，发现只执行一次。`,
      '- 说法 3：官方文档 [Global fetch](https://nodejs.org/api/globals.html#fetch) 说明自 18 起提供。',
      '',
      '来源：nodejs.org 官方文档与本地实测。',
      '',
      '## 结论',
      '',
      '- 说法 1：**有误**。正确说法是当前 LTS 为 22.x。',
      '- 说法 2：**正确**，ES 模块确有缓存。',
      '- 说法 3：**正确**，自 Node 18 起内置。',
    ].join('\n'),
  ],
  [
    'iterate/rounds.md',
    [
      '# 把会议纪要变成待办清单的迭代过程',
      '',
      '## 初始指令',
      '',
      '请把下面的会议纪要整理成待办清单。',
      '',
      '## 问题诊断',
      '',
      '第一版输出**过于笼统**：所有事项混在一起，没有负责人，也**缺少**截止时间；',
      '其中两条其实是讨论而非行动项，属于**跑偏**。',
      '',
      '## 调整后的指令与结果',
      '',
      '调整：把「整理成待办清单」**改成**「输出 Markdown 表格，列为事项|负责人|截止时间」，',
      '并**补上**约束「没有负责人的写待确认」。第二轮仍有遗漏，于是再次**调整**：',
      '**明确要求**每条以动词开头，并去掉纯讨论条目。两轮后输出可直接分派。',
    ].join('\n'),
  ],
  [
    'decompose/plan.md',
    [
      '# 把季度数据整理成月报：任务拆解',
      '',
      '## 总任务',
      '',
      '把三个月的原始 CSV 整理成一份带图表的月度经营报告。',
      '',
      '## 步骤',
      '',
      '### 步骤 1：盘点数据源',
      '',
      '输入：三个原始 CSV 文件。',
      '输出：一份字段清单，标注含义与缺失率。',
      '',
      '### 步骤 2：定义口径',
      '',
      '输入：字段清单。',
      '输出：指标口径表。',
      '',
      '### 步骤 3：清洗与汇总',
      '',
      '输入：原始 CSV 与口径表。',
      '输出：清洗后的明细表与按月汇总表。',
      '',
      '### 步骤 4：生成报告',
      '',
      '输入：按月汇总表。',
      '输出：Markdown 月报，含三个图表与文字结论。',
      '',
      '## 验收',
      '',
      '检查清单：每条结论都能追到汇总表某一列；三个图表的数据源可对照；',
      '必须包含环比与同比两个口径。',
    ].join('\n'),
  ],
  [
    'safe/raw.md',
    [
      '# 客户投诉记录（原始件，禁止外发）',
      '',
      '投诉人张三，手机 13812345678，邮箱 zhangsan@example.com，',
      '身份证 11010119900307123X，任职于北京某某科技有限公司，',
      '工单密钥 sk-live-9f3a2b7c8d1e。',
    ].join('\n'),
  ],
  [
    'safe/redacted.md',
    [
      '# 客户投诉记录（脱敏版）',
      '',
      '## 脱敏结果',
      '',
      '投诉人 [姓名]，手机 [电话1]，邮箱 [邮箱1]，',
      '身份证 [身份证]，任职于 [公司1]，',
      '工单密钥 [密钥]。',
      '',
      '## 脱敏说明',
      '',
      '- [姓名] 代表投诉人真实姓名，同一人全篇用同一占位符。',
      '- [电话1] 代表投诉人手机号，多人时依次编号。',
      '- [邮箱1] 代表投诉人邮箱。',
      '- [身份证]、[公司1]、[密钥] 分别代表身份证号、任职公司与工单密钥；',
      '  其中完整身份证号与密钥不应外发。',
    ].join('\n'),
  ],
  [
    'reuse/template.md',
    [
      '# 周报生成模板',
      '',
      '## 适用场景',
      '',
      '适用于每周固定的团队周报；项目复盘类文档不适用，因为重点不同。',
      '',
      '## 模板',
      '',
      '你是我的项目助理。请基于下面的 {{本周数据}}，为 {{读者对象}} 生成周报。',
      '要求：按 {{关注重点}} 组织内容，输出 Markdown，含「完成/风险/下周计划」三节。',
      '',
      '## 使用说明',
      '',
      '- {{本周数据}}：本周的原始记录或表格，直接粘贴即可。',
      '- {{读者对象}}：周报给谁看，例如团队全员或部门负责人。',
      '- {{关注重点}}：本周最需要被看到的内容，例如进度风险。',
      '',
      '## 示例',
      '',
      '你是我的项目助理。请基于下面的本周 Jira 导出记录，为部门负责人 生成周报。',
      '要求：按 进度风险与资源缺口 组织内容，输出 Markdown，含「完成/风险/下周计划」三节。',
    ].join('\n'),
  ],
  ['project/tool.py', '#!/usr/bin/env python3\n"""统计文本词频。"""\nimport sys\n'],
  ['project/sample.txt', 'alpha beta alpha\n'],
  [
    'project/run.md',
    [
      '# 词频工具运行记录',
      '',
      '## 命令',
      '',
      'python3 tool.py sample.txt',
      '',
      '## 输出',
      '',
      'alpha 2',
      'beta 1',
      '',
      '## 结论',
      '',
      '脚本按预期运行，只依赖标准库，输出与 sample.txt 内容一致。',
    ].join('\n'),
  ],
  ['review/target.py', 'def parse(path):\n    data = open(path).read()\n    return data.split(",")\n'],
  [
    'review/review.md',
    [
      '# 对 parse() 的代码审查',
      '',
      '## 审查结论',
      '',
      '整体可读但鲁棒性不足，不适合直接用于真实日志。',
      '',
      '## 问题清单',
      '',
      `- 第 1 行 ${B}parse()${B} 没有 docstring，调用者不知道 path 期望什么格式。（轻微）`,
      `- 第 2 行 ${B}open(path)${B} 没指定编码，遇非 UTF-8 日志会抛 UnicodeDecodeError，属**中等**问题。`,
      '- 第 2 行文件句柄未关闭，虽然 CPython 会回收，但显式 with 更安全。',
      '- 按逗号切分对含逗号的字段会错位，属**严重**问题，日志字段常含逗号。',
      "- 空文件时返回 ['']，调用方不检查长度会算出错误结果。",
      '',
      '## 验证方式',
      '',
      '准备空文件与含逗号字段的文件分别运行；再用 GBK 编码日志复现解码异常。',
    ].join('\n'),
  ],
])
