# @local/good-at-ai · AI 通关

一个 DSH 插件：把「怎么用 AI 干活」变成 3 个可通关的练习关卡。判分采用**混合管线** —— 先在文件系统里跑确定性检查拿硬证据，再让模型按 rubric 评审，最后合并成一条可解释的判定。

- 零 npm 依赖、零构建：宿主与浏览器半区都是手写纯 JS，装机不需要联网拉 SDK。
- 进度存在 `$DSH_HOME/good-at-ai/progress.json`；你练习产出的文件存在工作区的 `good-at-ai-playground/`。
- 页面挂在对话区 `conversation.view` 槽位（与 `xz-tools` 的 Skills 页同款），标签名叫「AI 通关」。
- 包名 `@local/good-at-ai`、插件行 `id: good-at-ai`、客户端 bundle id `@local/good-at-ai`、API 前缀 `/api/good-at-ai`——这四处必须各自一致，改名时一起改。

---

## 安装

本包是一个 **bundle**（`package.json` 声明了 `dsh.bundle.patch`），所以有三种安装方式，产物相同：包进入 profile 的 `dependencies` 与 `dsh.profile.bundles`，profile 启动时合并它的 patch。

### 方式 A · Desktop 的插件管理器（推荐）

在 Desktop 的**设置 → 插件 → 安装本地插件**里选择本仓库目录。
管理器会自己挑选「Desktop 正在用的那个 profile」（本机是 `desktop`，不是 `web`），并把插件安装为 `@local/<目录名>`。装完会报告 `applied` 或 `restart-required`。

> 这一步也是最容易踩坑的地方：我最初把插件装进了 `web` profile，而 GUI 实际运行的是
> `desktop` profile，于是插件"装好了"却完全不生效。用管理器能自动避开这个问题；
> 手工安装前请先确认 profile：`$env:DSH_PROFILE`。

### 方式 B · CLI（相对路径）

```powershell
dsh plugin --profile desktop add link:../../../../dsh/plugins/good-at-ai
```

`dsh plugin` 是 pnpm 的转发器：装完依赖后，它会因为本包声明了 `dsh.bundle.patch` 而把包名追加进 `dsh.profile.bundles`。

### ⚠️ Windows 上的路径坑（实测）

**不要**给 `dsh plugin add` 传盘符绝对路径。它内部用 `path.resolve(cwd, spec)` 重写路径参数，而 `resolve()` 在 Windows 上会把 `D:\gitee\...` 当成相对于 cwd 的路径，生成 `…\profiles\desktop\D:\gitee\Good_At_AI` 这种坏路径：命令**仍然返回 0**，但 `node_modules` 里留下的是指向不存在目标的悬空 symlink，插件静默不生效。

- 正确做法：用**相对路径**（方式 B），或走插件管理器（方式 A）。
- 自查依赖是否真的解析到源码：

  ```powershell
  node -e "const {createRequire}=require('module');const r=createRequire(process.env.USERPROFILE+'/.dsh/profiles/'+process.env.DSH_PROFILE+'/package.json');console.log(r.resolve('@local/good-at-ai/package.json'))"
  ```

  能打印出本仓库的 `package.json` 路径才算装对。
- 另外，profile 与源码**不必同盘**——`link:` 跨盘可以解析；真正出问题的是上面的路径拼接。

### 生效时机（重要）

| 改了什么 | 生效方式 |
|---|---|
| 首次安装 bundle | 通常立刻 `applied` |
| **已经在内存里加载过的宿主 JS**（`index.js` / `host/*` / `levels/*`） | **必须重启 Desktop**——实测改完文件后宿主半区不会自动重载，运行中的仍是旧代码 |
| `client.js`（浏览器半区） | 硬刷新页面；客户端 bundle 由 HMR 重建 |
| `package.json` / `cordis.patch.yml` | 重启（包元数据被缓存） |

改完宿主代码可以用一个显式标记自查运行的是哪一代代码（例如在 `/health` 里加一个字段）；没有标记就说明还是旧代码。

### 验证

```powershell
# 组合树里有本插件
dsh --profile desktop --dump-config | Select-String good-at-ai
```

运行中的插件可以直接打 API 验证（网关需要凭据；`Authorization: Bearer <token>` 等几种头都接受）：

```powershell
$h = @{ Authorization = "Bearer <你的凭据>" }
Invoke-WebRequest 'http://127.0.0.1:19387/api/good-at-ai/health' -Headers $h -UseBasicParsing | Select-Object -Expand Content
```

`/health` 会回报解析出的评审模型、练习目录（含候选列表）、进度文件路径与诊断 warning。

## 卸载

在插件管理器里移除，或者：

```powershell
dsh plugin --profile desktop remove @local/good-at-ai
```

然后重启。`$DSH_HOME/good-at-ai/progress.json` 与工作区的 `good-at-ai-playground/`
都不会被删除，需要的话自己删。

## 配置（可选）

本插件**不导出 schemastery `Config`**：插件目录是以 symlink 装进 profile 的，Node 从工作区
向上查找 `node_modules`，永远到不了 profile 的 `node_modules`，所以这里 import
`schemastery` 会在加载期直接失败。配置改为在 `apply()` 里做零依赖归一化，任何非法值都退化成
默认值并通过 `/health` 暴露，不会让插件崩掉。

在**正在使用的 profile** 的 `cordis.patch.yml` 里按 id 覆盖（本机是
`~/.dsh/profiles/desktop/cordis.patch.yml`；用 `$env:DSH_PROFILE` 确认）：

```yaml
- id: good-at-ai
  config:
    judge:
      provider: deepseek-official   # 留空 = 自动发现（优先 id 含 deepseek 的提供方）
      model: deepseek-flash         # 留空 = 取该提供方的第一个模型
    playgroundDir: D:\gitee\Good_At_AI\good-at-ai-playground
    enableReset: true          # 关闭后 POST /reset 返回 404
    requestTimeoutMs: 90000    # 5s–300s
    maxAnswerChars: 8000       # 200–20000
    maxTokens: 3000            # 判分输出预算，512–8000
    allowDeterministicFallback: false   # 见下文「失败模式」
```

> **`maxTokens` 为什么默认给到 3000**：判分用的通常是**推理模型**（本机自动发现到
> `deepseek-flash`），它会先把输出预算花在推理上。实测上限 900 时第 3 关出现
> 「`outputTokens` 正好 900、正文为空、推理内容一大堆」——预算被推理吃干，一个字的 JSON 都没写出来。
> 所以这个上限必须同时容纳「思考」和「JSON 正文」，不能按 JSON 长度估。
> 触发这种失败时，插件现在会明确告诉你「预算全花在推理上」，而不是笼统地说「模型没有输出」。

> patch 里对同一个 id 的覆盖会**整体替换**该行的 `config`，所以要么写全，要么只写你想改的并接受其余字段回落到默认值。

练习目录解析优先级：`config.playgroundDir` → 环境变量 `GOOD_AT_AI_PLAYGROUND` →
`<插件目录>/good-at-ai-playground` → `<cwd>/good-at-ai-playground`。
`/health` 与 `/catalog` 都会回显实际解析结果与候选列表，所以不一致时一眼能看出来。

## API

所有路由都是 `kind: 'exact'`，并且只接受 loopback 来源 + 同源 `Origin` + loopback `Host`：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/good-at-ai/health` | 评审模型、练习目录、进度文件位置、诊断 warning；无模型时 503 |
| GET | `/api/good-at-ai/catalog` | 关卡目录 + 提交字段 + 提示 + rubric + 上限 |
| GET | `/api/good-at-ai/state` | 进度快照 |
| POST | `/api/good-at-ai/submit` | `{requestId, levelId, answer, artifacts?}` → 判定结果 |
| POST | `/api/good-at-ai/reset` | 清进度（可配置关闭） |

请求体上限 128 KiB；`/submit` 按 `requestId` 幂等回放（LRU 50 / TTL 10 分钟），同一关卡并发提交返回 409。

## 失败模式

| 场景 | 行为 |
|---|---|
| 没有可用模型 / 配的 provider 不存在 | 503 + 中文可操作提示；不写进度、不计尝试 |
| 模型 `finish.reason.kind === 'error'` | 500 + 错误摘要（不回显密钥）；UI 显示重试 |
| 模型输出不是合法 JSON | 带错误**自动修复重试一次**；再失败 → `manual-review` + 原始输出，**绝不默认通过** |
| 达到 max-tokens | 标记 `incomplete`，提示缩短提交 |
| 用户取消 / 关页 | abort 传到 `ctx.llm.stream`，不落盘、不计数 |
| 重复 `requestId` | 回放缓存，响应带 `replayed: true` |
| 检查路径越界（`..` / 绝对路径 / symlink 逃逸） | 该检查直接判失败并说明原因 |
| 进度文件损坏 | 改名为 `progress.json.corrupt-<ts>` 隔离，从空进度继续 |
| 单文件 > 256 KiB / 单次提交 > 2 MiB / > 200 个文件 | 检查判失败并给出原因（失败关闭） |

**`allowDeterministicFallback`（默认关闭）**：打开后，当确定性检查**全部通过**而模型评审失败时，
判定为通过并打上 `fallbackJudge: true`，理由里会写明「确定性检查全部通过」以及模型失败原因；
如果之前有过一次模型评审，会沿用它的分数与理由。这个开关是显式选择，不是默认行为——默认情况下
模型不可用就是不可用（503），不会被当成通过。

## 判分管线

1. **确定性检查**（零成本硬证据，只认练习目录内的相对路径）：`file-exists` /
   `file-matches{mustInclude,mustExclude}` / `dir-has{glob,min}` / `text-matches{patterns[]}`，
   每项产出 `{id, label, kind, pass, evidence}`。
2. **模型评审**：system = 评审员人格 + 关卡目标 + rubric + 「只输出 JSON」+ 反作弊条款；
   用户消息用 JSON 包裹提交内容，防止用户文本破坏结构；`for await` 收集 `text-delta`，
   结束后检查终止块；解析走「花括号配平取第一个对象」→ 手写字段校验 → 失败修复重试一次。
3. **合并**：任一确定性检查失败 → 直接不通过（模型只能补理由，被覆盖时响应带
   `judgeOverridden: true`）；全通过 → 以模型判定为准并附检查证据。

## 加关卡

**关卡是 Markdown 文件**：`levels/*.md`，一个关卡一个文件。加一关 = 新建一个 `.md`，不用改任何 JS。

```markdown
---
id: my-level            # 小写连字符，唯一
order: 4                # 正整数，唯一，决定顺序
chapter: 提示词技巧      # 左侧列表分组
title: 我的关卡
passScore: 70
submit:
  fields:
    - name: prompt
      label: 你发给 AI 的指令
      type: text
      maxLength: 4000
checks:
  - id: exists
    label: notes/a.md 存在
    kind: file-exists
    path: notes/a.md
rubric:
  - id: a
    label: 维度 A
    weight: 1           # 权重之和必须为 1
---

## 目标

一句话目标。

## 任务说明

给学员看的任务描述，支持多段、列表、代码块。

## 提示

- 每行一条提示
```

**检查规则用一套迷你断言语言**，直接写正则，不用写 JS 对象：

| 写法 | 含义 |
|---|---|
| `'文本'` | 包含这段纯文本 |
| `'re:正则'` | 正则匹配 |
| `'!文本'` / `'!re:正则'` | 不得包含 / 不得匹配 |
| `'re:正则 @m'` | 带标志（`i` / `m` / `s` / `u`） |

五种检查：`file-exists`、`file-matches`、`dir-has`、`text-matches`、**`count`**（精确计数，用来把「正好三个小节」这类要求变成硬检查）。

**完整字段表、五种检查的示例、YAML 支持范围与报错对照，见 [`levels/FORMAT.md`](levels/FORMAT.md)**——那是格式的唯一权威说明。

改完先校验再重启，能省掉一次重启：

```powershell
node scripts/check-levels.mjs      # 或 pnpm run check:levels
```

它会打印**文件名 + 行号 + 出错那一行的原文**，例如：

```
✖ 02-file-scaffold.md:1 关卡 file-scaffold 的第 3 个检查 match 的正则无法编译：(?s)… —— Invalid group
```

> 为什么需要这个脚本：关卡是在插件挂载时解析的，一个 YAML 手误会让整个插件的 fiber 装不上，
> 那时连 `/health` 都不存在，排查很痛苦。所以**插件没出现在界面上时，第一件事就是跑它**。

校验之外还有 `node --test "tests/*.test.js"`：`levels.test.js` 会断言真实关卡文件全部合法（id/order 唯一、rubric 权重和为 1、检查参数合法、正则可编译）。

## 开发与调试

| 改了什么 | 生效方式 |
|---|---|
| `client.js`（浏览器半区） | 硬刷新页面 |
| **宿主半区**（`index.js` / `host/*` / `levels/*`，含 `levels/*.md`） | **必须重启 Desktop**——实测宿主 JS 不会随文件变化自动重载 |
| `package.json` / `cordis.patch.yml`（插件集元数据） | **必须重启**（包元数据会被永久缓存） |

> 想确认运行中的到底是哪一代宿主代码，在 `/health` 里放一个显式标记字段最省事：
> 标记没出现就等于还在跑旧代码。

排查顺序：

1. `dsh --profile "$env:DSH_PROFILE" --dump-config | Select-String good-at-ai` —— 插件进没进组合树。
2. `GET /api/good-at-ai/health` —— 模型解析、练习目录、进度文件位置、warning。
   注意这些自定义路由**在网关后面**，直接访问会得到 401，需要带凭据
   （`Authorization: Bearer <token>`）。它本身另有 loopback + Host 守卫。
3. 浏览器控制台 —— 客户端渲染错误。
4. 进度文件 `$DSH_HOME/good-at-ai/progress.json` —— 是否真的写进去了。

测试：

```powershell
node --test "tests/*.test.js"     # 或 pnpm test
```

测试全部离线：用假的 `ctx`（`{webServer:{register}, llm:{stream,…}}`）直调 handler，不碰真模型、
不碰你的 `$DSH_HOME`（进度写到临时目录）。其中 `tests/http.test.js` 会真的起一个
`node:http` 服务器走 TCP 收发，因为「请求体正常读完却被当成客户端断开」这个 bug
对构造出来的 request stub 是隐形的——只有真实 Node 语义才暴露得出来。

## 安全与边界

- 路由仅 loopback + 同源 + `Host` 白名单（防 DNS rebinding）。
- 练习目录是强制的路径围栏：拒绝 `..`、绝对路径、盘符、UNC、NUL 字节，并在 `realpath` 之后
  校验仍在目录内（防 symlink 逃逸）。**插件宿主用原生 `node:fs`，不受 agent 的 fs 沙箱约束**，
  所以这个围栏必须自己写死——`host/paths.js` 是唯一的入口。
- 单文件读 256 KiB、单次提交总读 2 MiB、单次检查最多 200 个文件。
- 进度文件以 0600 权限、临时文件 + fsync + rename 原子写入。
- 日志不回显用户提交内容与密钥。

## 已知边界（如实说明）

- **反作弊只是概率性防护**：rubric 里的反作弊条款 + 确定性检查能拦住「复述评分标准」「粘范例」
  这类明显作弊，但**不构成对抗性保证**，不承诺能防住刻意绕过的提交。
- **第 2 关的「恰好三个二级小节」由模型判定**：确定性检查证明「存在一级标题、存在 `## ` 小节、
  存在 `- [ ] ` 待办、`notes/` 下有 Markdown 文件」这些硬事实，但「数量正好 3 个」没有做成计数检查，
  交给模型评审。加计数能力需要给检查动作扩展 `count` 语义，属于后续工作。
- **不执行用户生成的脚本**：第 3 关只检查源码文本，不跑 `wordcount.py`（执行需要 `ctx.shell`）。
- **`ctx.llm` 在三方插件里没有先例**：API 与范例都来自官方包，DSH 处于 developer preview，
  升级后接口可能变化。因此判分逻辑被隔离在 `host/judge.js` 单文件里 —— 必要时整块换成
  `ctx.apiProxy` 开会话方案，路由与 UI 不用动。
- **每次判分消耗 token**（约 1–3k），关卡列表会标注「本关会调用模型判分」。
- 单机单用户，无账号与多人同步。
