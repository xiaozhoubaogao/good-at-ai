---
id: code-script
order: 8
chapter: AI 编程技巧
title: 让 AI 写出带注释、可读的命令行脚本
requiresAI: true
passScore: 70
submit:
  fields:
    - name: prompt
      label: 你实际发给 AI 的指令
      type: text
      maxLength: 4000
      placeholder: '例：请在 good-at-ai-playground/scripts/ 下创建 wordcount.py……'
    - name: artifacts
      label: 产物路径（可选，逗号分隔）
      type: artifacts
      maxLength: 500
      placeholder: 'good-at-ai-playground/scripts/wordcount.py'
  artifactNote: '产物必须是练习目录内的相对路径：good-at-ai-playground/scripts/wordcount.py'
checks:
  - id: script-exists
    label: scripts/wordcount.py 存在
    kind: file-exists
    path: scripts/wordcount.py
  - id: script-shebang
    label: 第一行是 shebang
    kind: file-matches
    path: scripts/wordcount.py
    mustInclude:
      - 're:^#!\/usr\/bin\/env python3'
    mustExclude:
      - 're:TODO|FIXME'
  - id: script-cli-input
    label: 从命令行参数读取文件路径
    kind: file-matches
    path: scripts/wordcount.py
    mustInclude:
      - 're:sys\.argv|argparse'
  - id: script-functions
    label: 含至少一个带注释或 docstring 的函数
    kind: file-matches
    path: scripts/wordcount.py
    mustInclude:
      - 're:def \w+\s*\('
      - 're:def \w+\s*\([^)]*\)\s*:\s*("""|#) @s'
  - id: script-wordcount-core
    label: 使用 Counter 或排序取前 10
    kind: file-matches
    path: scripts/wordcount.py
    mustInclude:
      - 're:Counter\(|most_common\(|\[:10\]'
  - id: scripts-dir-has-python
    label: scripts 目录下至少有一个 Python 文件
    kind: dir-has
    path: scripts
    glob: '**/*.py'
    min: 1
rubric:
  - id: runnable-cli
    label: '命令行接口清晰：能接收文件路径并对缺失文件给出可读报错'
    weight: 0.3
  - id: wordcount
    label: '词频逻辑正确：输出频率最高的 10 个词及其次数'
    weight: 0.3
  - id: readable
    label: '可读性：有注释/docstring，命名清晰，没有半成品标记'
    weight: 0.25
  - id: instruction
    label: '指令质量：给 AI 的提示词把接口、依赖库与输出格式都约束住了'
    weight: 0.15
---

## 目标

学会用提示词约束代码的结构与接口，并用文件证据核验 AI 是否真的写了可运行的脚本。

## 任务说明

请在 dsh 的新会话里，让 AI 在练习目录中创建脚本文件：

  路径：good-at-ai-playground/scripts/wordcount.py

脚本必须满足：

1. 第一行是 shebang（#!/usr/bin/env python3）；
2. 从命令行参数读取一个文本文件路径，文件不存在时给出清晰报错（不能直接崩溃）；
3. 统计该文件中出现频率最高的 10 个词并打印（每个词带次数）；
4. 至少有一个带 docstring 或注释的函数，函数与变量命名可读；
5. 不要留下 TODO / FIXME 之类的半成品。

本关只检查源码，不执行脚本（所以请确保代码本身正确、可读）。
做完后回到本页，点击「刷新产物」确认检查通过，再点「提交判分」。

## 提示

- 提示词里写清「用 sys.argv 读路径」或「用 argparse」，AI 的接口设计会更稳定。
- 要求它「用 collections.Counter」往往比让它自己造轮子更可靠。
- 让它「给出使用示例命令」，你就能判断接口是否符合预期。
- 如果脚本路径写错（例如放到 good-at-ai-playground 根目录），直接让 AI 移动或重建。
