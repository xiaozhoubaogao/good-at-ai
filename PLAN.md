# AI 通关 · dsh-plugin-good-at-ai — 可行性结论 + 实施方案

> 状态：方案已确认，尚未开始编码。本文件是唯一事实来源（single source of truth），后续按文末里程碑推进。

---

## 0. 可行性结论（结论先行）

**可行。** 你方案的三个关键假设，都在本机真实产物里有证据：

| 假设 | 结论 | 证据 |
|---|---|---|
| 能把一整页网页塞进 dsh | ✅ 官方槽位 `conversation.view` 可占主区域整页 | `~/.dsh/plugins/xz-tools/client.js:620` 就用它渲染「My Skills」整页 |
| 三方插件 UI 能真跑起来 | ✅ 两个已装机插件为证 | `~/.dsh/plugins/dsh-plugin-todo/client.js`（侧栏标签页）、`~/.dsh/plugins/dsh-plugin-background/client.js`（设置页 + 主题覆盖） |
| 插件能用 dsh 的 AI 审核任务 | ✅ 宿主半区可直接调 `ctx.llm.stream()` | rc.7 镜像 `packages/llm/llm/src/index.ts:913`；一次性调用范例 `packages/session/session-title-llm/src/index.ts:271-288` |
| 插件能给网页提供后端 | ✅ `ctx.webServer.register({kind,path,handler})` | `~/.dsh/plugins/xz-tools/index.js:81` 在跑 `/api/xz-skills/list` |

**三个必须认下的现实约束：**

1. **没有第三方插件直接调过 `ctx.llm`**（zhu1090093659/dsh-web-ui 全家桶 `ctx.llm` 零命中，它们走 `ctx.apiProxy` 开会话）。API 可用、官方包在用，但我们是第一个这么用的三方插件 → 失败与返回格式必须自己兜。
2. **`ctx.llm` 没有 JSON/结构化输出开关**，且模型报错**不抛异常**，而是以终止块 `{type:'finish',reason:{kind:'error'}}` 结束 → 必须流式收集 + 容错解析 + 一次修复重试。
3. **当前会话 shell 是坏的**：工作区 Windows 文件权限拦住沙箱授权（`SetNamedSecurityInfoW failed (Win32 5): grantWrite(D:\gitee\Good_At_AI)`），连 `pwd` 都跑不动 → 修复前 pnpm/node/dsh 一个都跑不了，装机与验收无从进行。这是「第 1 步」。

> 设计修正（相对最初构想）：练习目录**放工作区内** `<workspace>\good-at-ai-playground\`，不放 `~/.dsh`。原因：dsh 的 fs 沙箱 `workspaceRoot = process.cwd()`（`packages/bundle/base/cordis.patch.yml:172-176`），只允许在 workspace 内写；放 `~/.dsh` 会导致**用户自己会话里的 AI 根本没法在那里建文件**。放工作区内，插件宿主（原生 `node:fs`，不受该围栏约束）与用户的 agent 两边都能读写。

---

## 1. 方案总览

```
┌─ 浏览器半区 client.js（单文件、无构建、React.createElement）
│    conversation.view 整页：关卡地图 → 关卡详情 → 提交 → 判分反馈 → 进度
│    fetch /api/good-at-ai/*
└───────────────┬──────────────────────────────────────────
                │ 同源 loopback HTTP
┌───────────────┴──────────────────────────────────────────
│  宿主半区 index.js（cordis 插件，inject: ['webServer','llm']）
│   routes.js   /catalog /state /submit /health
│   checks.js   确定性检查（文件存在/内容匹配/文件数）
│   judge.js    ctx.llm.stream() + 评审 JSON 解析（含修复重试）
│   store.js    $DSH_HOME/good-at-ai/progress.json（原子写）
│   paths.js    练习目录解析 + 路径封闭校验
│   levels/*.js 关卡数据（纯数据，不改代码即可加关卡）
└──────────────────────────────────────────────────────────
```

判分 = **混合管线**：先跑确定性检查拿硬证据 → 再让模型按 rubric 判分 → 合并成一条可解释的判定。

---

## 2. 文件与模块清单（全部新建于 `D:\gitee\Good_At_AI`）

```
PLAN.md                # 本方案
package.json           # name: dsh-plugin-good-at-ai, dsh.bundle.patch + dsh.client, dependencies: {}（零 npm 依赖）
cordis.patch.yml       # - insert: - {id: good-at-ai, name: dsh-plugin-good-at-ai}
index.js               # 宿主入口：export name / inject / Config / apply
client.js              # 浏览器入口：window.__ModuleLoader__.load({id, factory})，自包含
shared/api.js          # API 前缀等常量（仅宿主导入；client.js 内联同名常量）
host/routes.js         # 四个路由 + loopback/同源守卫 + body 上限
host/checks.js         # 确定性检查执行器（纯函数，可单测）
host/judge.js          # ctx.llm 调用 + 模型选择 + verdict 解析
host/store.js          # 进度读写（原子写）
host/paths.js          # 练习目录/状态目录解析 + 路径封闭
levels/index.js        # 关卡目录聚合 + 数据校验
levels/01-prompt-role.js / 02-file-scaffold.js / 03-code-script.js
tests/*.test.js        # node --test
README.md              # 安装/卸载/调试/加关卡指南
```

零构建、零 npm 依赖是**刻意选择**：本机已装的两个可用插件都是手写纯 JS（`~/.dsh/plugins/xz-tools/package.json`、`~/.dsh/plugins/dsh-plugin-todo/package.json`），这样 `dsh plugin add link:` 不需要联网拉 `@deepseek-ai/*` SDK，也不需要 pnpm 跑构建。

---

## 3. 宿主半区契约

- 入口形态：`export const name / inject = ['webServer','llm'] / Config / apply(ctx, config = {})`，注册走 `ctx.effect(...)`。
  **坑**：loader 会先用 schema 默认值填充再调 `apply`，`apply` 不得对「未配置」做 eager 校验（`docs/plugins.md:150` 的官方陷阱）。
- 路由（`kind:'exact'`，前缀 `/api/good-at-ai`）：

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/health` | 返回解析出的评审模型 `{provider,model}` 或可读错误 |
| GET | `/catalog` | 关卡目录 + 提交字段 + 提示 + 评分维度 + 评审模型信息 |
| GET | `/state` | 进度快照 |
| POST | `/submit` | `{requestId, levelId, answer}` → 判定结果 |
| POST | `/reset` | 开发/自测清进度（可配置关闭） |

- 守卫：loopback 来源 + 同源标记 + `Host` 合法（精简自 `dsh-task-board/src/host-routes.ts:101-111`）；body 上限 128 KiB（框架无限制，必须自拦）；`/submit` 按 `requestId` 幂等回放。
- 模型选择：config `judge:{provider,model}` → 否则 `ctx.llm.listProviders()` 里挑第一个 `listModels()` 非空的（优先含 `deepseek`）→ 缓存并在 `/health` 暴露。**任何一步失败都不静默通过关卡**。

---

## 4. 浏览器半区契约

- 形态：`window.__ModuleLoader__.load({ id:'dsh-plugin-good-at-ai', factory:(require)=>{ const React=require('react'); const inject=['slots']; ... return {apply, inject} } })`，与 `~/.dsh/plugins/dsh-plugin-todo/client.js` 同构。
- 挂载：`ctx.slots.inject('conversation.view', () => ctx.slots.register({name:'conversation.view', id:'good-at-ai', order:30, label:'AI 通关'}, GameView))`（xz-tools 同款）。
- 样式：`<style>` 在 `ctx.effect` 注入/卸载时移除；颜色一律走 `var(--dsw-alias-*, fallback)`，自动跟随明暗主题。
- 页面：左侧关卡列表（章节/状态徽章）→ 右侧详情（目标、操作指引、提示、提交区、判定反馈：通过/未过、得分、逐条理由与缺失项、确定性证据、评审模型名）→ 顶部进度。
- 交互：提交转圈 + 90s 超时 + 可取消（`AbortController` → 宿主 abort 传给 `ctx.llm.stream` 的 signal）；判定成功响应后才写进度。
- **`client.js` 必须自包含**：模块表只解析平台模块（react 等），不解析相对路径。

---

## 5. 判分管线

1. **确定性检查**（零成本硬证据），只认这些动作、只对练习目录内相对路径工作：
   `file-exists` / `file-matches{mustInclude,mustExclude}` / `dir-has{glob,min}` / `text-matches{patterns[]}`，每项产出 `{id,label,pass,evidence}`。
2. **模型评审**：
   - `system`：评审员人格 + rubric + 「只输出 JSON」+ **反作弊条款**（复述评分标准/要求原文即判未通过）；
   - `messages`：用 JSON 包裹用户提交与文件证据，防止用户文本破坏结构；
   - `ctx.llm.stream({provider, model, system, messages, maxTokens:900, signal})`，`for await` 收集 `text-delta`，结束检查终止块：`error` → 可读错误；`aborted` → 取消；`max-tokens` → 标记不完整；
   - **容错解析**：抓第一个配平花括号 → `JSON.parse` → 手写校验（`pass:boolean, score:0-100, reasons[], misses[], feedback`）→ 失败带错误**重试一次** → 再失败返回 `manual-review` 并展示原始输出，**绝不默认通过**。
3. **合并**：确定性检查任一失败 → 直接不通过（模型只补理由）；全通过 → 以模型判定为准并附检查证据。

---

## 6. 首版 3 关

| # | 章节 | 任务 | 判分 |
|---|---|---|---|
| 1 | 提示词技巧 | 给场景（AI 整理会议纪要成待办），写提示词：含角色、上下文、输出格式约束、验收标准 | 纯模型评审（四要素、具体度、可复现性） |
| 2 | 操作文件技巧 | 让 AI 在 `good-at-ai-playground/notes/` 建 `weekly.md`：一级标题 + 3 个二级小节 + 每节 ≥1 条待办 | 确定性检查 + 模型评审 |
| 3 | AI 编程技巧 | 让 AI 在 `good-at-ai-playground/scripts/` 生成 `wordcount.py`：读文本、输出词频前 10、带 shebang 与注释 | 确定性检查 + 模型评审 |

关卡数据字段：`{id, order, chapter, title, goal, brief, tips[], requiresAI, submit:{fields[], artifactNote}, checks[], rubric[], passScore}`。加关卡只改数据文件。

**v1 明确不做**：不执行用户生成的脚本（需 `ctx.shell`）；不注册面向模型的新工具（`ctx.tools`）；不加 `systemPrompt` 公告（避免污染每个会话）。

---

## 7. 持久化与安全边界

- 进度：`$DSH_HOME/good-at-ai/progress.json`，`{version:1, levels:{...}, updatedAt}`；原子写 `mkdir → open(tmp,'w',0o600) → write → fsync → close → rename`（目录 fsync 在 Windows 上 try/catch 忽略）；损坏文件改名 `.corrupt-<ts>` 隔离。
- 练习目录：`<workspace>\good-at-ai-playground`（`process.cwd()`，可 config 覆盖）；所有路径 `resolve` 后校验**必须落在练习目录内**（拒绝 `..`、越界绝对路径、符号链接逃逸），单文件读上限 256 KiB、单次提交总读上限 2 MiB。
- 路由仅 loopback + 同源；日志不回显密钥与用户内容。
- 插件宿主用原生 `node:fs`，**不受 agent fs 沙箱约束**（`dsh-task-board` 即如此写 `$DSH_HOME`），所以路径封闭必须自己写死。

---

## 8. 失败模式与边界

| 场景 | 行为 |
|---|---|
| 无可用模型 / 解析不到 provider | 503 + 中文提示「请在 dsh 设置里配置模型，或在本插件 config 指定 judge.provider/model」 |
| 模型 `finish.reason.kind==='error'` | 500 + 错误摘要，UI 显示「重试」，不扣关 |
| 模型返回非 JSON | 修复重试一次 → 仍失败 `manual-review` + 原始输出 |
| 达到 max-tokens | 标记 `incomplete`，提示缩短提交或重试 |
| 用户取消 / 关页 | abort 传递，不落盘不计数 |
| 重复 `requestId` | 回放缓存（幂等） |
| 同关卡并发提交 | 单飞锁（409 或排队） |
| 超大提交 | 413 |
| 练习目录不存在 | 按需 `mkdir -p`；失败给出路径与原因 |
| 检查路径越界 | 400 `path-outside-playground` 并说明 |
| 作弊（复述 rubric / 粘范例） | rubric 反作弊条款 + 确定性检查；**概率性防护，README 如实标注** |
| 宿主重启打断判分 | 无半成品写入，重新提交即可 |

---

## 9. 里程碑与验收

**第 0 步 · 方案落盘** —— 本文件（已完成则跳过）。

**第 1 步 · 解除沙箱阻塞（M0，前置）**
用 `diagnose-windows-sandbox-acl` 技能里的那一条命令（需一次批准、以非受限身份运行）：
`& '<skill目录>\scripts\diagnose-windows-sandbox-acl.ps1' -Path 'D:\gitee\Good_At_AI' -AllowRoot 'D:\gitee\Good_At_AI' -Out '<持久目录，如 C:\Users\lenovo\dsh-acl-reports>'`
验收：`pwd` / `node -v` / `pnpm -v` / `dsh --version` 跑通，工作区可写。若修复被拒或不可用，退路是临时把会话切到「完全权限」，或由用户手工执行命令；**通过后再往下走**。

**M1 · 骨架可见**（约 30 分钟）
产出 `package.json` / `cordis.patch.yml` / 空宿主 / 渲染静态关卡列表的 `client.js`。
装：`dsh plugin --profile web add link:D:\gitee\Good_At_AI` → **重启 `dsh web`**（插件集变更必须重启，刷新页面无效）。
验收：`dsh --profile web --dump-config` 出现 `id: good-at-ai`；对话区出现「AI 通关」标签页并列出 3 关。

**M2 · 后端与进度**：`routes.js` + `store.js` + `/catalog` `/state`。验收：刷新仍在、重启 dsh 仍在、`progress.json` 权限 0600 且位于 `$DSH_HOME/good-at-ai/`。

**M3 · 判分管线**：`checks.js` + `judge.js` + `/health` `/submit` + 反馈面板。验收：第 1、2 关各跑通一次真实判定；故意提交垃圾必须不通过且理由可解释；把 `judge.provider` 改成不存在的值 → `/health` 给出可操作错误而不崩。

**M4 · 3 关文案与 rubric 打磨。**

**M5 · 收尾**：`node --test` 全绿；README（安装/卸载/加关卡/调试：只改客户端 → 硬刷新；改宿主 → 重启 `dsh web`）；`/reset` 与 config 开关；一次完整回归。

---

## 10. 测试

- `tests/checks.test.js`：各检查动作正反例（空文件、编码、大小上限、路径越界）。
- `tests/verdict.test.js`：JSON 提取（裸 JSON / ```json 围栏 / 夹带废话 / 截断 / 非对象 / 分数越界）与修复重试路径。
- `tests/paths.test.js`：练习目录封闭性（`..`、绝对路径、盘符、UNC、大小写）。
- `tests/levels.test.js`：关卡数据自检（必填、order 唯一、checks 合法、rubric 权重和）。
- `tests/routes.test.js`：假 `ctx = {webServer:{register}, llm:{stream}}` 直调 handler，覆盖 413/403/幂等/并发/模型失败注入（不需要真模型）。

---

## 11. 风险与未核实项

1. **`ctx.llm` 三方插件零先例**：API 与范例均来自官方包，dsh 处于 developer preview，升级可能变。缓解：判分逻辑隔离在 `judge.js` 单文件，必要时整块换成 `ctx.apiProxy` 开会话方案，路由与 UI 不动。
2. **镜像版本差**：rc.5 快照（`fufankeji__deepseek-harness-studio`）与 rc.7 镜像（`ChisaAlter__Deepseek-Harness-Desktop\vendor\deepseek-harness`）并存，类型细节以 rc.7 为准；本机运行版的最终事实来源是三个已装插件与 `~/.dsh` 实际布局。
3. **`conversation.view` 是会话作用域**：游戏页出现在对话区标签里（与 xz-tools 一致）。真·全屏接管中间栏需像 `dsh-task-board` 那样 DOM 接管（MutationObserver + `html[data-...]` + `!important`，还需处理插件互斥），列为 v1 之后的升级项。
4. **构建/热更新**：客户端改动硬刷新即可；宿主改动必须重启 `dsh web`；插件集变更必须重启（包元数据判定被永久缓存）。
5. **判分消耗 token**（每次约 1–3k），关卡列表会标注「本关会调用模型判分」。
6. **反作弊只做概率性防护**，不做对抗性保证。

---

## 12. 假设

- 单机单用户，无账号与多人同步。
- 进度状态归插件（`$DSH_HOME`），用户提交的产物归工作区练习目录。
- 首版中文，提示词/文件/编程各 1 关；后续加关卡只写 `levels/*.js`。
- 需要 pnpm 在 PATH（`dsh plugin` 是 pnpm 的转发器）；无需 DSH 源码 checkout、无需联网拉 SDK。
