---
id: sensitive-data
order: 5
chapter: 安全与复用
title: 发给 AI 之前，先把敏感信息脱敏
requiresAI: true
passScore: 70
submit:
  fields:
    - name: prompt
      label: 你实际发给 AI 的指令
      type: text
      maxLength: 4000
      placeholder: '例：请基于下面这份"脱敏后"的数据整理成汇总表，注意不要推测真实身份……'
    - name: artifacts
      label: 产物路径（可选，逗号分隔）
      type: artifacts
      maxLength: 500
      placeholder: 'good-at-ai-playground/safe/raw.md, good-at-ai-playground/safe/redacted.md'
  artifactNote: '至少要提交 safe/raw.md（含敏感信息的原始件）与 safe/redacted.md（脱敏件），路径为练习目录内的相对路径'
checks:
  - id: safe-raw-exists
    label: safe/raw.md 存在（含敏感信息的原始件）
    kind: file-exists
    path: safe/raw.md
  - id: safe-raw-has-pii
    label: 原始件里确实含手机号或身份证号（确保这是真练习）
    kind: file-matches
    path: safe/raw.md
    mustInclude:
      - 're:1[3-9]\d{9}|\d{17}[\dXx]'
  - id: safe-exists
    label: safe/redacted.md 存在（脱敏件）
    kind: file-exists
    path: safe/redacted.md
  - id: safe-sections
    label: 脱敏件含"脱敏结果/脱敏说明"两个小节
    kind: file-matches
    path: safe/redacted.md
    mustInclude:
      - 're:^## \S*脱敏结果 @m'
      - 're:^## \S*脱敏说明 @m'
  - id: safe-placeholder-count
    label: 脱敏件里至少 3 处规范占位符
    kind: count
    path: safe/redacted.md
    match: 're:\[(?:姓名|电话|手机|邮箱|身份证|公司|地址|账号|密钥|API[_ ]?KEY|待填|已脱敏)\]'
    min: 3
  - id: safe-mapping-list
    label: 脱敏说明里逐条解释了占位符含义
    kind: count
    path: safe/redacted.md
    match: 're:^\s*[-*]\s+\[ @m'
    min: 3
  - id: safe-no-raw-pii
    label: 脱敏件里不残留手机号与身份证号
    kind: file-matches
    path: safe/redacted.md
    mustInclude:
      - 're:^## \S*脱敏结果 @m'
    mustExclude:
      - 're:1[3-9]\d{9}'
      - 're:\d{17}[\dXx]'
rubric:
  - id: coverage
    label: '识别到位：手机号、身份证、邮箱、真实姓名、公司名、密钥等都识别到了'
    weight: 0.3
  - id: reversibility
    label: '占位符规范：同一实体在全文中用同一个占位符，并给出了对照说明'
    weight: 0.3
  - id: usable
    label: '脱敏后仍可用：保留足够结构，AI 拿到后能完成真实工作'
    weight: 0.25
  - id: honest
    label: '边界诚实：说明了哪些信息"不能进 AI"、为什么'
    weight: 0.15
---

## 目标

学会在把材料交给 AI 之前做**脱敏**：识别敏感信息、替换成规范占位符、给出对照说明，让脱敏后的材料既能被 AI 处理，又不泄露真实身份。

## 任务说明

自己编一段**看起来真实**的材料（可以基于你工作里的格式，但请用假数据），里面要包含至少这些敏感项：真实姓名、手机号、邮箱、身份证号、公司名称、一个密钥或账号。把它写进：

  路径：good-at-ai-playground/safe/raw.md

再产出脱敏件：

  路径：good-at-ai-playground/safe/redacted.md

脱敏件必须满足：

1. 两个二级小节，标题需分别包含「脱敏结果」「脱敏说明」两个词；
2. 「脱敏结果」里至少出现 **3 处规范占位符**，形如 `[姓名]`、`[电话]`、`[邮箱]`、`[身份证]`、`[公司]`、`[地址]`、`[账号]`、`[密钥]`；
3. 「脱敏说明」里用 `- [占位符]：说明` 的形式逐条解释每个占位符（至少 3 条），**同一实体全文必须用同一个占位符**；
4. **脱敏件里不能残留 11 位手机号或 18 位身份证号**——这项是硬检查，出现就判失败。

注意这两个文件的分工：`raw.md` 是**留在本地**的原始记录（检查会确认它确实含真实格式的手机号/身份证号，防止你拿假题糊弄自己）；`redacted.md` 才是准备发给 AI 的那份。

做完后回到本页，点击「刷新产物」确认检查通过，再点「提交判分」。

## 提示

- 顺序很重要：**先脱敏，再发给 AI**。等你把原文贴进对话框就已经来不及了。
- 手机号写成 `[电话1]`、`[电话2]` 而不是全部写成 `[电话]`，这样 AI 还能分辨「这是同一个人还是两个人」。
- 保留结构（几行、字段顺序、金额量级）比保留真值重要——脱敏的目标是「能干活」，不是「能还原」。
- 有些信息**不该脱敏后使用，而是根本不该外发**：完整身份证号、银行卡号、密码、别人的健康信息。这类要在「脱敏说明」里明确写出来。
