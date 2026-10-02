---
id: code-review
order: 10
chapter: 小项目交付
title: 在信之前先审：把 AI 写的代码过一遍
requiresAI: true
passScore: 70
submit:
  fields:
    - name: prompt
      label: 你让 AI 写代码时用的指令
      type: text
      maxLength: 4000
      placeholder: '例：请写一个函数，按行读取日志文件并统计各状态码次数……'
    - name: artifacts
      label: 产物路径（可选，逗号分隔）
      type: artifacts
      maxLength: 500
      placeholder: 'good-at-ai-playground/review/target.py, good-at-ai-playground/review/review.md'
  artifactNote: '至少要提交 review/review.md，路径为练习目录内的相对路径'
checks:
  - id: review-target
    label: review/target.py 存在（被审查的 AI 代码）
    kind: file-exists
    path: review/target.py
  - id: review-report
    label: review/review.md 存在（审查报告）
    kind: file-exists
    path: review/review.md
  - id: review-heading
    label: 审查报告含一级标题
    kind: file-matches
    path: review/review.md
    mustInclude:
      - 're:^# \S @m'
  - id: review-sections
    label: 含"审查结论/问题清单/验证方式"三个小节
    kind: file-matches
    path: review/review.md
    mustInclude:
      - 're:^## \S*审查结论 @m'
      - 're:^## \S*问题清单 @m'
      - 're:^## \S*验证 @m'
  - id: review-findings
    label: 问题清单里至少 4 条发现
    kind: count
    path: review/review.md
    match: 're:^\s*(?:[-*]|\d+\.)\s+\S @m'
    min: 4
  - id: review-severity
    label: 至少 2 条标注了严重程度
    kind: count
    path: review/review.md
    match: 're:严重|高危|中等|轻微|低危|P[0-2]'
    min: 2
  - id: review-has-location
    label: 至少 3 条指出具体位置（函数名或行号）
    kind: count
    path: review/review.md
    match: 're:第\s*\d+\s*行|L\d+|`\w+\(\)`|`\w+`\s*函数'
    min: 3
rubric:
  - id: real-findings
    label: '发现是真的：指出的问题确实存在于那份代码里，不是泛泛而谈'
    weight: 0.3
  - id: reasoning
    label: '说清后果：每条都解释「什么情况下会出问题」，而不是只贴标签'
    weight: 0.3
  - id: verification
    label: '验证方法可行：给出了具体的重现步骤或反例输入'
    weight: 0.25
  - id: honesty
    label: '诚实：也指出了写得好的地方与自己的不确定项'
    weight: 0.15
---

## 目标

养成「先审再信」的习惯：拿到 AI 写的代码，能主动找出真实缺陷，说清触发条件，并给出可执行的验证方法。

## 任务说明

让 AI 写一段**有一定复杂度**的代码（例如：解析日志统计状态码、读 CSV 做汇总、处理时间戳换算），存成：

  路径：good-at-ai-playground/review/target.py

然后**不要运行它**，用阅读的方式审查一遍（这是刻意的：阅读能力比跑一遍更难也更值钱），把结果写进：

  路径：good-at-ai-playground/review/review.md

文件必须满足：

1. 一个一级标题；
2. 三个二级小节，标题需分别包含「审查结论」「问题清单」「验证」三个词；
3. 「问题清单」里至少 **4 条**列表项；
4. 至少 **2 条**标注了严重程度（用「严重 / 高危 / 中等 / 轻微 / 低危 / P0-P2」这类词）；
5. 至少 **3 条**指出具体位置（写法如 `第 12 行`、`L12`、`` `parse_log()` ``）。

审查要覆盖这些角度：边界情况（空文件、缺字段、编码）、异常处理、资源释放、命名与可读性、有没有硬编码、单位/时区/精度、以及**它自称做了但实际没做的事**。

做完后回到本页，点击「刷新产物」确认检查通过，再点「提交判分」。

## 提示

- 找问题的高效顺序：**先看边界**（空/极长/缺列/非 UTF-8），再看异常路径，最后才看风格。
- 让 AI 自己写代码时，别在提示词里写「注意处理异常」，否则你就是在审查自己的要求——让它自由发挥，问题才暴露得真实。
- 「验证」小节写**最小反例**：例如「给一个只有表头没有数据行的 CSV，第 8 行会抛 ZeroDivisionError」。
- 如果确实没找到 4 个真问题，就别硬凑——换一段更复杂的代码重来，或者把「鲁棒性不足」这类问题按不同触发条件拆开写。
- 报告里也写一句「哪里写得好」，这既是诚实，也证明你真的读进去了。
