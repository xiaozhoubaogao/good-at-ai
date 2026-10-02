---
id: mini-project
order: 9
chapter: 小项目交付
title: 让 AI 交付一个可复现的小工具
requiresAI: true
passScore: 70
submit:
  fields:
    - name: prompt
      label: 你实际发给 AI 的指令
      type: text
      maxLength: 4000
      placeholder: '例：请写一个脚本，读入 sample.txt，按行统计重复次数并输出 sorted.txt，要求只依赖标准库……'
    - name: artifacts
      label: 产物路径（可选，逗号分隔）
      type: artifacts
      maxLength: 500
      placeholder: 'good-at-ai-playground/project/tool.py, good-at-ai-playground/project/sample.txt, good-at-ai-playground/project/run.md, good-at-ai-playground/project/result.md'
  artifactNote: '至少要提交 tool.py 与 run.md，路径均为练习目录内的相对路径'
checks:
  - id: project-script
    label: project/tool.py 存在
    kind: file-exists
    path: project/tool.py
  - id: project-script-shebang
    label: 脚本第一行是 shebang
    kind: file-matches
    path: project/tool.py
    mustInclude:
      - 're:^#!\/usr\/bin\/env python3'
  - id: project-sample
    label: 提供了测试输入 sample.txt
    kind: file-exists
    path: project/sample.txt
  - id: project-run-record
    label: project/run.md 存在（运行记录）
    kind: file-exists
    path: project/run.md
  - id: project-run-sections
    label: 运行记录含"命令/输出/结论"三个小节
    kind: file-matches
    path: project/run.md
    mustInclude:
      - 're:^## \S*命令 @m'
      - 're:^## \S*输出 @m'
      - 're:^## \S*结论 @m'
  - id: project-run-has-command
    label: 记录里给出了可直接复制的执行命令
    kind: count
    path: project/run.md
    match: 're:python3? '
    min: 1
  - id: project-result
    label: project/result.md 存在（产物报告）
    kind: file-exists
    path: project/result.md
rubric:
  - id: decomposition
    label: '拆解与落地：从需求到文件结构都交代清楚，别人拿到就能跑'
    weight: 0.3
  - id: usable
    label: '工具可用：接口清晰、异常有处理、只依赖标准库或已说明的依赖'
    weight: 0.3
  - id: evidence
    label: '证据完整：run.md 里有真实命令与真实输出，result.md 的内容能被这些证据支撑'
    weight: 0.25
  - id: delivery
    label: '交付规范：说明了怎么用（参数、示例），并如实标注了已知限制'
    weight: 0.15
---

## 目标

把前面学的技能合成一次完整交付：让 AI 做出一个**别人也能跑起来**的小工具，并且用真实运行证据证明它确实能工作。

## 任务说明

选一个真有用的小工具（例如：统计文本词频、把 CSV 某列汇总、批量重命名、把 Markdown 转成清单……），在练习目录里交付一套文件：

```
good-at-ai-playground/project/
  tool.py      ← 可执行脚本
  sample.txt   ← 你准备的测试输入
  run.md       ← 运行记录
  result.md    ← 产物报告
```

要求：

1. `tool.py` 第一行是 shebang（`#!/usr/bin/env python3`）；
2. `sample.txt` 是真实可用的测试输入，不是空文件；
3. `run.md` 含「命令」「输出」「结论」三个二级小节，**`命令` 小节里要出现 `python3 tool.py …` 这样的可复制命令**；
4. `run.md` 的「输出」要把**真实运行结果**贴进去（不是"应该会输出…"）；
5. `result.md` 是基于运行结果写的产物报告（数据来源标注清楚）。

**先跑，再写记录。** 本关不替你执行脚本，所以你要自己在 dsh 里跑（或者用终端），把真实结果贴进 `run.md`。

做完后回到本页，点击「刷新产物」确认检查通过，再点「提交判分」。

## 提示

- 在提示词里就把**交付物清单**定死（四个文件、每个文件写什么），AI 才不会只丢一段代码给你。
- 要求「只依赖标准库」，否则别人跑不起来；真需要第三方库，让 AI 在 `run.md` 里写清安装命令。
- 让 AI 同时生成 `sample.txt`，但**你要自己看一眼**内容是否合理——它常会造一份刚好能跑通、但毫无代表性的样例。
- `result.md` 里每个数字都要能追到「输出」小节那一行，追不到的就别写。
