---
id: iterate-refine
order: 3
chapter: 迭代与拆解
title: 第一版不达标时，别只说"再改改"
requiresAI: true
passScore: 70
submit:
  fields:
    - name: prompt
      label: 你的初始指令
      type: text
      maxLength: 4000
      placeholder: '例：请把下面这段会议纪要整理成待办清单……'
    - name: artifacts
      label: 产物路径（可选，逗号分隔）
      type: artifacts
      maxLength: 500
      placeholder: 'good-at-ai-playground/iterate/rounds.md'
  artifactNote: '产物必须是练习目录内的相对路径：good-at-ai-playground/iterate/rounds.md'
checks:
  - id: iterate-exists
    label: iterate/rounds.md 存在
    kind: file-exists
    path: iterate/rounds.md
  - id: iterate-heading
    label: 含一级标题
    kind: file-matches
    path: iterate/rounds.md
    mustInclude:
      - 're:^# \S @m'
  - id: iterate-three-sections
    label: 恰好三个小节（初始指令 / 问题诊断 / 调整后的指令与结果）
    kind: count
    path: iterate/rounds.md
    match: 're:^## \S @m'
    min: 3
    max: 3
  - id: iterate-has-adjust
    label: 记录了至少一处明确的调整点
    kind: file-matches
    path: iterate/rounds.md
    mustInclude:
      - 're:调整|改成|补上|去掉|约束|明确要求'
  - id: iterate-has-problem
    label: 说明了第一版哪里不行
    kind: file-matches
    path: iterate/rounds.md
    mustInclude:
      - 're:过于笼统|不足|缺少|不符合|跑偏|错误|遗漏|太笼统'
  - id: iterate-quotes-both
    label: 同一条内容里同时出现初始与调整后的对照
    kind: file-matches
    path: iterate/rounds.md
    mustInclude:
      - 're:初始指令.*调整后|调整后.*初始指令 @s'
rubric:
  - id: diagnosis
    label: '诊断具体：指出第一版输出到底哪里不对，而不是"感觉不好"'
    weight: 0.3
  - id: delta
    label: '调整有效：每一次调整都针对诊断出的问题，改完效果确实变好'
    weight: 0.35
  - id: rounds
    label: '至少两轮真实迭代，能看出逐步收敛的过程'
    weight: 0.2
  - id: comparable
    label: '对照清晰：初始指令与调整后指令可直接对照，别人能复现你的改法'
    weight: 0.15
---

## 目标

掌握「看输出 → 定位问题 → 针对性调整指令」的循环。学会把「不行」翻译成**具体的、可执行的修改要求**，而不是让 AI 反复猜。

## 任务说明

挑一个你手上真实的活儿（整理纪要、写周报、改文案、生成代码都行），按下面三步做，并把过程写进文件：

  路径：good-at-ai-playground/iterate/rounds.md

文件必须满足：

1. 一个一级标题；
2. **恰好三个**二级小节，建议写成「初始指令」「问题诊断」「调整后的指令与结果」；
3. 「问题诊断」要说清第一版输出**具体哪里不行**（用「过于笼统 / 缺少 / 跑偏 / 遗漏」这类词描述）；
4. 「调整后的指令与结果」里要写出你**改了哪一处**（用「调整 / 改成 / 补上 / 去掉 / 约束」这类词）；
5. 至少做 **2 轮**迭代：第 3 节里要能看出两次以上的调整，不是一次到位。

关键要求：**「初始指令」和「调整后的指令」要能直接对照**，让人看出你每次到底加/减了什么。同一份文件里两者都要出现。

做完后回到本页，点击「刷新产物」确认检查通过，再点「提交判分」。

## 提示

- 别用「再详细一点」这种模糊要求。改成「每条待办后面补上负责人和截止时间，缺失的写『待确认』」——AI 才知道要动什么。
- 定位问题的好办法：先自己说清「我期望的输出长什么样」，再拿实际输出逐项对。
- 如果连续两轮都没改善，说明问题可能出在任务本身太大，先拆步骤（见下一关）。
- 记录时保留**失败的那一版**，它比成功版更能体现你的判断力。
