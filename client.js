window.__ModuleLoader__.load({
  id: '@local/good-at-ai',
  factory: (require) => {
    const React = require('react')
    const inject = ['slots']

    // Mirrors shared/api.js: this bundle resolves package ids only, so the
    // constants are inlined instead of imported. Keep both sides in sync.
    const API = '/api/good-at-ai'
    const VIEW_ID = 'good-at-ai'
    const SUBMIT_TIMEOUT_MS = 90000

    const CSS = `
.gaai-root{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);font-size:13px;line-height:1.55;}
.gaai-head{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l1,#ececec);flex-wrap:wrap;flex-shrink:0;background:var(--dsw-alias-bg-layer-1,#fff);}
.gaai-head-title{font-size:14px;font-weight:600;}
.gaai-progress{display:flex;align-items:center;gap:8px;flex:1;min-width:140px;}
.gaai-bar{position:relative;flex:1;height:6px;border-radius:3px;background:var(--dsw-alias-bg-layer-3,#eee);overflow:hidden;min-width:80px;}
.gaai-bar-fill{position:absolute;inset:0 auto 0 0;background:var(--dsw-alias-brand-primary,#4a90d9);transition:width .25s ease;}
.gaai-progress-text{font-size:12px;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;}
.gaai-body{display:flex;flex:1;min-height:0;}
.gaai-aside{width:250px;flex-shrink:0;border-right:1px solid var(--dsw-alias-border-l1,#ececec);overflow-y:auto;padding:8px 0 16px;}
.gaai-chapter{padding:10px 14px 4px;font-size:11px;letter-spacing:.06em;text-transform:none;color:var(--dsw-alias-label-tertiary,#999);}
.gaai-level{display:flex;align-items:flex-start;gap:8px;width:100%;box-sizing:border-box;text-align:left;border:1px solid transparent;background:transparent;color:inherit;border-radius:8px;padding:8px 10px;margin:2px 8px;cursor:pointer;font:inherit;}
.gaai-level:hover{background:var(--dsw-alias-bg-layer-2,#f6f6f6);}
.gaai-level.is-active{background:var(--dsw-alias-bg-layer-2,#f0f4f9);border-color:var(--dsw-alias-brand-primary,#4a90d9);}
.gaai-level-index{flex-shrink:0;width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;background:var(--dsw-alias-bg-layer-3,#eee);color:var(--dsw-alias-label-secondary,#666);margin-top:1px;}
.gaai-level.is-pass .gaai-level-index{background:var(--dsw-alias-brand-primary,#4a90d9);color:#fff;}
.gaai-level-main{flex:1;min-width:0;}
.gaai-level-title{font-size:13px;word-break:break-word;}
.gaai-level-meta{font-size:11px;color:var(--dsw-alias-label-tertiary,#999);margin-top:2px;}
.gaai-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:1px 7px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,#e5e5e5);color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;}
.gaai-chip.is-pass{border-color:var(--dsw-alias-brand-primary,#4a90d9);color:var(--dsw-alias-brand-primary,#4a90d9);}
.gaai-chip.is-fail{border-color:var(--dsw-alias-state-error-border,#e0a0a0);color:var(--dsw-alias-state-error-text,#c0392b);}
.gaai-main{flex:1;min-width:0;overflow-y:auto;padding:18px 22px 40px;}
.gaai-main-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px;}
.gaai-h2{font-size:17px;font-weight:600;margin:0;}
.gaai-goal{color:var(--dsw-alias-label-secondary,#555);margin:6px 0 14px;}
.gaai-tabs{display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid var(--dsw-alias-border-l1,#ececec);}
.gaai-tab{border:none;background:transparent;color:var(--dsw-alias-label-secondary,#666);font:inherit;padding:7px 12px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;}
.gaai-tab.is-on{color:var(--dsw-alias-label-primary,#111);border-bottom-color:var(--dsw-alias-brand-primary,#4a90d9);font-weight:500;}
.gaai-card{border:1px solid var(--dsw-alias-border-l1,#ececec);background:var(--dsw-alias-bg-layer-1,#fff);border-radius:10px;padding:14px 16px;margin-bottom:14px;}
.gaai-card-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#666);margin-bottom:8px;letter-spacing:.03em;}
.gaai-brief{white-space:pre-wrap;word-break:break-word;}
.gaai-tips{margin:8px 0 0;padding-left:18px;color:var(--dsw-alias-label-secondary,#555);}
.gaai-tips li{margin:4px 0;}
.gaai-label{display:block;font-size:12px;color:var(--dsw-alias-label-secondary,#666);margin:10px 0 5px;}
.gaai-input,.gaai-textarea{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#dcdcdc);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);border-radius:8px;padding:9px 11px;font:inherit;font-family:inherit;resize:vertical;}
.gaai-textarea{min-height:190px;line-height:1.6;}
.gaai-input:focus,.gaai-textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary,#4a90d9);}
.gaai-count{font-size:11px;color:var(--dsw-alias-label-tertiary,#999);margin-top:4px;text-align:right;}
.gaai-actions{display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap;}
.gaai-btn{border:1px solid var(--dsw-alias-border-l1,#e0e0e0);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111);border-radius:8px;padding:7px 16px;font:inherit;cursor:pointer;}
.gaai-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,#f4f4f4);}
.gaai-btn-primary{background:var(--dsw-alias-brand-primary,#4a90d9);border-color:var(--dsw-alias-brand-primary,#4a90d9);color:#fff;}
.gaai-btn-primary:hover:not(:disabled){opacity:.9;background:var(--dsw-alias-brand-primary,#4a90d9);}
.gaai-btn:disabled{opacity:.45;cursor:not-allowed;}
.gaai-note{font-size:12px;color:var(--dsw-alias-label-tertiary,#999);}
.gaai-notice{border-radius:8px;padding:9px 12px;margin-bottom:12px;font-size:12px;border:1px solid var(--dsw-alias-border-l1,#e5e5e5);background:var(--dsw-alias-bg-layer-2,#f7f7f7);color:var(--dsw-alias-label-secondary,#555);}
.gaai-notice.is-error{border-color:var(--dsw-alias-state-error-border,#e0a0a0);color:var(--dsw-alias-state-error-text,#c0392b);background:var(--dsw-alias-state-error-bg,#fdf3f3);}
.gaai-notice.is-warn{border-color:var(--dsw-alias-state-warn-border,#e6cf9a);color:var(--dsw-alias-state-warn-text,#8a6d1f);background:var(--dsw-alias-state-warn-bg,#fdf9ef);}
.gaai-verdict{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;}
.gaai-verdict-badge{font-size:14px;font-weight:600;padding:3px 12px;border-radius:14px;}
.gaai-verdict-badge.is-pass{background:var(--dsw-alias-brand-primary,#4a90d9);color:#fff;}
.gaai-verdict-badge.is-fail{background:var(--dsw-alias-state-error-bg,#f7dede);color:var(--dsw-alias-state-error-text,#c0392b);}
.gaai-score{font-size:20px;font-weight:600;}
.gaai-list{margin:0;padding-left:20px;}
.gaai-list li{margin:3px 0;word-break:break-word;}
.gaai-checks{display:flex;flex-direction:column;gap:6px;margin-top:6px;}
.gaai-check{display:flex;gap:8px;align-items:flex-start;font-size:12px;}
.gaai-check-mark{flex-shrink:0;width:16px;text-align:center;}
.gaai-check.is-pass .gaai-check-mark{color:var(--dsw-alias-brand-primary,#4a90d9);}
.gaai-check.is-fail .gaai-check-mark{color:var(--dsw-alias-state-error-text,#c0392b);}
.gaai-check-body{flex:1;min-width:0;}
.gaai-check-label{font-weight:500;}
.gaai-check-evidence{color:var(--dsw-alias-label-tertiary,#888);word-break:break-word;}
.gaai-pre{margin:6px 0 0;padding:10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f6f6f6);border:1px solid var(--dsw-alias-border-l1,#ececec);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto;}
.gaai-empty{color:var(--dsw-alias-label-tertiary,#999);padding:24px 4px;}
.gaai-kv{display:flex;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-tertiary,#999);margin-top:10px;}
.gaai-spin{display:inline-block;width:12px;height:12px;border:2px solid var(--dsw-alias-border-l2,#ccc);border-top-color:var(--dsw-alias-brand-primary,#4a90d9);border-radius:50%;animation:gaai-spin .8s linear infinite;vertical-align:-1px;margin-right:6px;}
@keyframes gaai-spin{to{transform:rotate(360deg);}}
`

    // ---------- wire helpers ----------

    async function apiGet(path, signal) {
      const response = await fetch(`${API}${path}`, { method: 'GET', signal, headers: { Accept: 'application/json' } })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        const message = body && body.error && body.error.message ? body.error.message : `请求失败（HTTP ${response.status}）`
        const hint = body && body.error && body.error.hint ? body.error.hint : ''
        throw new Error(hint ? `${message} ${hint}` : message)
      }
      return body
    }

    async function apiPost(path, payload, signal) {
      const response = await fetch(`${API}${path}`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        const error = body && body.error ? body.error : null
        const message = error && error.message ? error.message : `请求失败（HTTP ${response.status}）`
        const hint = error && error.hint ? ` ${error.hint}` : ''
        const failure = new Error(`${message}${hint}`)
        failure.status = response.status
        failure.code = error ? error.code : undefined
        failure.checks = body && body.checks
        throw failure
      }
      return body
    }

    function newRequestId() {
      return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    }

    function parseArtifacts(text) {
      return String(text || '')
        .split(/[\n,，;；]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .slice(0, 20)
    }

    function textFieldOf(level) {
      return level.submit.fields.find((field) => field.type === 'text')
    }

    function artifactsFieldOf(level) {
      return level.submit.fields.find((field) => field.type === 'artifacts')
    }

    function statusOf(levelId, progress) {
      const record = (progress && progress.levels || []).find((entry) => entry.id === levelId)
      if (!record) return 'new'
      if (record.passed) return 'pass'
      if (record.attempts > 0) return 'fail'
      return 'new'
    }

    function statusLabel(status) {
      if (status === 'pass') return '已通过'
      if (status === 'fail') return '未通过'
      return '未开始'
    }

    function checkSummaryOf(levelId, catalog) {
      const level = (catalog && catalog.levels || []).find((entry) => entry.id === levelId)
      return level ? level.checkSummary || [] : []
    }

    // ---------- small presentational pieces ----------

    function CheckRow(props) {
      const check = props.check
      return React.createElement(
        'div',
        { className: `gaai-check ${check.pass ? 'is-pass' : 'is-fail'}` },
        React.createElement('span', { className: 'gaai-check-mark' }, check.pass ? '✓' : '✕'),
        React.createElement(
          'div',
          { className: 'gaai-check-body' },
          React.createElement('div', { className: 'gaai-check-label' }, check.label || check.id),
          check.evidence ? React.createElement('div', { className: 'gaai-check-evidence' }, check.evidence) : null,
        ),
      )
    }

    function VerdictPanel(props) {
      const result = props.result
      if (!result) return null
      if (result.status === 'cancelled') {
        return React.createElement('div', { className: 'gaai-card' }, React.createElement('div', { className: 'gaai-notice' }, '判定已取消，未计入进度。'))
      }
      if (result.status === 'pending') {
        return React.createElement(
          'div',
          { className: 'gaai-card' },
          React.createElement('div', { className: 'gaai-card-title' }, '判定中'),
          React.createElement(
            'div',
            { className: 'gaai-note' },
            React.createElement('span', { className: 'gaai-spin' }),
            `模型正在评审（预计 10–40 秒，最多等待 ${SUBMIT_TIMEOUT_MS / 1000} 秒，可点「取消」）。`,
          ),
          props.checks && props.checks.length > 0
            ? React.createElement(
                'div',
                { style: { marginTop: '10px' } },
                React.createElement('div', { className: 'gaai-card-title' }, '文件系统检查（已完成）'),
                React.createElement('div', { className: 'gaai-checks' }, props.checks.map((check) => React.createElement(CheckRow, { key: check.id, check }))),
              )
            : null,
        )
      }
      if (result.status === 'error' || result.status === 'manual-review') {
        return React.createElement(
          'div',
          { className: 'gaai-card' },
          React.createElement('div', { className: `gaai-notice ${result.status === 'error' ? 'is-error' : 'is-warn'}` }, result.feedback || '模型没有给出可用判定。'),
          result.checks && result.checks.length > 0
            ? React.createElement('div', { className: 'gaai-checks' }, result.checks.map((check) => React.createElement(CheckRow, { key: check.id, check })))
            : null,
          result.raw
            ? React.createElement(
                'details',
                { style: { marginTop: '10px' } },
                React.createElement('summary', { className: 'gaai-note' }, '查看模型原始输出'),
                React.createElement('pre', { className: 'gaai-pre' }, result.raw),
              )
            : null,
          result.judge ? React.createElement('div', { className: 'gaai-kv' }, `评审模型：${result.judge.label}`) : null,
        )
      }

      const passed = result.pass === true
      return React.createElement(
        'div',
        { className: 'gaai-card' },
        React.createElement(
          'div',
          { className: 'gaai-verdict' },
          React.createElement('span', { className: `gaai-verdict-badge ${passed ? 'is-pass' : 'is-fail'}` }, passed ? '通过' : '未通过'),
          result.score !== null && result.score !== undefined ? React.createElement('span', { className: 'gaai-score' }, String(result.score)) : null,
          React.createElement('span', { className: 'gaai-note' }, '得分'),
          result.judgeOverridden ? React.createElement('span', { className: 'gaai-chip is-fail' }, '模型判通过，但文件检查未过 → 已改判') : null,
          result.incomplete ? React.createElement('span', { className: 'gaai-chip is-fail' }, '输出被截断（max-tokens）') : null,
          result.repaired ? React.createElement('span', { className: 'gaai-chip' }, '已修复重试一次') : null,
          result.replayed ? React.createElement('span', { className: 'gaai-chip' }, '重复请求，回放结果') : null,
        ),
        result.feedback ? React.createElement('div', { style: { marginBottom: '10px' } }, result.feedback) : null,
        result.reasons && result.reasons.length > 0
          ? React.createElement(
              'div',
              { style: { marginBottom: '10px' } },
              React.createElement('div', { className: 'gaai-card-title' }, '评审理由'),
              React.createElement('ul', { className: 'gaai-list' }, result.reasons.map((reason, index) => React.createElement('li', { key: index }, reason))),
            )
          : null,
        result.misses && result.misses.length > 0
          ? React.createElement(
              'div',
              { style: { marginBottom: '10px' } },
              React.createElement('div', { className: 'gaai-card-title' }, '缺失项'),
              React.createElement('ul', { className: 'gaai-list' }, result.misses.map((miss, index) => React.createElement('li', { key: index }, miss))),
            )
          : null,
        result.checks && result.checks.length > 0
          ? React.createElement(
              'div',
              null,
              React.createElement('div', { className: 'gaai-card-title' }, '文件系统检查证据'),
              React.createElement('div', { className: 'gaai-checks' }, result.checks.map((check) => React.createElement(CheckRow, { key: check.id, check }))),
            )
          : null,
        React.createElement(
          'div',
          { className: 'gaai-kv' },
          result.judge ? `评审模型：${result.judge.label}` : '',
          result.usage ? `tokens：输入 ${result.usage.inputTokens ?? '-'} / 输出 ${result.usage.outputTokens ?? '-'}` : '',
          result.recordNote ? result.recordNote : '',
        ),
      )
    }

    // ---------- the page ----------

    function GameView() {
      const [catalog, setCatalog] = React.useState(null)
      const [progress, setProgress] = React.useState(null)
      const [health, setHealth] = React.useState(null)
      const [selectedId, setSelectedId] = React.useState(null)
      const [tab, setTab] = React.useState('goal')
      const [answer, setAnswer] = React.useState('')
      const [artifacts, setArtifacts] = React.useState('')
      const [result, setResult] = React.useState(null)
      const [loadError, setLoadError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const abortRef = React.useRef(null)

      React.useEffect(() => {
        let alive = true
        Promise.all([apiGet('/catalog'), apiGet('/state')])
          .then(([catalogBody, stateBody]) => {
            if (!alive) return
            setCatalog(catalogBody)
            setProgress(stateBody)
            const levels = catalogBody.levels || []
            if (levels.length > 0) {
              const passed = new Set((stateBody.levels || []).filter((entry) => entry.passed).map((entry) => entry.id))
              const first = levels.find((entry) => !passed.has(entry.id)) || levels[0]
              setSelectedId(first.id)
            }
          })
          .catch((error) => {
            if (alive) setLoadError(error.message)
          })
        apiGet('/health')
          .then((body) => {
            if (alive) setHealth(body)
          })
          .catch((error) => {
            if (alive) setHealth({ ok: false, error: { message: error.message } })
          })
        return () => {
          alive = false
          if (abortRef.current) abortRef.current.abort()
        }
      }, [])

      const levels = (catalog && catalog.levels) || []
      const activeLevel = levels.find((level) => level.id === selectedId) || levels[0] || null
      const activeStatus = activeLevel ? statusOf(activeLevel.id, progress) : 'new'
      const passedCount = ((progress && progress.levels) || []).filter((entry) => entry.passed).length
      const total = levels.length
      const percent = total === 0 ? 0 : Math.round((passedCount / total) * 100)

      async function refreshState() {
        try {
          const body = await apiGet('/state')
          setProgress(body)
        } catch (error) {
          setLoadError(error.message)
        }
      }

      function selectLevel(id) {
        if (abortRef.current) abortRef.current.abort()
        setSelectedId(id)
        setResult(null)
        setAnswer('')
        setArtifacts('')
        setTab('goal')
      }

      async function submit() {
        if (!activeLevel || busy) return
        const trimmed = answer.trim()
        if (trimmed.length === 0) {
          setResult({ status: 'error', feedback: '请先填写提交内容。', checks: [] })
          return
        }
        const controller = new AbortController()
        abortRef.current = controller
        const timer = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS)
        setBusy(true)
        setResult({ status: 'pending', checks: [] })
        try {
          const body = await apiPost(
            '/submit',
            { requestId: newRequestId(), levelId: activeLevel.id, answer: trimmed, artifacts: parseArtifacts(artifacts) },
            controller.signal,
          )
          setResult(body)
          if (body.recorded === true || body.status === 'ok') await refreshState()
        } catch (error) {
          if (error && error.name === 'AbortError') {
            setResult({ status: 'cancelled' })
          } else {
            setResult({
              status: 'error',
              feedback: error && error.message ? error.message : '提交失败。',
              checks: error && error.checks ? error.checks : [],
            })
          }
        } finally {
          clearTimeout(timer)
          abortRef.current = null
          setBusy(false)
        }
      }

      function cancel() {
        if (abortRef.current) abortRef.current.abort()
      }

      if (loadError !== null && catalog === null) {
        return React.createElement(
          'div',
          { className: 'gaai-root' },
          React.createElement(
            'div',
            { className: 'gaai-main' },
            React.createElement('div', { className: 'gaai-notice is-error' }, `无法加载「AI 通关」：${loadError}`),
            React.createElement('div', { className: 'gaai-note' }, '请确认插件已启用并重启过 dsh web，然后查看 /api/good-at-ai/health。'),
          ),
        )
      }

      if (catalog === null) {
        return React.createElement('div', { className: 'gaai-root' }, React.createElement('div', { className: 'gaai-main gaai-empty' }, '正在加载关卡…'))
      }

      const judgeReady = catalog.judge !== null && catalog.judge !== undefined
      const checkSummary = activeLevel ? checkSummaryOf(activeLevel.id, catalog) : []
      const textField = activeLevel ? textFieldOf(activeLevel) : null
      const artifactsField = activeLevel ? artifactsFieldOf(activeLevel) : null

      const aside = React.createElement(
        'div',
        { className: 'gaai-aside' },
        (() => {
          const groups = []
          for (const level of levels) {
            let group = groups.find((entry) => entry.chapter === level.chapter)
            if (!group) {
              group = { chapter: level.chapter, levels: [] }
              groups.push(group)
            }
            group.levels.push(level)
          }
          return groups.map((group) =>
            React.createElement(
              'div',
              { key: group.chapter },
              React.createElement('div', { className: 'gaai-chapter' }, group.chapter),
              group.levels.map((level) => {
                const status = statusOf(level.id, progress)
                const record = ((progress && progress.levels) || []).find((entry) => entry.id === level.id)
                return React.createElement(
                  'button',
                  {
                    key: level.id,
                    type: 'button',
                    className: `gaai-level ${status === 'pass' ? 'is-pass' : ''} ${level.id === (activeLevel && activeLevel.id) ? 'is-active' : ''}`,
                    onClick: () => selectLevel(level.id),
                  },
                  React.createElement('span', { className: 'gaai-level-index' }, status === 'pass' ? '✓' : String(level.order)),
                  React.createElement(
                    'span',
                    { className: 'gaai-level-main' },
                    React.createElement('span', { className: 'gaai-level-title' }, level.title),
                    React.createElement(
                      'span',
                      { className: 'gaai-level-meta' },
                      status === 'pass' ? `已通过 · 最高 ${record && record.bestScore !== null ? record.bestScore : '-'} 分` : statusLabel(status),
                    ),
                  ),
                )
              }),
            ),
          )
        })(),
      )

      const detail = activeLevel
        ? React.createElement(
            'div',
            { className: 'gaai-main' },
            React.createElement(
              'div',
              { className: 'gaai-main-head' },
              React.createElement('h2', { className: 'gaai-h2' }, activeLevel.title),
              React.createElement('span', { className: `gaai-chip ${activeStatus === 'pass' ? 'is-pass' : activeStatus === 'fail' ? 'is-fail' : ''}` }, statusLabel(activeStatus)),
              activeLevel.requiresAI ? React.createElement('span', { className: 'gaai-chip' }, '本关会调用模型判分') : null,
              React.createElement('span', { className: 'gaai-chip' }, `通过线 ${activeLevel.passScore} 分`),
            ),
            React.createElement('p', { className: 'gaai-goal' }, activeLevel.goal),
            React.createElement(
              'div',
              { className: 'gaai-tabs' },
              React.createElement('button', { type: 'button', className: `gaai-tab ${tab === 'goal' ? 'is-on' : ''}`, onClick: () => setTab('goal') }, '任务与提示'),
              React.createElement('button', { type: 'button', className: `gaai-tab ${tab === 'submit' ? 'is-on' : ''}`, onClick: () => setTab('submit') }, '提交判分'),
            ),
            tab === 'goal'
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement(
                    'div',
                    { className: 'gaai-card' },
                    React.createElement('div', { className: 'gaai-card-title' }, '任务说明'),
                    React.createElement('div', { className: 'gaai-brief' }, activeLevel.brief),
                  ),
                  React.createElement(
                    'div',
                    { className: 'gaai-card' },
                    React.createElement('div', { className: 'gaai-card-title' }, '评分维度'),
                    React.createElement(
                      'ul',
                      { className: 'gaai-tips' },
                      (activeLevel.rubric || []).map((item) => React.createElement('li', { key: item.id }, `${item.label}（权重 ${item.weight}）`)),
                    ),
                  ),
                  activeLevel.tips && activeLevel.tips.length > 0
                    ? React.createElement(
                        'div',
                        { className: 'gaai-card' },
                        React.createElement('div', { className: 'gaai-card-title' }, '提示'),
                        React.createElement('ul', { className: 'gaai-tips' }, activeLevel.tips.map((tip, index) => React.createElement('li', { key: index }, tip))),
                      )
                    : null,
                  checkSummary.length > 0
                    ? React.createElement(
                        'div',
                        { className: 'gaai-card' },
                        React.createElement('div', { className: 'gaai-card-title' }, '会自动检查的文件证据'),
                        React.createElement(
                          'ul',
                          { className: 'gaai-tips' },
                          checkSummary.map((item) => React.createElement('li', { key: item.id }, item.label)),
                        ),
                      )
                    : null,
                  React.createElement(
                    'div',
                    { className: 'gaai-actions' },
                    React.createElement('button', { type: 'button', className: 'gaai-btn gaai-btn-primary', onClick: () => setTab('submit') }, '去提交'),
                  ),
                )
              : React.createElement(
                  React.Fragment,
                  null,
                  !judgeReady
                    ? React.createElement(
                        'div',
                        { className: 'gaai-notice is-error' },
                        `当前没有可用的评审模型，无法判分。${catalog.judgeError && catalog.judgeError.hint ? catalog.judgeError.hint : '请在 dsh 设置里配置模型，或在本插件 config 指定 judge.provider / judge.model。'}`,
                      )
                    : null,
                  React.createElement(
                    'div',
                    { className: 'gaai-card' },
                    React.createElement('div', { className: 'gaai-card-title' }, textField ? textField.label : '提交内容'),
                    React.createElement('textarea', {
                      className: 'gaai-textarea',
                      value: answer,
                      maxLength: textField ? textField.maxLength : 8000,
                      placeholder: textField ? textField.placeholder : '',
                      onChange: (event) => setAnswer(event.target.value),
                      disabled: busy,
                    }),
                    React.createElement('div', { className: 'gaai-count' }, `${answer.length} / ${textField ? textField.maxLength : 8000}`),
                    artifactsField
                      ? React.createElement(
                          React.Fragment,
                          null,
                          React.createElement('label', { className: 'gaai-label' }, artifactsField.label),
                          React.createElement('input', {
                            className: 'gaai-input',
                            value: artifacts,
                            maxLength: artifactsField.maxLength,
                            placeholder: artifactsField.placeholder || '',
                            onChange: (event) => setArtifacts(event.target.value),
                            disabled: busy,
                          }),
                          React.createElement('div', { className: 'gaai-count' }, activeLevel.submit.artifactNote),
                        )
                      : null,
                    React.createElement(
                      'div',
                      { className: 'gaai-actions' },
                      React.createElement('button', { type: 'button', className: 'gaai-btn gaai-btn-primary', disabled: busy || !judgeReady, onClick: submit }, busy ? '判定中…' : '提交判分'),
                      busy
                        ? React.createElement('button', { type: 'button', className: 'gaai-btn', onClick: cancel }, '取消')
                        : React.createElement(
                            'button',
                            { type: 'button', className: 'gaai-btn', onClick: refreshState, disabled: busy },
                            '刷新产物',
                          ),
                      React.createElement('span', { className: 'gaai-note' }, '判定消耗 token；失败或取消不计入进度。'),
                    ),
                  ),
                  React.createElement(VerdictPanel, { result, checks: result && result.checks ? result.checks : [] }),
                ),
          )
        : React.createElement('div', { className: 'gaai-main gaai-empty' }, '这个目录里还没有关卡。')

      return React.createElement(
        'div',
        { className: 'gaai-root' },
        React.createElement(
          'div',
          { className: 'gaai-head' },
          React.createElement('span', { className: 'gaai-head-title' }, 'AI 通关'),
          React.createElement(
            'div',
            { className: 'gaai-progress' },
            React.createElement('div', { className: 'gaai-bar' }, React.createElement('div', { className: 'gaai-bar-fill', style: { width: `${percent}%` } })),
            React.createElement('span', { className: 'gaai-progress-text' }, `已通关 ${passedCount} / ${total}`),
          ),
          health && health.judge ? React.createElement('span', { className: 'gaai-chip' }, `评审模型 ${health.judge.label || `${health.judge.provider}/${health.judge.model}`}`) : null,
          !judgeReady ? React.createElement('span', { className: 'gaai-chip is-fail' }, '无可用评审模型') : null,
        ),
        React.createElement('div', { className: 'gaai-body' }, aside, detail),
      )
    }

    function apply(ctx) {
      ctx.slots.inject('conversation.view', () =>
        ctx.slots.register({ name: 'conversation.view', id: VIEW_ID, order: 30, label: 'AI 通关' }, (props) =>
          React.createElement(GameView, props),
        ),
      )

      ctx.effect(() => {
        const el = document.createElement('style')
        el.textContent = CSS
        document.head.appendChild(el)
        return () => {
          el.remove()
        }
      })
    }

    return { apply, inject }
  },
})
