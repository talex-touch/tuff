// Installed into the main window at the start of every CDP session (`CDP_PRELUDE`), so each step
// of capture.sh is one short expression against `window.__shellkit`. Idempotent: a page reload
// drops it and the next session puts it back.
;(() => {
  if (window.__shellkit) return 'present'

  const CHANNEL = '@main-process-message'
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const page = () => document.querySelector('[data-testid="voice-insights-page"]')
  const state = () => {
    const value = page()?.__vueParentComponent?.setupState
    if (!value) throw new Error('no component state on the voice page root')
    return value
  }

  /** One request on the raw main-process channel, the envelope the renderer channel core uses. */
  function ipc(name, data, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const bridge = window.electron.ipcRenderer
      const id = `${Date.now()}#${name}@shellkit-${Math.random().toString(36).slice(2)}`
      let off = null
      const timer = setTimeout(() => {
        off?.()
        reject(new Error(`timeout waiting for ${name}`))
      }, timeout)
      off = bridge.on(CHANNEL, (_event, arg) => {
        if (arg?.header?.status !== 'reply' || arg?.sync?.id !== id) return
        clearTimeout(timer)
        off?.()
        resolve({ code: arg.code, data: arg.data })
      })
      bridge.send(CHANNEL, {
        code: 200,
        data,
        sync: { timeStamp: Date.now(), timeout, id },
        name,
        header: { status: 'request', type: 'main' }
      })
    })
  }

  async function patchAppSetting(patch) {
    const key = 'app-setting.ini'
    const current = await ipc('storage:app:get', { key })
    const value = { ...(current.data ?? {}), ...patch(current.data ?? {}) }
    const saved = await ipc('storage:app:save', { key, value, force: true, persist: true })
    return saved.code
  }

  /**
   * A fresh profile is held at the onboarding gate (`beginner.init`), and both phases have to
   * render the same copy and the same colours, so the language and the theme are pinned too:
   * zh-CN regardless of the system, dark regardless of the system appearance, plain window
   * background regardless of the daily wallpaper.
   */
  async function prepareProfile() {
    const gate = await patchAppSetting((value) => ({
      beginner: { ...(value.beginner ?? {}), init: true },
      lang: { followSystem: false, locale: 'zh-CN' }
    }))
    const theme = await ipc('storage:app:save', {
      key: 'theme-style.ini',
      value: {
        theme: {
          window: 'pure',
          style: { dark: true, auto: false },
          addon: { contrast: false, coloring: false },
          transition: { route: 'slide' }
        }
      },
      force: true,
      persist: true
    })
    return { gate, theme: theme.code }
  }

  /** The voice page, loaded, scrolled to the top, nothing focused. */
  async function goto() {
    const want = '#/setting/intelligence/voice'
    if (location.hash !== want) location.hash = want
    const started = performance.now()
    let root = null
    while (performance.now() - started < 12000) {
      root = page()
      if (root && root.getAttribute('aria-busy') === 'false') break
      await wait(100)
    }
    if (!root) throw new Error('voice page did not render')
    document.activeElement?.blur?.()
    for (let node = root.parentElement; node; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight + 1) node.scrollTop = 0
    }
    await frame()
    await frame()
    return ['empty', 'data', 'loading'].find((name) =>
      root.querySelector(`[data-testid="voice-insights-${name}"]`)
    )
  }

  /** How tall the viewport must be for the whole page to fit without its scroller. */
  function neededHeight() {
    let extra = 0
    for (let node = page()?.parentElement; node; node = node.parentElement) {
      extra = Math.max(extra, node.scrollHeight - node.clientHeight)
    }
    return innerHeight + extra
  }

  /**
   * Holds the empty-state waveform on its t=0 frame — the frame reduced motion shows — so the
   * ornament cannot differ between two captures taken seconds apart. Uses the page's own drawing
   * functions; nothing about the page's markup or styles changes.
   */
  async function freezeWave() {
    const canvas = page()?.querySelector('canvas.VoiceInsights-Wave')
    if (!canvas) return 'no wave'
    const { stopWave, resizeWave, drawWave } = state()
    stopWave()
    resizeWave(canvas)
    drawWave(canvas, 0)
    await frame()
    return 'frozen'
  }

  /** Opens the ⋯ menu with a click on its trigger and waits out the panel's entrance. */
  async function openMenu() {
    const trigger = document.querySelector('[data-testid="voice-insights-more"]')
    if (!trigger) throw new Error('no menu trigger')
    trigger.click()
    await wait(900)
    const panel = document.querySelector('[data-testid="voice-insights-share"]')?.closest('.tx-base-anchor')
    return { open: Boolean(panel?.classList.contains('is-open')) }
  }

  /** All three notices at once, by flipping the page's own state. Nothing reaches main. */
  async function forceNotices() {
    const value = state()
    value.loadFailed = true
    value.copyFailed = true
    value.postClearRefreshFailed = true
    await wait(400)
    return ['error', 'copy-error', 'clear-refresh-warning'].map((id) =>
      document.querySelector(`[data-testid="voice-insights-${id}"]`)?.getAttribute('role')
    )
  }

  /** Box geometry and the computed styles that matter, for every region the kit takes over. */
  function geometry() {
    const round = (rect) => ({
      x: Math.round(rect.x * 10) / 10,
      y: Math.round(rect.y * 10) / 10,
      w: Math.round(rect.width * 10) / 10,
      h: Math.round(rect.height * 10) / 10
    })
    const pick = (node, keys) => {
      const style = getComputedStyle(node)
      return Object.fromEntries(keys.map((key) => [key, style[key]]))
    }
    const out = { viewport: `${innerWidth}x${innerHeight}` }
    const root = page()
    const header = root?.querySelector(':scope > header')
    if (header) {
      out.header = { box: round(header.getBoundingClientRect()), ...pick(header, ['flexDirection', 'alignItems', 'marginBottom']) }
      const h1 = header.querySelector('h1')
      if (h1) out.h1 = { box: round(h1.getBoundingClientRect()), ...pick(h1, ['fontSize', 'fontWeight', 'lineHeight', 'userSelect', 'color']) }
      const actions = header.querySelector('.shell-chrome-safe-inline-end')
      if (actions) {
        out.actions = { box: round(actions.getBoundingClientRect()), ...pick(actions, ['flexDirection', 'gap', 'marginRight']) }
        out.actionChildren = [...actions.querySelectorAll('[data-testid="voice-status-alert"], [data-testid="voice-insights-records-jump"], [data-testid="voice-insights-more"]')].map((node) => ({
          id: node.dataset.testid,
          box: round(node.getBoundingClientRect())
        }))
      }
    }
    for (const id of ['error', 'copy-error', 'clear-refresh-warning']) {
      const node = document.querySelector(`[data-testid="voice-insights-${id}"]`)
      if (!node) continue
      out[id] = {
        box: round(node.getBoundingClientRect()),
        role: node.getAttribute('role'),
        ...pick(node, ['color', 'backgroundColor', 'borderTopColor', 'alignItems', 'flexDirection', 'paddingTop', 'paddingLeft', 'borderRadius']),
        text: [...node.querySelectorAll('strong, span')].map((part) => ({ tag: part.tagName, box: round(part.getBoundingClientRect()), ...pick(part, ['fontSize', 'fontWeight', 'lineHeight', 'color']) }))
      }
    }
    const hero = document.querySelector('[data-testid="voice-insights-hero-metric"]')
    if (hero) {
      const label = hero.querySelector('p')
      const value = hero.querySelector('strong')
      const basis = hero.querySelector('[data-testid="voice-insights-saved-basis"]')
      out.hero = {
        box: round(hero.getBoundingClientRect()),
        label: label && { box: round(label.getBoundingClientRect()), ...pick(label, ['fontSize', 'color', 'gap']) },
        value: value && { box: round(value.getBoundingClientRect()), ...pick(value, ['fontSize', 'fontWeight', 'lineHeight', 'color']) },
        basis: basis && { box: round(basis.getBoundingClientRect()), tabindex: basis.getAttribute('tabindex'), role: basis.getAttribute('role'), ...pick(basis, ['color', 'cursor']) }
      }
    }
    out.metrics = [...document.querySelectorAll('[data-metric]:not([data-testid="voice-insights-hero-metric"])')].map((node) => {
      const value = node.querySelector('strong')
      const unit = value?.parentElement?.querySelector(':scope > span')
      const label = node.querySelector('p')
      return {
        metric: node.dataset.metric,
        box: round(node.getBoundingClientRect()),
        ...pick(node, ['paddingTop', 'minHeight', 'justifyContent']),
        value: value && { box: round(value.getBoundingClientRect()), ...pick(value, ['fontSize', 'fontWeight', 'letterSpacing', 'color']) },
        unit: unit && { box: round(unit.getBoundingClientRect()), ...pick(unit, ['fontSize', 'fontWeight', 'color']) },
        label: label && { box: round(label.getBoundingClientRect()), ...pick(label, ['fontSize', 'color', 'marginTop']) }
      }
    })
    const menu = document.querySelector('[data-testid="voice-insights-share"]')?.parentElement
    if (menu && menu.getBoundingClientRect().width > 0) {
      out.menu = [...menu.children].map((node) => ({
        tag: node.tagName,
        id: node.dataset?.testid ?? node.getAttribute('role'),
        box: round(node.getBoundingClientRect()),
        ...pick(node, ['color', 'fontSize', 'paddingTop', 'paddingLeft', 'borderRadius', 'backgroundColor'])
      }))
    }
    return out
  }

  window.__shellkit = { ipc, prepareProfile, goto, neededHeight, freezeWave, openMenu, forceNotices, geometry }
  return 'installed'
})()
