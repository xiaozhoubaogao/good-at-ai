---
id: decompose-task
order: 4
chapter: 迭代与拆解
title: 大任务拆成小步骤，一次只让 AI 做一件事
requiresAI: true
passScore: 70
submit:
  fields:
    - name: prompt
      label: 你实际发给 AI 的指令
      type: text
      maxLength: 4000
      placeholder: '例：请先只做第一步——把需求拆成步骤清单，不要开始写内容……'
    - name: artifacts
      label: 产物路径（可选，逗号分隔）
      type: artifacts
      maxLength: 500
      placeholder: 'good-at-ai-playground/decompose/plan.md'
  artifactNote: '产物必须是练习目录内的相对路径：good-at-ai-playground/decompose/plan.md'
checks:
  - id: decompose-exists
    label: decompose/plan.md 存在
    kind: file-exists
    path: decompose/plan.md
  - id: decompose-heading
    label: 含一级标题
    kind: file-matches
    path: decompose/plan.md
    mustInclude:
      - 're:^# \S @m'
  - id: decompose-sections
    label: 含"总任务/步骤/验收"三个小节
    kind: file-matches
    path: decompose/plan.md
    mustInclude:
      - 're:^## \S*总任务 @m'
      - 're:^## \S*步骤 @m'
      - 're:^## \S*验收 @m'
  - id: decompose-step-count
    label: 步骤数在 4–8 个之间
    kind: count
    path: decompose/plan.md
    match: 're:^### \S @m'
    min: 4
    max: 8
  - id: decompose-step-io
    label: 至少两条步骤写明了输入与输出
    kind: count
    path: decompose/plan.md
    match: 're:输入[：:]|输出[：:]'
    min: 2
  - id: decompose-has-acceptance
    label: 验收标准里给出了可核对的判据
    kind: file-matches
    path: decompose/plan.md
    mustInclude:
      - 're:检查清单|可对照|必须包含|可验证|核对'
rubric:
  - id: decomposition
    label: '拆解合理：每步只做一件事，粒度均衡，没有"剩下都做完"这种巨型步骤'
    weight: 0.3
  - id: interfaces
    label: '接口清楚：写明了每步的输入与输出，上一步的产物就是下一步的输入'
    weight: 0.3
  - id: acceptance
    label: '验收明确：每步或整体都有可核对的完成判据'
    weight: 0.25
  - id: single-shot
    label: '一次一事：指令体现出"先做这一步、确认后再继续"，而不是一次丢出全部要求'
    weight: 0.15
---

## 目标

学会把「帮我做个 X」这种大任务，拆成 AI 能一次做对的小步骤，并说清每步的输入、输出和完成判据。

## 任务说明

选一个**真的有点大**的任务（例如：整理一份含 5 个议题的会议纪要并生成行动计划；把一个 Excel 里的数据整理成月度报告；给一个小网站加一个带校验的表单）。任务太小练不出拆解能力。

先让 AI 帮你拆（或者你自己拆完后让 AI 检查），然后把结果写进文件：

  路径：good-at-ai-playground/decompose/plan.md

文件必须满足：

1. 一个一级标题；
2. 三个二级小节，标题需分别包含「总任务」「步骤」「验收」三个词；
3. 「步骤」小节里用 `### ` 三级标题写出**4–8 个**步骤；
4. 至少两步里写明 `输入：` 和 `输出：`；
5. 「验收」小节要有**可核对的判据**（用「检查清单 / 可对照 / 必须包含 / 可验证 / 核对」这类词）。

**重要**：在提示词里要体现「一次只做一步」——先让 AI 只输出计划、你确认后再让它执行第一步，而不是把所有要求一次性丢过去。

做完后回到本页，点击「刷新产物」确认检查通过，再点「提交判分」。

## 提示

- 好步骤的标志：**有明确产出物**。写不出「这一步产出什么」，说明这步还没拆清楚。
- 步骤之间最好能串成链：第 2 步的输入就是第 1 步的输出，断了说明漏了一步。
- 4–8 步是刻意的约束：少于 4 步通常是没拆开，多于 8 步通常是拆太碎、可以合并。
- 在提示词里加一句「如果发现缺步骤，先告诉我缺哪一步，不要自己补着做」，能显著减少跑偏。
