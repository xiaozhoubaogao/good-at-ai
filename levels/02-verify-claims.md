---
id: verify-claims
order: 2
chapter: 核实与验证
title: 让 AI 给结论，也让它给证据
requiresAI: true
passScore: 70
submit:
  fields:
    - name: prompt
      label: 你实际发给 AI 的指令
      type: text
      maxLength: 4000
      placeholder: '例：请帮我核实下面关于 X 的说法，每条都要给出可查证的来源……'
    - name: summary
      label: 你的核实结论（可选，一两句）
      type: text
      maxLength: 1000
      placeholder: '例：三条说法里有一条是过时的，已按官方文档修正……'
    - name: artifacts
      label: 产物路径（可选，逗号分隔）
      type: artifacts
      maxLength: 500
      placeholder: 'good-at-ai-playground/verify/claims.md'
  artifactNote: '产物必须是练习目录内的相对路径：good-at-ai-playground/verify/claims.md'
checks:
  - id: verify-exists
    label: verify/claims.md 存在
    kind: file-exists
    path: verify/claims.md
  - id: verify-heading
    label: 含一级标题
    kind: file-matches
    path: verify/claims.md
    mustInclude:
      - 're:^# \S @m'
  - id: verify-sections
    label: 含"待核实清单/核实过程/结论"三个小节
    kind: file-matches
    path: verify/claims.md
    mustInclude:
      - 're:^## \S*待核实 @m'
      - 're:^## \S*核实过程 @m'
      - 're:^## \S*结论 @m'
  - id: verify-count-claims
    label: 至少 3 条待核实说法
    kind: count
    path: verify/claims.md
    match: 're:^\s*(?:[-*]|\d+\.)\s+\S @m'
    min: 3
  - id: verify-has-source
    label: 至少给出一条可查证的来源（Markdown 链接或"来源："标注）
    kind: file-matches
    path: verify/claims.md
    mustInclude:
      - 're:\[[^\]]+\]\(https?://|来源[:：]|出处[:：]'
  - id: verify-has-verdict
    label: 对说法给出了明确判定
    kind: file-matches
    path: verify/claims.md
    mustInclude:
      - 're:确认|正确|属实|有误|错误|过时|不支持|存疑'
rubric:
  - id: evidence
    label: '证据充分：每类说法都能指向可查证的来源，而不是"我觉得"'
    weight: 0.35
  - id: verdict
    label: '判定明确：说清哪条成立、哪条不成立或存疑，并给出正确说法'
    weight: 0.3
  - id: trap
    label: '识别出至少一个真实风险点（过时数据/无来源断言/张冠李戴）'
    weight: 0.2
  - id: method
    label: '方法可复现：记录了"怎么核实的"，别人能照着做'
    weight: 0.15
---

## 目标

学会不把 AI 的话当结论：要求它给出可查证的来源，自己动手核对，并明确区分「已被证实的」「存疑的」「被推翻的」。

## 任务说明

选一个你真正关心、且**有正确答案**的话题，让 AI 给出 3–5 条具体说法（带数字、日期、版本号、结论的那类，不要「AI 很有用」这种废话）。

然后逐条核实，把过程写进文件：

  路径：good-at-ai-playground/verify/claims.md

文件必须满足：

1. 一个一级标题；
2. 三个二级小节，标题需分别包含「待核实」「核实过程」「结论」三个词；
3. 「待核实」小节里至少 3 条编号或列表项的说法；
4. 至少给出一条**可查证的来源**：Markdown 链接 `[标题](https://…)`，或 `来源：` / `出处：` 标注；
5. 「结论」小节对每条说法给出明确判定（例如「正确」「有误」「过时」「存疑」），错了的要写出正确说法。

**核实手段要落到实处**，比如：查官方文档/官网、看你本机 `node -v` 之类能一次跑出结果的命令、打开源码文件确认。不要用「再问一遍 AI」当作核实。

做完后回到本页，点击「刷新产物」确认检查通过，再点「提交判分」。

## 提示

- 在提示词里就要求 AI「每条都要给出来源，没有来源的明确标注"无来源"」，这样你才知道该核实哪几条。
- 优先挑**会过期**的信息（版本号、价格、默认值、API 行为），这类最容易出错，也最容易验证。
- 文件里把「原始说法」原样抄下来再写判定，不然过几天你自己都记不清在核什么。
- 允许结论是「存疑」——如实标注比强行下结论更像专业做法。
