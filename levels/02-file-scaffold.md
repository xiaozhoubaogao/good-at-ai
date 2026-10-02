---
id: file-scaffold
order: 2
chapter: 操作文件技巧
title: 让 AI 在指定目录建一份结构化周报
requiresAI: true
passScore: 70
submit:
  fields:
    - name: prompt
      label: 你实际发给 AI 的指令
      type: text
      maxLength: 4000
      placeholder: '例：请在 good-at-ai-playground/notes/ 下创建 weekly.md……'
    - name: artifacts
      label: 产物路径（可选，逗号分隔）
      type: artifacts
      maxLength: 500
      placeholder: 'good-at-ai-playground/notes/weekly.md'
  artifactNote: '产物必须是练习目录内的相对路径：good-at-ai-playground/notes/weekly.md'
checks:
  - id: weekly-exists
    label: notes/weekly.md 存在
    kind: file-exists
    path: notes/weekly.md
  - id: weekly-heading
    label: 含一个一级标题（行首 "# "）
    kind: file-matches
    path: notes/weekly.md
    mustInclude:
      - 're:^# \S @m'
  - id: weekly-section-count
    label: 恰好三个二级小节（"## " 标题）
    kind: count
    path: notes/weekly.md
    match: 're:^## \S @m'
    min: 3
    max: 3
  - id: weekly-sections
    label: 含二级小节且没有更深的四级标题
    kind: file-matches
    path: notes/weekly.md
    mustInclude:
      - 're:^## \S @m'
    mustExclude:
      - 're:^#### \S @m'
  - id: weekly-todos
    label: 含至少一条待办（"- [ ] " 或 "- [x] "）
    kind: file-matches
    path: notes/weekly.md
    mustInclude:
      - 're:^\s*[-*] \[[ xX]\] \S @m'
  - id: notes-has-markdown
    label: notes 目录下至少有一个 Markdown 文件
    kind: dir-has
    path: notes
    glob: '**/*.md'
    min: 1
rubric:
  - id: structure
    label: '结构达标：一级标题 + 三个二级小节，层级正确'
    weight: 0.3
  - id: actionable
    label: '待办可执行：每条有具体动作，而不是空泛词语'
    weight: 0.3
  - id: instruction
    label: '指令质量：给 AI 的提示词交代了路径、结构与内容要求'
    weight: 0.25
  - id: authentic
    label: '内容真实：与真实工作相关，没有占位符或敷衍文本'
    weight: 0.15
---

## 目标

学会把「在哪个目录、生成什么文件、包含哪些结构」讲清楚，并用文件系统的真实结果验证 AI 是否照做。

## 任务说明

请在 dsh 的新会话里，让 AI（不是你自己动手）在练习目录中创建文件：

  路径：good-at-ai-playground/notes/weekly.md

文件必须满足：

1. 一个一级标题（# ...）；
2. 三个二级小节（## ...），小节名自定，但每个小节都要有实际含义（例如「本周完成」「风险与阻塞」「下周计划」）；
3. 每个二级小节下至少一条待办条目，用 `- [ ] ` 开头；
4. 内容与你自己的真实工作相关，不要占位符（禁止「TODO」「示例文本」这类敷衍内容）。

做完后回到本页，点击「刷新产物」确认检查通过，再点「提交判分」。

## 提示

- 提示词里把路径、文件名、结构要求一次说清，AI 就不需要来回追问。
- 示例：让 AI「创建 good-at-ai-playground/notes/weekly.md，包含一个一级标题、三个二级小节，每节至少一条 - [ ] 待办」。
- 如果 AI 建错了目录，直接告诉它「放到 notes/ 下，不要放在根目录」再让它重做。
- 「刷新产物」只读取文件证据；判定反馈里会逐条列出通过或失败的原因。
