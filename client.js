window.__ModuleLoader__.load({
  id: 'dsh-compact-tuner',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var React = require('react')
    var ReactDOM = require('react-dom')

    /** Escape the composer card's stacking context so the panel paints on top. */
    function portal(node) {
      if (node === null) return null
      return ReactDOM.createPortal(node, document.body)
    }

    var PRESETS = [0.2, 0.25, 0.35]
    var RETAIN_PRESETS = [8000, 20000, 40000]
    var RETAIN_MIN = 1000
    var RETAIN_MAX = 200000
    var WIDTH = 196
    var MUTED = 'var(--dsw-alias-label-tertiary, var(--dsw-alias-text-2, #8a8f98))'
    var STRONG = 'var(--dsw-alias-label-primary, var(--dsw-alias-text-1, #1f2329))'
    var SURFACE = 'var(--dsw-specific-menu, var(--dsh-bg-elevated, #ffffff))'
    var BORDER = 'var(--dsw-alias-border-l1, rgba(128,128,128,0.28))'
    var HOVER = 'var(--dsw-alias-bg-layer-1, rgba(128,128,128,0.10))'
    var HINT_RATIO = '上下文用到该比例时压缩较早的历史，不是“剩多少才压”。'
    var HINT_RETAIN = '压缩后原样保留最近多少 token 的对话，其余压成摘要。'

    function pct(ratio) {
      return Math.round(ratio * 1000) / 10 + '%'
    }

    /** Compact token label: 20000 → 20k, 8192 → 8.2k. */
    function tok(value) {
      if (value >= 10000) return Math.round(value / 1000) + 'k'
      if (value >= 1000) return Math.round(value / 100) / 10 + 'k'
      return String(value)
    }

    /** Session-scoped slots receive the standard session seats; accept any shape. */
    function pickSessionId(props) {
      if (typeof props.sessionId === 'string' && props.sessionId !== '') return props.sessionId
      var session = props.session
      if (session && typeof session === 'object' && typeof session.sessionId === 'string') return session.sessionId
      var useSession = props.useSession
      if (typeof useSession === 'function') {
        try {
          var picked = useSession(function (snapshot) {
            return snapshot && typeof snapshot.sessionId === 'string' ? snapshot.sessionId : undefined
          })
          if (typeof picked === 'string' && picked !== '') return picked
        } catch (error) {
          /* fall through to the unknown state */
        }
      }
      return undefined
    }

    function gauge() {
      return React.createElement(
        'svg',
        {
          width: 12,
          height: 12,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          style: { flex: 'none', opacity: 0.9 },
        },
        React.createElement('path', { d: 'M2.6 12.4a6.6 6.6 0 1 1 10.8 0' }),
        React.createElement('path', { d: 'M8 8.6 10.9 5.8' }),
      )
    }

    function CompactRatioPill(props) {
      var sessionId = pickSessionId(props)
      var dataState = React.useState(null)
      var data = dataState[0]
      var setData = dataState[1]
      var openState = React.useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var tabState = React.useState('ratio')
      var tab = tabState[0]
      var setTab = tabState[1]
      var placeState = React.useState(null)
      var place = placeState[0]
      var setPlace = placeState[1]
      var draftState = React.useState('')
      var draft = draftState[0]
      var setDraft = draftState[1]
      var retainDraftState = React.useState('')
      var retainDraft = retainDraftState[0]
      var setRetainDraft = retainDraftState[1]
      var errorState = React.useState('')
      var error = errorState[0]
      var setError = errorState[1]
      var buttonRef = React.useRef(null)

      React.useEffect(
        function () {
          if (!sessionId) return undefined
          var alive = true
          function load() {
            fetch('/dsh-compact-tuner/state?sessionId=' + encodeURIComponent(sessionId))
              .then(function (response) { return response.json() })
              .then(function (next) { if (alive && next && next.ok) setData(next) })
              .catch(function () {})
          }
          load()
          var timer = setInterval(load, 5000)
          return function () {
            alive = false
            clearInterval(timer)
          }
        },
        [sessionId],
      )

      React.useEffect(
        function () {
          if (!open) return undefined
          function onDown(event) {
            var node = buttonRef.current
            if (node !== null && node.contains(event.target)) return
            var target = event.target
            if (target && typeof target.closest === 'function' && target.closest('[data-compact-ratio-menu="true"]') !== null) return
            setOpen(false)
          }
          function onKey(event) {
            if (event.key === 'Escape') setOpen(false)
          }
          document.addEventListener('mousedown', onDown)
          document.addEventListener('keydown', onKey)
          return function () {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
          }
        },
        [open],
      )

      var tunable = data !== null && data.tunable === true && sessionId !== undefined
      var current = data && typeof data.ratio === 'number' ? data.ratio : null
      var base = data && typeof data.default === 'number' ? data.default : null
      var currentRetain = data && typeof data.retain === 'number' ? data.retain : null
      var baseRetain = data && typeof data.defaultRetain === 'number' ? data.defaultRetain : null
      var shown = current === null ? base : current
      var label = tunable ? (shown === null ? '默认' : pct(shown)) : '未启用'

      function failureMessage(message) {
        if (typeof message === 'string' && message !== '') {
          if (message.indexOf('within 0.05') !== -1) return '比例需在 5%–95% 之间'
          if (message.indexOf('retainTokens') !== -1) return '保留量需在 1k–200k token 之间'
          if (message.indexOf('sessionId') !== -1) return '拿不到当前对话，刷新页面再试'
          return message
        }
        return '没保存成功，再试一次'
      }

      function commit(query) {
        if (!sessionId) return
        fetch(
          '/dsh-compact-tuner/set?sessionId=' + encodeURIComponent(sessionId) + '&' + query,
          { method: 'POST' },
        )
          .then(function (response) { return response.json() })
          .then(function (next) {
            if (next && next.ok) {
              setError('')
              setData(function (prev) {
                var merged = Object.assign({}, prev === null ? {} : prev, next)
                // An older backend omits `tunable` in the set response; keep the last known value.
                if (typeof merged.tunable !== 'boolean' && prev !== null && typeof prev.tunable === 'boolean') {
                  merged.tunable = prev.tunable
                }
                return merged
              })
              setOpen(false)
              return
            }
            setError(failureMessage(next && next.message))
          })
          .catch(function () { setError('没连上本地服务，再试一次') })
      }

      function toggle() {
        if (!tunable) return
        if (open) {
          setOpen(false)
          return
        }
        setError('')
        setDraft(shown === null ? '' : String(Math.round(shown * 1000) / 10))
        setRetainDraft(currentRetain === null ? '' : String(currentRetain))
        if (buttonRef.current !== null) {
          var rect = buttonRef.current.getBoundingClientRect()
          var room = window.innerWidth - rect.right
          setPlace({
            right: room < WIDTH + 8 ? Math.max(8, room) : window.innerWidth - rect.right,
            left: room < WIDTH + 8 ? 8 : null,
            bottom: window.innerHeight - rect.top + 8,
          })
        }
        setOpen(true)
      }

      function applyDraft() {
        var raw = String(draft).replace('%', '').trim()
        if (raw === '') {
          setError('先填一个 5–95 之间的数字')
          return
        }
        var value = Number(raw)
        if (!Number.isFinite(value)) {
          setError('只能填数字，比如 25')
          return
        }
        if (value < 5 || value > 95) {
          setError('比例需在 5%–95% 之间')
          return
        }
        setError('')
        commit('ratio=' + encodeURIComponent(String(Math.round(value * 10) / 1000)))
      }

      function applyRetainDraft() {
        var raw = String(retainDraft).replace(/[^0-9]/g, '')
        if (raw === '') {
          setError('先填一个 1k–200k 之间的数字')
          return
        }
        var value = Number(raw)
        if (!Number.isFinite(value) || value < RETAIN_MIN || value > RETAIN_MAX) {
          setError('保留量需在 1k–200k token 之间')
          return
        }
        setError('')
        commit('retainTokens=' + encodeURIComponent(String(Math.round(value))))
      }

      function row(value, text, selected, onSelect) {
        return React.createElement(
          'div',
          {
            key: value,
            role: 'button',
            tabIndex: 0,
            onMouseDown: function (event) { event.preventDefault() },
            onClick: onSelect,
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '6px 8px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: selected ? 600 : 400,
              background: selected ? HOVER : 'transparent',
            },
          },
          React.createElement('span', null, text),
          selected ? React.createElement('span', { style: { color: MUTED, fontSize: 11 } }, '当前') : null,
        )
      }

      function segment(text, value) {
        var active = tab === value
        return React.createElement(
          'div',
          {
            key: value,
            role: 'button',
            tabIndex: 0,
            onMouseDown: function (event) { event.preventDefault() },
            onClick: function () { setTab(value); setError('') },
            style: {
              flex: '1',
              textAlign: 'center',
              padding: '4px 0',
              borderRadius: 6,
              cursor: 'pointer',
              background: active ? HOVER : 'transparent',
              color: active ? STRONG : MUTED,
              fontWeight: active ? 600 : 400,
            },
          },
          text,
        )
      }

      function divider() {
        return React.createElement('div', { key: 'divider', style: { height: 1, background: BORDER, margin: '6px 8px' } })
      }

      function inputRow(key, suffix, value, onChange, onApply, placeholder) {
        return React.createElement(
          'div',
          { key: key, style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 8px 2px' } },
          React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                flex: '1',
                height: 26,
                padding: '0 6px',
                borderRadius: 7,
                border: '1px solid ' + (error ? '#d93025' : BORDER),
                color: STRONG,
              },
            },
            React.createElement('input', {
              value: value,
              inputMode: 'decimal',
              placeholder: placeholder,
              onChange: function (event) { onChange(event.target.value); setError('') },
              onKeyDown: function (event) { if (event.key === 'Enter') onApply() },
              style: {
                width: '100%',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                font: 'inherit',
                color: 'inherit',
                padding: 0,
              },
            }),
            React.createElement('span', { style: { color: MUTED, fontSize: 11 } }, suffix),
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              onClick: onApply,
              style: {
                height: 26,
                padding: '0 10px',
                borderRadius: 7,
                border: '1px solid ' + BORDER,
                background: HOVER,
                color: STRONG,
                font: 'inherit',
                cursor: 'pointer',
              },
            },
            '应用',
          ),
        )
      }

      var section = tab === 'ratio'
        ? [
            PRESETS.map(function (value) {
              return row(String(value), pct(value), current !== null && Math.abs(current - value) < 1e-9, function () {
                commit('ratio=' + encodeURIComponent(String(value)))
              })
            }),
            divider(),
            row('default', '跟随默认' + (base === null ? '' : '（' + pct(base) + '）'), current === null, function () {
              commit('ratio=default')
            }),
            inputRow('input', '%', draft, setDraft, applyDraft, '5-95'),
          ]
        : [
            RETAIN_PRESETS.map(function (value) {
              return row(String(value), tok(value), currentRetain !== null && currentRetain === value, function () {
                commit('retainTokens=' + encodeURIComponent(String(value)))
              })
            }),
            divider(),
            row('default', '跟随默认' + (baseRetain === null ? '（按比例）' : '（' + tok(baseRetain) + '）'), currentRetain === null, function () {
              commit('retainTokens=default')
            }),
            inputRow('input', 'tok', retainDraft, setRetainDraft, applyRetainDraft, '20000'),
          ]

      var menu = open && tunable
        ? React.createElement(
            'div',
            {
              'data-compact-ratio-menu': 'true',
              style: {
                position: 'fixed',
                left: place && place.left !== null ? place.left : 'auto',
                right: place && place.left === null ? place.right : 'auto',
                bottom: place ? place.bottom : 8,
                width: WIDTH,
                padding: '10px 8px 8px',
                borderRadius: 12,
                background: SURFACE,
                backdropFilter: 'var(--dsw-menu-backdrop-filter, saturate(180%) blur(20px))',
                WebkitBackdropFilter: 'var(--dsw-menu-backdrop-filter, saturate(180%) blur(20px))',
                border: '1px solid ' + BORDER,
                boxShadow: 'var(--dsw-elevation-prominent, 0 14px 36px rgba(0,0,0,0.18))',
                zIndex: 4000,
                fontSize: 12,
                lineHeight: '18px',
                color: STRONG,
              },
            },
            React.createElement(
              'div',
              { style: { padding: '0 8px 6px' } },
              React.createElement('div', { style: { fontWeight: 600 } }, tab === 'ratio' ? '压缩触发比例' : '压缩保留量'),
              React.createElement(
                'div',
                { style: { color: MUTED, marginTop: 2, fontSize: 11, lineHeight: '16px' } },
                tab === 'ratio' ? HINT_RATIO : HINT_RETAIN,
              ),
            ),
            React.createElement(
              'div',
              { style: { display: 'flex', gap: 4, padding: '0 8px 6px' } },
              segment('触发比例', 'ratio'),
              segment('保留量', 'retain'),
            ),
            section,
            React.createElement(
              'div',
              { style: { padding: '6px 8px 0', color: error ? '#d93025' : MUTED, fontSize: 11 } },
              error === '' ? '仅对当前对话生效' : error,
            ),
          )
        : null

      return React.createElement(
        'span',
        { style: { order: 1, display: 'inline-flex', alignItems: 'center' } },
        React.createElement(
          'button',
          {
            ref: buttonRef,
            type: 'button',
            disabled: !tunable,
            onClick: toggle,
            title: tunable ? HINT_RATIO : '这个对话没有启用「压缩模式」preset，压缩比例是固定的。',
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              height: 22,
              padding: '0 6px',
              borderRadius: 6,
              border: 'none',
              background: open ? HOVER : 'transparent',
              color: MUTED,
              font: 'inherit',
              fontSize: 12,
              lineHeight: '18px',
              cursor: tunable ? 'pointer' : 'default',
              opacity: tunable ? 1 : 0.55,
            },
          },
          gauge(),
          React.createElement('span', null, '压缩 ' + label),
          tunable ? React.createElement('span', { style: { fontSize: 9, opacity: 0.7 } }, '\u25b4') : null,
        ),
        portal(menu),
      )
    }

    module.exports = {
      name: 'dsh-compact-tuner',
      inject: ['slots'],
      apply(ctx) {
        var slots = ctx.slots ?? ctx.get('slots')
        if (slots === undefined) return
        ctx.effect(function () {
          return slots.inject('conversation.composer.dock', function () {
            return slots.register(
              {
                name: 'conversation.composer.dock',
                id: 'compact-ratio',
                order: 3,
              },
              CompactRatioPill,
            )
          })
        })
      },
    }

    return module.exports
  },
})
