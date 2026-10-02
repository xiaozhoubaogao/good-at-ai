# 关卡文件格式（`levels/*.md`）

一个关卡 = 一个 Markdown 文件。**机器可读的部分全部写在文件开头的 frontmatter 里，写给人看的题目讲解写在正文里。**

```
levels/
  01-prompt-role.md      ← 关卡 1
  02-file-scaffold.md    ← 关卡 2
  03-code-script.md      ← 关卡 3
  FORMAT.md              ← 本文件（不会被当成关卡加载）
  index.js               ← 加载器，不需要改
```

加一关 = **新建一个 `.md` 文件**。不用改 `index.js`，不用注册，不用写 JS。文件名以 `.md` 结尾、排在最前面，加载顺序按文件名排序（真正的顺序由 `order` 决定）。

改完**必须重启 Desktop**（宿主半区变更不会热重载）。改之前先跑一次校验，能省掉一次重启：

```powershell
node scripts/check-levels.mjs      # 或 pnpm run check:levels
```

---

## 文件骨架

```markdown
---
id: my-level              # 必填，小写连字符，也是 API 里的 levelId
order: 4                  # 必填，正整数，唯一
chapter: 提示词技巧        # 必填，左侧列表的分组名
title: 我的关卡            # 必填，关卡标题
passScore: 70             # 必填，0–100 通过线
requiresAI: true          # 可选，默认 true（UI 上显示「本关会调用模型判分」）
submit:                   # 必填，提交表单
  fields:
    - name: prompt
      label: 你实际发给 AI 的指令
      type: text          # text（长文本）或 artifacts（产物路径）
      maxLength: 4000
      placeholder: '例：……'   # 可选
  artifactNote: '产物必须是练习目录内的相对路径'
checks: []                # 必填，可以是空列表（纯模型评审）
rubric:                   # 必填，权重之和必须为 1
  - id: a
    label: 维度 A
    weight: 0.6
  - id: b
    label: 维度 B
    weight: 0.4
systemPromptExtra: ''     # 可选，追加到本关评审提示词末尾的额外条款
---

## 目标

一句话目标（必填，会显示在关卡详情顶部）。

## 任务说明

给学员看的完整任务描述（必填，支持多段、列表、表格、代码块）。

## 提示

- 每行一条提示（可选，`- ` 开头）
- 这些会显示在「任务与提示」页
```

**正文段的规则**：`## 目标`、`## 任务说明`、`## 提示` 三段有语义；其它 `##` 段会被忽略，你可以随便写备忘。这三段的标题必须完全一致（`## 目标` 不能写成 `## 目的地`）。

---

## 检查规则（`checks`）

每项检查都是一条「在练习目录里找硬证据」的规则。练习目录是 `good-at-ai-playground/`，所有 `path` 都是**相对它**的路径，禁止 `..` 和绝对路径。

### 断言迷你语言（所有匹配规则都用它）

写成一个引号包起来的字符串：

| 写法 | 含义 | 例 |
|---|---|---|
| `'文本'` | 内容包含这段纯文本（不解释正则） | `'- [ ] '` |
| `'re:正则'` | 内容匹配这个正则 | `'re:^# \S'` |
| `'!文本'` | 内容**不得**包含 | `'!TODO'` |
| `'!re:正则'` | 内容**不得**匹配 | `'!re:FIXME\|WIP'` |
| `'re:正则 @标志'` | 带正则标志 | `'re:^## \S @m'` |

正则标志只支持 `i`（忽略大小写）、`m`（`^`/`$` 匹配每行）、`s`（`.` 匹配换行）、`u`。
**标志必须写成 `@m` 这种后缀**，写内联的 `(?m)` 会直接报错——JavaScript 不支持内联标志，这正是最容易踩的坑。

### 四种检查

```yaml
checks:
  # 1) 文件存在
  - id: script-exists
    label: scripts/wordcount.py 存在
    kind: file-exists
    path: scripts/wordcount.py

  # 2) 文件内容匹配（mustInclude 至少要有一条正向断言）
  - id: script-shebang
    label: 第一行是 shebang
    kind: file-matches
    path: scripts/wordcount.py
    mustInclude:
      - 're:^#!\/usr\/bin\/env python3'
    mustExclude:
      - 're:TODO|FIXME'

  # 3) 目录下有匹配该 glob 的文件，数量达到 min
  - id: notes-has-markdown
    label: notes 目录下至少有一个 Markdown 文件
    kind: dir-has
    path: notes
    glob: '**/*.md'
    min: 1

  # 4) 在子树里按文件找内容（至少有一处命中即可）
  - id: notes-section-title
    label: 至少出现一个二级小节标题
    kind: text-matches
    path: notes
    patterns:
      - 're:(?<=## )[^\s#]'

  # 5) 计数：匹配次数落在区间内（min / max 至少给一个）
  - id: weekly-section-count
    label: 恰好三个二级小节
    kind: count
    path: notes/weekly.md
    match: 're:^## \S @m'
    min: 3
    max: 3
```

`count` 是唯一能**精确计数**的检查，用它把「正好三个小节」「至少两个函数」这类要求变成硬检查，而不是交给模型猜。

### 检查的通用约定

- `id` 在同一关内唯一；`label` 会显示在判定反馈里，写清「在查什么」。
- 判定合并规则：**任何一项检查失败 → 整关不通过**，模型只能补理由。
- 路径写错（越界、绝对路径）会在检查时报错并把该项判为失败，不会静默跳过。
- 单文件最多读 256 KiB、单次提交合计最多 2 MiB、最多扫 200 个文件；超限按「失败」处理。

---

## 评分维度（`rubric`）

模型评审的依据。**权重之和必须等于 1**（允许 0.99–1.01 的浮点误差），否则加载报错。

```yaml
rubric:
  - id: structure      # 唯一
    label: 结构达标：一级标题 + 三个二级小节
    weight: 0.3
```

`passScore` 是总分（0–100）通过线，与权重无关，一起参与判定。

---

## 可选：给评审加针对性条款

`systemPromptExtra` 会被追加到该关的评审提示词末尾，用来补充通用条款覆盖不到的判分原则：

```yaml
systemPromptExtra: |
  本关特别注意：如果提交里出现了「示例」「比如」这类占位词，
  即使结构完整也要在 authentic 维度扣分。
```

最多 2000 字。**不要**试图用它改写评委人格或反作弊条款——那些是所有关卡共用的，改不了。

---

## YAML 支持范围（自研子集解析器）

支持：

- 缩进嵌套的映射与列表（`- ` 列表项）
- 单引号 `'…'`（内部 `''` 表示一个引号）、双引号 `"…"`（支持 `\n \t \" \\`）
- 裸文本、整数 / 小数、`true` / `false` / `null` / `~`
- 空列表 / 空映射写成 `[]` / `{}`
- `#` 注释（整行或行尾，行尾注释前必须有空格）
- 多行文本 `|`（保留换行）与 `>`（折成一行），可加 `-` 去掉末尾换行
- `\n` 与 `\r\n` 换行

**不支持，且会明确报错（不会猜）**：

| 写法 | 报错 |
|---|---|
| Tab 缩进 | `不允许用 Tab 缩进` |
| `&锚点` / `*别名` | `不支持锚点/别名` |
| `!!标签` | `不支持 YAML 标签` |
| `{a: 1}` / `[1, 2]`（非空 flow） | `不支持 flow 风格` |
| frontmatter 里再出现 `---` | `不支持多文档` |
| 内联嵌套列表 `- - 1` | `不支持内联嵌套序列`（改写成 `- -` 换行 + 缩进） |
| 同一个键写两次 | `键重复` |

**值的引号规则**：值里含 `#`（且前面有空格）、`: `（半角冒号加空格）、`@` 之类容易误读的字符时，用引号包起来。中文全角冒号「：」不受影响。

---

## 常见错误对照

| 报错 | 原因 | 改法 |
|---|---|---|
| `文件必须以 --- 开头的 frontmatter 块开始` | 第一行是空行或直接写正文 | 补上 `---` |
| `frontmatter 没有闭合：缺少结束的 ---` | 忘了写第二个 `---` | 补上 |
| `正文缺少 ## 目标 段（或该段为空）` | 标题名写错或段落为空 | 改成 `## 目标` 并写内容 |
| `正则无法编译：(?s)…` | 用了内联标志 | 改成 `@s` 后缀 |
| `的 mustInclude 至少需要一条正向断言` | 全是 `!` 开头的排除项 | 加一条正向断言 |
| `需要 min 或 max` | `count` 没给边界 | 加 `min` / `max` |
| `的 rubric 权重之和必须为 1（当前 0.9）` | 权重没配平 | 调整到和为 1 |
| `关卡 order 重复` | 两个关卡同一个 `order` | 改成不同的正整数 |
| `缺少 submit 段` | 没写提交表单 | 补 `submit.fields` |

拿不准就先跑 `node scripts/check-levels.mjs`：它会打印**文件名 + 行号 + 出错的那一行原文**。
