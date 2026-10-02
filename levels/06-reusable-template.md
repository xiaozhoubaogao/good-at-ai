---
id: reusable-template
order: 6
chapter: 安全与复用
title: 把一次成功变成一个能反复用的模板
requiresAI: true
passScore: 70
submit:
  fields:
    - name: prompt
      label: 你实际发给 AI 的指令
      type: text
      maxLength: 4000
      placeholder: '例：请把下面这段提示词改写成一个模板，把变量部分换成 {{占位符}}……'
    - name: artifacts
      label: 产物路径（可选，逗号分隔）
      type: artifacts
      maxLength: 500
      placeholder: 'good-at-ai-playground/reuse/template.md'
  artifactNote: '产物必须是练习目录内的相对路径：good-at-ai-playground/reuse/template.md'
checks:
  - id: reuse-exists
    label: reuse/template.md 存在
    kind: file-exists
    path: reuse/template.md
  - id: reuse-heading
    label: 含一级标题
    kind: file-matches
    path: reuse/template.md
    mustInclude:
      - 're:^# \S @m'
  - id: reuse-sections
    label: 含"适用场景/模板/使用说明/示例"四个小节
    kind: file-matches
    path: reuse/template.md
    mustInclude:
      - 're:^## \S*适用场景 @m'
      - 're:^## \S*模板 @m'
      - 're:^## \S*使用说明 @m'
      - 're:^## \S*示例 @m'
  - id: reuse-placeholders
    label: 模板里至少 3 个 {{占位符}}
    kind: count
    path: reuse/template.md
    match: 're:\{\{\s*[^}]+\s*\}\}'
    min: 3
  - id: reuse-placeholder-distinct
    label: 至少 3 个互不相同的占位符含义
    kind: count
    path: reuse/template.md
    match: 're:^\s*[-*]\s+\{\{ @m'
    min: 3
  - id: reuse-has-example
    label: 示例小节给了填好占位符的真实例子
    kind: file-matches
    path: reuse/template.md
    mustInclude:
      - 're:## \S*示例 @m'
      - 're:## \S*示例\n+\S @s'
rubric:
  - id: reusability
    label: '真的可复用：换一组输入就能用，没有残留具体人名、日期、一次性细节'
    weight: 0.35
  - id: variables
    label: '变量设计合理：占位符覆盖了所有变化点，含义在说明里写清楚'
    weight: 0.3
  - id: instructions
    label: '使用说明完整：写清填什么、注意什么、什么情况下不适用'
    weight: 0.2
  - id: example
    label: '示例有说服力：填好占位符后能直接拿去用'
    weight: 0.15
---

## 目标

把你已经验证过的那条提示词，提炼成一个**带占位符、能反复复用**的模板，并写清适用边界。

## 任务说明

先想一个你以后**还会反复做**的任务（每周周报、每次代码评审、每份客户回复……）。把你已经调好用的那条提示词改造成模板，写进文件：

  路径：good-at-ai-playground/reuse/template.md

文件必须满足：

1. 一个一级标题；
2. 四个二级小节，标题需分别包含「适用场景」「模板」「使用说明」「示例」四个词；
3. 「模板」里至少 **3 个** `{{占位符}}`（形如 `{{对象}}`、`{{上下文}}`）；
4. 「使用说明」里用列表逐条解释每个占位符（每行以 `- {{` 开头），至少 3 条；
5. 「示例」小节给出一个**占位符都填好**的真实例子。

做完后回到本页，点击「刷新产物」确认检查通过，再点「提交判分」。

## 提示

- 判断哪些该做成占位符：**换个场景就会变的部分**（人、时间、范围、口径）；不变的规则和验收标准留在模板正文里。
- 「适用场景」里要写清**什么情况下别用这个模板**——没有边界的模板早晚会被误用。
- 占位符名字写有意义：`{{本周数据}}` 比 `{{input}}` 好，别人一眼知道填什么。
- 一个好判据：把模板交给同事，他不看你的解释也能填对。做不到就说明说明没写清。
