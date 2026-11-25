import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { ALL_TUFFEX_ELEMENT_BUNDLES, registerTuffexElements, TxButtonElement } from '../index'

beforeAll(() => {
  registerTuffexElements()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('tier A custom elements (18 components)', () => {
  it('renders tx-button with slot projection, boolean border="false", and single bubbling composed click', async () => {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = `<tx-button variant="primary" border="false">Run Build</tx-button>`
    document.body.appendChild(wrapper)
    await nextTick()

    const host = wrapper.querySelector('tx-button')!
    const btn = host.querySelector('button.tx-button') as HTMLButtonElement | null
    expect(btn).not.toBeNull()
    expect(btn?.classList.contains('variant-primary')).toBe(true)
    expect(btn?.classList.contains('borderless')).toBe(true)
    expect(btn?.textContent?.trim()).toBe('Run Build')

    const onWrapperClick = vi.fn()
    wrapper.addEventListener('click', onWrapperClick)

    btn!.click()
    await nextTick()

    expect(onWrapperClick).toHaveBeenCalledTimes(1)
    const evt = onWrapperClick.mock.calls[0]![0] as CustomEvent
    expect(evt).toBeInstanceOf(CustomEvent)
    expect(evt.bubbles).toBe(true)
    expect(evt.composed).toBe(true)
  })

  it('mounts tx-button without Vue dev autofocus prop-override warnings and forwards autofocus via native attr observation', async () => {
    const buttonDefProps = (TxButtonElement.def?.props ?? {}) as Record<string, unknown>
    expect(buttonDefProps).not.toHaveProperty('autofocus')

    // jsdom omits HTMLOrForeignElement.autofocus from HTMLElement.prototype, unlike Chromium/Firefox/Safari.
    // Define it temporarily so Vue 3.5's `_resolveProps` conflict check executes as in real browsers.
    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'autofocus')
    if (!originalDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'autofocus', {
        configurable: true,
        get() {
          return this.hasAttribute('autofocus')
        },
        set(val: boolean) {
          if (val)
            this.setAttribute('autofocus', '')
          else
            this.removeAttribute('autofocus')
        },
      })
    }

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const container = document.createElement('div')
      container.innerHTML = `
        <tx-button variant="primary">Default Button</tx-button>
        <tx-button autofocus>Focused Button</tx-button>
      `
      document.body.appendChild(container)
      await nextTick()
      await nextTick()

      const warnings = warnSpy.mock.calls.map(args => args.map(String).join(' '))
      expect(warnings.filter(msg => /autofocus|conflicts with an existing property/i.test(msg))).toEqual([])
      expect(warnings).toEqual([])

      const buttons = container.querySelectorAll('tx-button button.tx-button')
      expect(buttons).toHaveLength(2)
      expect(document.activeElement).toBe(buttons[1])

      // Guard every registered WC bundle against overriding standard HTMLElement properties.
      for (const bundle of ALL_TUFFEX_ELEMENT_BUNDLES) {
        const rawProps = Object.keys((bundle.ElementClass.def?.props ?? {}) as Record<string, unknown>)
        for (const propKey of rawProps) {
          expect(
            propKey in HTMLElement.prototype,
            `${bundle.tag} prop "${propKey}" collides with HTMLElement.prototype`,
          ).toBe(false)
        }
      }
    }
    finally {
      warnSpy.mockRestore()
      if (!originalDescriptor)
        delete (HTMLElement.prototype as unknown as Record<string, unknown>).autofocus
    }
  })

  it('renders tx-badge, tx-tag (with close event), tx-avatar, tx-spinner, tx-divider, and tx-kbd', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-badge variant="success" value="9"></tx-badge>
      <tx-tag label="Beta" closable variant="soft"></tx-tag>
      <tx-avatar name="Ada Lovelace" status="online"></tx-avatar>
      <tx-spinner size="24" label="Fetching"></tx-spinner>
      <tx-divider dashed text-placement="left" gradient="both">Specs</tx-divider>
      <tx-kbd tone="primary">⌘K</tx-kbd>
    `
    document.body.appendChild(container)
    await nextTick()

    // Badge
    const badge = container.querySelector('tx-badge')!
    expect(badge.querySelector('.tx-badge')).not.toBeNull()
    expect(badge.textContent).toContain('9')

    // Tag + close event
    const tag = container.querySelector('tx-tag')!
    expect(tag.textContent).toContain('Beta')
    const onTagClose = vi.fn()
    container.addEventListener('close', onTagClose)
    const tagCloseBtn = tag.querySelector('button') as HTMLButtonElement | null
    expect(tagCloseBtn).not.toBeNull()
    tagCloseBtn!.click()
    await nextTick()
    expect(onTagClose).toHaveBeenCalledTimes(1)
    expect((onTagClose.mock.calls[0]![0] as CustomEvent).bubbles).toBe(true)
    expect((onTagClose.mock.calls[0]![0] as CustomEvent).composed).toBe(true)

    // Avatar
    const avatar = container.querySelector('tx-avatar')!
    expect(avatar.querySelector('.tx-avatar')).not.toBeNull()

    // Spinner
    const spinner = container.querySelector('tx-spinner')!
    expect(spinner.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Fetching')

    // Divider
    const divider = container.querySelector('tx-divider')!
    expect(divider.querySelector('.tx-divider')).not.toBeNull()
    expect(divider.textContent).toContain('Specs')

    // Kbd
    const kbd = container.querySelector('tx-kbd')!
    expect(kbd.querySelector('.tx-kbd')?.textContent?.trim()).toBe('⌘K')
  })

  it('renders tx-alert (closable event) and tx-card with named header/default/footer slots', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-alert type="warning" title="Disk Low" message="Free up space soon."></tx-alert>
      <tx-card shadow="soft">
        <div slot="header">Card Title</div>
        <p>Card Body</p>
        <div slot="footer">Card Footer</div>
      </tx-card>
    `
    document.body.appendChild(container)
    await nextTick()

    const alert = container.querySelector('tx-alert')!
    expect(alert.textContent).toContain('Disk Low')
    expect(alert.textContent).toContain('Free up space soon.')

    const onClose = vi.fn()
    container.addEventListener('close', onClose)
    const closeBtn = alert.querySelector('.tx-alert__close, button') as HTMLButtonElement | null
    expect(closeBtn).not.toBeNull()
    closeBtn!.click()
    await nextTick()
    expect(onClose).toHaveBeenCalledTimes(1)

    const card = container.querySelector('tx-card')!
    expect(card.querySelector('.tx-card')).not.toBeNull()
    expect(card.textContent).toContain('Card Title')
    expect(card.textContent).toContain('Card Body')
    expect(card.textContent).toContain('Card Footer')
  })

  it('renders tx-progress, tx-progress-bar (with JSON segments), tx-skeleton, tx-status-badge, tx-status-hint, tx-dot-indicator, tx-empty, and tx-stat-card', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-progress percentage="75" show-text></tx-progress>
      <tx-progress-bar percentage="60" message="Indexing" segments='[{"value":40,"label":"TS"},{"value":20,"label":"CSS"}]'></tx-progress-bar>
      <tx-skeleton lines="2"></tx-skeleton>
      <tx-status-badge text="Approved" status="success"></tx-status-badge>
      <tx-status-hint text="Saved" tone="success" animated="false"></tx-status-hint>
      <tx-dot-indicator color="#10b981" label="Online"></tx-dot-indicator>
      <tx-empty title="No Results" description="Try another query."></tx-empty>
      <tx-stat-card label="Requests" value="2048" meta="+8%" insight='{"from":100,"to":108,"type":"percent"}'></tx-stat-card>
    `
    document.body.appendChild(container)
    await nextTick()

    expect(container.querySelector('tx-progress .tx-progress-bar')).not.toBeNull()
    expect(container.querySelector('tx-progress')?.textContent).toContain('75%')
    expect(container.querySelector('tx-progress-bar .tx-progress-bar')).not.toBeNull()
    expect(container.querySelector('tx-skeleton .tx-skeleton')).not.toBeNull()
    expect(container.querySelector('tx-status-badge')?.textContent).toContain('Approved')
    expect(container.querySelector('tx-status-hint')?.textContent).toContain('Saved')
    expect(container.querySelector('tx-dot-indicator')?.textContent).toContain('Online')
    expect(container.querySelector('tx-empty')?.textContent).toContain('No Results')
    expect(container.querySelector('tx-stat-card')?.textContent).toContain('Requests')
    expect(container.querySelector('tx-stat-card')?.textContent).toContain('2,048')
  })

  it('toggles tx-switch interactively, syncs modelValue, and dispatches change + update:model-value', async () => {
    const container = document.createElement('div')
    container.innerHTML = `<tx-switch label="Auto Save"></tx-switch>`
    document.body.appendChild(container)
    await nextTick()

    const sw = container.querySelector('tx-switch')!
    const switchBtn = sw.querySelector('[role="switch"]') as HTMLElement | null
    expect(switchBtn).not.toBeNull()
    expect(switchBtn?.getAttribute('aria-checked')).toBe('false')

    const onUpdate = vi.fn()
    const onChange = vi.fn()
    container.addEventListener('update:model-value', onUpdate)
    container.addEventListener('change', onChange)

    switchBtn!.click()
    await nextTick()

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect((onUpdate.mock.calls[0]![0] as CustomEvent).detail).toBe(true)
    expect((onUpdate.mock.calls[0]![0] as CustomEvent).bubbles).toBe(true)
    expect((onUpdate.mock.calls[0]![0] as CustomEvent).composed).toBe(true)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect((onChange.mock.calls[0]![0] as CustomEvent).detail).toBe(true)
    expect(sw.modelValue).toBe(true)
    expect(switchBtn?.getAttribute('aria-checked')).toBe('true')
  })
})
