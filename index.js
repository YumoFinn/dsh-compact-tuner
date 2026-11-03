/**
 * dsh-compact-tuner — per-conversation compaction threshold and retention.
 *
 * Decorates whatever compaction service the profile already mounts (it does not
 * replace it), so a failure here can never remove compaction itself.
 *
 * The composer pill tunes two knobs for the current conversation only:
 *   - 触发比例: context pressure that starts a compaction (backend `thresholdRatio`)
 *   - 保留量:   recent tokens kept verbatim after compaction (backend `retainTokens`)
 *
 * `/compact-ratio <0.05-0.95>` still overrides the ratio; `/compact-ratio default`
 * clears it. Conversations without an override keep the backend's configured values.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const MIN_RATIO = 0.05
const MAX_RATIO = 0.95
const MIN_RETAIN = 1000
const MAX_RETAIN = 200000
const COMMAND_NAME = 'compact-ratio'
const USAGE = [
  '用法：',
  '  /compact-ratio            查看本对话当前的压缩比例',
  '  /compact-ratio 0.25       把本对话的触发比例设为 0.25（窗口的 25%）',
  '  /compact-ratio default    清除本对话的覆盖，回到全局默认',
  '',
  '保留量（压缩后原样保留的近期 token 数）请在输入框上方的「压缩」面板里设置。',
].join('\n')

function storeFile() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'storages', 'compact-ratio.json')
}

/** Keep only finite numbers from a persisted id→number map. */
function numbersOnly(map) {
  const out = {}
  if (map === null || typeof map !== 'object' || Array.isArray(map)) return out
  for (const [id, value] of Object.entries(map)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[id] = value
  }
  return out
}

/**
 * Read both override maps. Older stores persisted a bare id→ratio map at the
 * top level; those still load as ratios and start with no retention overrides.
 */
function readStore() {
  try {
    const raw = JSON.parse(readFileSync(storeFile(), 'utf8'))
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ratios: {}, retains: {} }
    return { ratios: numbersOnly(raw.ratios ?? raw), retains: numbersOnly(raw.retains) }
  } catch {
    return { ratios: {}, retains: {} }
  }
}

function writeStore(store) {
  const file = storeFile()
  try {
    mkdirSync(join(file, '..'), { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, `${JSON.stringify({ version: 1, ratios: store.ratios, retains: store.retains }, null, 2)}\n`, 'utf8')
    renameSync(tmp, file)
  } catch {
    /* best effort: the in-memory override still applies for this process */
  }
}

/** Sessions this process decorated, so the pill can tell "not on that preset". */
const seenThisProcess = new Set()

function seenFile() {
  return join(storeFile(), '..', 'compact-ratio.seen.json')
}

function readSeen() {
  try {
    const raw = JSON.parse(readFileSync(seenFile(), 'utf8'))
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out = {}
    for (const [id, value] of Object.entries(raw)) {
      if (typeof value === 'number') out[id] = { at: value }
      else if (value !== null && typeof value === 'object') out[id] = value
    }
    return out
  } catch {
    return {}
  }
}

function markSeen(sessionId, base, baseRetain) {
  if (seenThisProcess.has(sessionId)) return
  seenThisProcess.add(sessionId)
  try {
    const seen = readSeen()
    const entry = { at: Date.now() }
    if (typeof base === 'number') entry.base = base
    if (typeof baseRetain === 'number') entry.baseRetain = baseRetain
    seen[sessionId] = entry
    writeFileSync(seenFile(), `${JSON.stringify(seen)}\n`, 'utf8')
  } catch {
    /* best effort: the pill just stays gated for this session */
  }
}

/**
 * Copy of a resolved backend config carrying only the requested overrides.
 * The backend resolves its target policy synchronously before its first await,
 * so this copy only has to hold for that synchronous prefix.
 */
function deriveConfig(config, ratio, retainTokens) {
  const nextRatio = typeof ratio === 'number' ? ratio : config.thresholdRatio
  const retainRatio = config.retainRatio ?? 0.16
  const shared = Math.max(0.02, Math.min(retainRatio, nextRatio * 0.4))
  const modelPolicies = (config.modelPolicies ?? []).map((policy) => {
    const next = { ...policy, thresholdRatio: nextRatio }
    // An explicit per-model retention override wins over both knobs.
    if (typeof retainTokens === 'number') return next
    if (policy.retainTokens !== undefined || policy.retainRatio !== undefined) return next
    if (config.retainTokens !== undefined) return { ...next, retainTokens: config.retainTokens }
    return { ...next, retainRatio: Math.min(policy.retainRatio ?? shared, shared) }
  })
  const derived = { ...config, thresholdRatio: nextRatio, modelPolicies }
  if (typeof retainTokens === 'number') {
    delete derived.retainRatio
    derived.retainTokens = retainTokens
  } else if (config.retainTokens === undefined) {
    derived.retainRatio = Math.min(retainRatio, shared)
  } else {
    delete derived.retainRatio
  }
  return derived
}

export const name = 'dsh-compact-tuner'

export function apply(ctx, config) {
  const role = config?.role === 'host' || config?.role === 'engine' ? config.role : 'both'
  /** Resolved lazily: each seat below waits for its own service. */
  const state = { engine: undefined }

  report(ctx, { step: 'apply', role })

  if (role !== 'host') ctx.inject(['compaction'], (scope) => {
    const engine = scope.compaction
    if (engine === undefined || typeof engine.compactIfNeeded !== 'function') {
      report(ctx, { step: 'engine', ok: false, error: 'no compactIfNeeded' })
      return
    }
    state.engine = engine
    const original = engine.compactIfNeeded

    /**
     * The backend resolves its target policy synchronously before the first
     * `await`, so the derived config only has to hold for the synchronous prefix
     * of the call — no other task can observe the swap.
     */
    const decorated = function compactIfNeeded(agent, trigger, signal) {
      const sessionId = agent?.session?.id
      if (typeof sessionId === 'string') markSeen(sessionId, engine.config?.thresholdRatio, engine.config?.retainTokens)
      if (trigger !== 'pressure') return original.call(engine, agent, trigger, signal)
      // The host seat owns the pill and the slash command and writes the store;
      // this engine seat may have loaded its session before that write. Read the
      // store at decision time so a change made mid-conversation takes effect on
      // the very next step instead of keeping the value captured at load.
      const store = typeof sessionId === 'string' ? readStore() : { ratios: {}, retains: {} }
      const ratio = store.ratios[sessionId]
      const retain = store.retains[sessionId]
      if (typeof ratio !== 'number' && typeof retain !== 'number') return original.call(engine, agent, trigger, signal)
      const saved = engine.config
      let derived
      try {
        derived = deriveConfig(saved, ratio, retain)
      } catch {
        return original.call(engine, agent, trigger, signal)
      }
      engine.config = derived
      let pending
      try {
        pending = original.call(engine, agent, trigger, signal)
      } finally {
        engine.config = saved
      }
      if (typeof retain !== 'number' || typeof pending?.catch !== 'function') return pending
      // A retention above the resolved threshold aborts the whole compaction
      // (the backend throws TargetPressureConfigError). Retry once with the
      // ratio-derived tail so an oversized value degrades instead of disabling it.
      return pending.catch((error) => {
        if (!/retainTokens .* must be less than threshold/.test(String(error?.message ?? ''))) throw error
        report(ctx, { step: 'retain-fallback', error: String(error?.message ?? error) })
        ctx.logger.warn(`compact-ratio: retention ${retain} exceeds the threshold; using the default tail for this compaction`)
        engine.config = deriveConfig(saved, ratio, undefined)
        try {
          return original.call(engine, agent, trigger, signal)
        } finally {
          engine.config = saved
        }
      })
    }

    scope.effect(function* () {
      engine.compactIfNeeded = decorated
      yield () => {
        if (engine.compactIfNeeded === decorated) engine.compactIfNeeded = original
      }
    }, 'compact-ratio engine')
    report(ctx, { step: 'engine', ok: true })
  })

  if (role !== 'engine') {
    ctx.inject(['commands'], (scope) => {
      scope.effect(function* () {
        yield scope.commands.register({
          definitionId: 'dsh-compact-ratio',
          name: COMMAND_NAME,
          description: '查看或设置本对话的压缩触发比例',
          handler: (invocation) => handle(scope, state.engine, invocation),
        })
      }, 'compact-ratio command')
    })

    ctx.inject(['webServer'], (scope) => {
      registerRoutes(scope, state)
    })
  }
}

/** Best-effort activation record, so a silent failure is diagnosable later. */
function report(ctx, data) {
  try {
    const file = join(storeFile(), '..', 'compact-ratio.health.json')
    writeFileSync(file, `${JSON.stringify({ ...data, at: new Date().toISOString() }, null, 2)}\n`, 'utf8')
  } catch {
    /* diagnostics must never break activation */
  }
}

/** Small same-origin JSON API backing the composer pill. */
function registerRoutes(ctx, state) {
  const webServer = ctx.webServer
  if (webServer === undefined || typeof webServer.register !== 'function') {
    report(ctx, { step: 'routes', webServer: webServer !== undefined, error: 'no webServer service' })
    return
  }

  const json = (res, data) => {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(data))
  }
  const params = (url) => {
    const out = {}
    const query = String(url ?? '').split('?')[1]
    if (query === undefined) return out
    for (const pair of query.split('&')) {
      if (pair === '') continue
      const i = pair.indexOf('=')
      const k = i >= 0 ? pair.slice(0, i) : pair
      const v = i >= 0 ? pair.slice(i + 1) : ''
      out[decodeURIComponent(k)] = decodeURIComponent(v || '')
    }
    return out
  }
  const defaultRatio = () => state.engine?.config?.thresholdRatio ?? null
  const defaultRetain = () => state.engine?.config?.retainTokens ?? null
  /** Base values reported by the preset-scoped decorator when the host has none. */
  const seenEntry = (sessionId) => {
    const seen = readSeen()
    return sessionId !== '' && Object.hasOwn(seen, sessionId) ? seen[sessionId] : undefined
  }
  const stateFor = (sessionId) => {
    const entry = seenEntry(sessionId)
    const store = readStore()
    return {
      ok: true,
      sessionId,
      default: defaultRatio() ?? (typeof entry?.base === 'number' ? entry.base : null),
      defaultRetain: defaultRetain() ?? (typeof entry?.baseRetain === 'number' ? entry.baseRetain : null),
      ratio: store.ratios[sessionId] ?? null,
      retain: store.retains[sessionId] ?? null,
      tunable: entry !== undefined,
    }
  }

  let failed = false
  try {
    webServer.register({
      kind: 'exact',
      path: '/dsh-compact-tuner/state',
      handler: (req, res) => {
        json(res, stateFor(params(req.url).sessionId ?? ''))
      },
    })
    webServer.register({
      kind: 'exact',
      path: '/dsh-compact-tuner/set',
      handler: (req, res) => {
        const query = params(req.url)
        const sessionId = query.sessionId ?? ''
        if (sessionId === '') {
          json(res, { ok: false, message: 'missing sessionId' })
          return
        }
        if (query.ratio === undefined && query.retainTokens === undefined) {
          json(res, { ok: false, message: 'missing ratio or retainTokens' })
          return
        }
        const store = readStore()
        if (query.ratio !== undefined) {
          if (query.ratio === 'default' || query.ratio === '') {
            delete store.ratios[sessionId]
          } else {
            const ratio = Number(query.ratio)
            if (!Number.isFinite(ratio) || ratio < MIN_RATIO || ratio > MAX_RATIO) {
              json(res, { ok: false, message: `ratio must be within ${MIN_RATIO}-${MAX_RATIO}` })
              return
            }
            store.ratios[sessionId] = ratio
          }
        }
        if (query.retainTokens !== undefined) {
          if (query.retainTokens === 'default' || query.retainTokens === '') {
            delete store.retains[sessionId]
          } else {
            const retain = Number(query.retainTokens)
            if (!Number.isInteger(retain) || retain < MIN_RETAIN || retain > MAX_RETAIN) {
              json(res, { ok: false, message: `retainTokens must be an integer within ${MIN_RETAIN}-${MAX_RETAIN}` })
              return
            }
            store.retains[sessionId] = retain
          }
        }
        writeStore(store)
        json(res, stateFor(sessionId))
      },
    })
  } catch (error) {
    failed = true
    const message = error instanceof Error ? error.message : String(error)
    report(ctx, { step: 'routes', webServer: true, error: message })
    ctx.logger.warn(`compact-ratio: route registration failed: ${message}`)
  }
  if (!failed) report(ctx, { step: 'ready', webServer: true })
}

async function handle(ctx, engine, invocation) {
  const sessionId = invocation.agent?.session?.id
  if (typeof sessionId !== 'string') return { kind: 'error', text: '当前没有活动对话。' }

  const store = readStore()
  const seen = readSeen()[sessionId]
  const base = engine?.config?.thresholdRatio ?? (typeof seen?.base === 'number' ? seen.base : '（未知）')
  const raw = (invocation.rawInput ?? '').trim()

  if (raw === '') {
    const override = store.ratios[sessionId]
    const text =
      override === undefined
        ? `本对话压缩比例：全局默认 ${base}。\n用 /compact-ratio <比例> 单独调整。`
        : `本对话压缩比例：${override}，覆盖了全局默认 ${base}。\n用 /compact-ratio default 清除。`
    return { kind: 'success', text }
  }

  if (raw === 'default' || raw === 'reset' || raw === 'auto') {
    const had = store.ratios[sessionId] !== undefined
    delete store.ratios[sessionId]
    writeStore(store)
    return {
      kind: 'success',
      text: had ? `已清除本对话的覆盖，回到全局默认 ${base}。` : `本对话没有覆盖，当前沿用全局默认 ${base}。`,
    }
  }

  const ratio = Number(raw)
  if (!Number.isFinite(ratio) || ratio < MIN_RATIO || ratio > MAX_RATIO) {
    return { kind: 'error', text: `${USAGE}\n\n比例必须在 ${MIN_RATIO} – ${MAX_RATIO} 之间。` }
  }
  store.ratios[sessionId] = ratio
  writeStore(store)
  const percent = Math.round(ratio * 1000) / 10
  return {
    kind: 'success',
    text:
      `已把本对话的压缩触发比例设为 ${ratio}（窗口的 ${percent}%），从下一步起生效；` +
      `只影响这个对话，其他对话仍是 ${base}。`,
  }
}
