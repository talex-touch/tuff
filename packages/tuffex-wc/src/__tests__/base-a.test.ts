import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { BASE_A_BUNDLES, registerTuffexElements } from '../index'

beforeAll(() => {
  registerTuffexElements()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('base Pack A custom elements (35 modules / 46 tags)', () => {
  it('mounts every Pack A tag with zero Vue dev warnings', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const container = document.createElement('div')
      const nestedChildren = new Set([
        'tx-grid-item',
        'tx-breadcrumb-item',
        'tx-step',
        'tx-timeline-item',
      ])
      for (const bundle of BASE_A_BUNDLES) {
        if (nestedChildren.has(bundle.tag))
          continue
        const el = document.createElement(bundle.tag)
        if (bundle.tag === 'tx-scroll')
          el.setAttribute('native', 'true')
        if (bundle.tag === 'tx-toast')
          el.setAttribute('title', 'Ready')
        if (bundle.tag === 'tx-grid')
          el.appendChild(document.createElement('tx-grid-item'))
        if (bundle.tag === 'tx-breadcrumb')
          el.appendChild(document.createElement('tx-breadcrumb-item'))
        if (bundle.tag === 'tx-steps')
          el.appendChild(document.createElement('tx-step'))
        if (bundle.tag === 'tx-timeline')
          el.appendChild(document.createElement('tx-timeline-item'))
        container.appendChild(el)
      }
      document.body.appendChild(container)
      await nextTick()
      await nextTick()

      const warnings = warnSpy.mock.calls.map(args => args.map(String).join(' '))
      expect(warnings).toEqual([])
    }
    finally {
      warnSpy.mockRestore()
    }
  })

  it('renders layout primitives: container (+ header/aside/main/footer), flex, grid (+ grid-item), grid-layout, stack, splitter, scroll', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-container max-width="880px" fluid="false">
        <tx-header height="48">Top Bar</tx-header>
        <tx-aside width="200">Sidebar</tx-aside>
        <tx-main>Main Content</tx-main>
        <tx-footer height="40">Footer Area</tx-footer>
      </tx-container>
      <tx-flex direction="row" gap="16" align="center"><span>Flex A</span><span>Flex B</span></tx-flex>
      <tx-grid cols="2" gap="12">
        <tx-grid-item col-span="2">Wide Cell</tx-grid-item>
      </tx-grid>
      <tx-grid-layout min-item-width="240px" max-columns="3"><div class="tx-grid-layout__item">Tile</div></tx-grid-layout>
      <tx-stack direction="horizontal" gap="8"><span>S1</span><span>S2</span></tx-stack>
      <tx-splitter model-value="0.35">
        <div slot="a">Left Pane</div>
        <div slot="b">Right Pane</div>
      </tx-splitter>
      <tx-scroll native>
        <div class="scroll-body">Scrollable Body</div>
      </tx-scroll>
    `
    document.body.appendChild(container)
    await nextTick()

    expect(container.querySelector('tx-container .tx-container')).not.toBeNull()
    expect(container.querySelector('tx-header header.tx-header')?.textContent).toContain('Top Bar')
    expect((container.querySelector('tx-header header.tx-header') as HTMLElement)?.style.height).toBe('48px')
    expect((container.querySelector('tx-aside aside.tx-aside') as HTMLElement)?.style.width).toBe('200px')
    expect(container.querySelector('tx-main main.tx-main')?.textContent).toContain('Main Content')
    expect(container.querySelector('tx-footer footer.tx-footer')?.textContent).toContain('Footer Area')

    expect(container.querySelector('tx-flex .tx-flex')).not.toBeNull()
    expect(container.querySelector('tx-grid .tx-grid')).not.toBeNull()
    expect(container.querySelector('tx-grid-item .tx-grid-item')?.textContent).toContain('Wide Cell')
    expect(container.querySelector('tx-grid-layout .tx-grid-layout')).not.toBeNull()
    expect(container.querySelector('tx-stack .tx-stack')).not.toBeNull()
    expect(container.querySelector('tx-splitter .tx-splitter')).not.toBeNull()
    expect(container.querySelector('tx-splitter')?.textContent).toContain('Left Pane')
    expect(container.querySelector('tx-splitter')?.textContent).toContain('Right Pane')
    expect(container.querySelector('tx-scroll .scroll-body')?.textContent).toBe('Scrollable Body')
  })

  it('renders group-block (+ block-line/block-slot/block-switch), card-item, layout-skeleton, text (with native scroll attr), icon, icon-chip, cell-link', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-group-block name="General" description="Core preferences">
        <tx-block-line title="Version" description="1.0.0" link></tx-block-line>
        <tx-block-slot title="Theme" description="Color scheme"><span class="slot-ctrl">Dark</span></tx-block-slot>
        <tx-block-switch title="Telemetry" description="Share metrics"></tx-block-switch>
      </tx-group-block>
      <tx-card-item title="Engine" subtitle="Ready" clickable></tx-card-item>
      <tx-layout-skeleton></tx-layout-skeleton>
      <tx-text text="Long overflow string" overflow="middle" scroll="auto"></tx-text>
      <tx-text>Slotted text fallback</tx-text>
      <tx-icon name="check" size="18"></tx-icon>
      <tx-icon-chip size="18" tone="green" label="OK"></tx-icon-chip>
      <tx-cell-link href="https://tuff.tagzxia.com" label="Open Link" external></tx-cell-link>
    `
    document.body.appendChild(container)
    await nextTick()

    expect(container.querySelector('tx-group-block')?.textContent).toContain('General')
    expect(container.querySelector('tx-block-line')?.textContent).toContain('Version')
    expect(container.querySelector('tx-block-slot .slot-ctrl')?.textContent).toBe('Dark')

    const blockSwitch = container.querySelector('tx-block-switch')!
    const onSwitchChange = vi.fn()
    blockSwitch.addEventListener('change', onSwitchChange)
    const switchBtn = blockSwitch.querySelector('[role="switch"]') as HTMLElement | null
    expect(switchBtn).not.toBeNull()
    switchBtn!.click()
    await nextTick()
    expect(onSwitchChange).toHaveBeenCalledTimes(1)
    expect((onSwitchChange.mock.calls[0]![0] as CustomEvent).detail).toBe(true)

    const cardItem = container.querySelector('tx-card-item')!
    const onCardClick = vi.fn()
    cardItem.addEventListener('click', onCardClick)
    ;(cardItem.querySelector('.tx-card-item') as HTMLElement).click()
    await nextTick()
    expect(onCardClick).toHaveBeenCalledTimes(1)

    expect(container.querySelector('tx-layout-skeleton .tx-layout-skeleton')).not.toBeNull()

    const textEls = container.querySelectorAll('tx-text')
    expect(textEls[0]?.textContent).toContain('Long overflow string')
    expect(textEls[1]?.textContent).toContain('Slotted text fallback')

    expect(container.querySelector('tx-icon svg')).not.toBeNull()
    expect(container.querySelector('tx-icon-chip')?.textContent).toContain('OK')

    const cellLink = container.querySelector('tx-cell-link')!
    const onLinkOpen = vi.fn()
    cellLink.addEventListener('open', onLinkOpen)
    ;(cellLink.querySelector('a') as HTMLAnchorElement).click()
    await nextTick()
    expect(onLinkOpen).toHaveBeenCalledTimes(1)
    expect((onLinkOpen.mock.calls[0]![0] as CustomEvent).detail.href).toBe('https://tuff.tagzxia.com')
  })

  it('renders all 10 empty-state variants and forwards primary/secondary action events', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-blank-slate title="Blank" primary-action='{"label":"Create"}'></tx-blank-slate>
      <tx-empty-state variant="empty" title="Empty" secondary-action='{"label":"Reset"}'></tx-empty-state>
      <tx-error-state title="Error"></tx-error-state>
      <tx-guide-state title="Guide"></tx-guide-state>
      <tx-loading-state title="Loading"></tx-loading-state>
      <tx-no-data title="No Data"></tx-no-data>
      <tx-no-selection title="No Selection"></tx-no-selection>
      <tx-offline-state title="Offline"></tx-offline-state>
      <tx-permission-state title="Permission"></tx-permission-state>
      <tx-search-empty title="Search Empty"></tx-search-empty>
    `
    document.body.appendChild(container)
    await nextTick()

    const blankSlate = container.querySelector('tx-blank-slate')!
    const onPrimary = vi.fn()
    blankSlate.addEventListener('primary', onPrimary)
    ;(blankSlate.querySelector('button') as HTMLButtonElement).click()
    await nextTick()
    expect(onPrimary).toHaveBeenCalledTimes(1)

    const emptyState = container.querySelector('tx-empty-state')!
    const onSecondary = vi.fn()
    emptyState.addEventListener('secondary', onSecondary)
    ;(emptyState.querySelector('button') as HTMLButtonElement).click()
    await nextTick()
    expect(onSecondary).toHaveBeenCalledTimes(1)

    for (const [tag, expected] of [
      ['tx-error-state', 'Error'],
      ['tx-guide-state', 'Guide'],
      ['tx-loading-state', 'Loading'],
      ['tx-no-data', 'No Data'],
      ['tx-no-selection', 'No Selection'],
      ['tx-offline-state', 'Offline'],
      ['tx-permission-state', 'Permission'],
      ['tx-search-empty', 'Search Empty'],
    ] as const) {
      expect(container.querySelector(tag)?.textContent).toContain(expected)
    }
  })

  it('supports tx-breadcrumb (JSON + slotted tx-breadcrumb-item), nav-bar, sidebar-nav, tab-bar, and interactive pagination', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-breadcrumb class="slot-bc">
        <tx-breadcrumb-item label="Home"></tx-breadcrumb-item>
        <tx-breadcrumb-item label="Docs"></tx-breadcrumb-item>
        <tx-breadcrumb-item label="Button"></tx-breadcrumb-item>
      </tx-breadcrumb>
      <tx-breadcrumb class="json-bc" items='[{"label":"Root","href":"/"},{"label":"Current"}]'></tx-breadcrumb>
      <tx-nav-bar title="Inspector" show-back></tx-nav-bar>
      <tx-sidebar-nav model-value="home" items='[{"value":"home","label":"Home"},{"value":"logs","label":"Logs"}]'></tx-sidebar-nav>
      <tx-tab-bar fixed="false" model-value="one" items='[{"value":"one","label":"One"},{"value":"two","label":"Two"}]'></tx-tab-bar>
      <tx-pagination current-page="1" page-size="10" total="50" show-info></tx-pagination>
    `
    document.body.appendChild(container)
    await nextTick()

    // Breadcrumb (slotted)
    const slotBc = container.querySelector('.slot-bc')!
    const onBcClick = vi.fn()
    slotBc.addEventListener('click', onBcClick)
    const firstCrumbBtn = slotBc.querySelector('button.tx-breadcrumb__link') as HTMLButtonElement
    expect(firstCrumbBtn?.textContent?.trim()).toBe('Home')
    firstCrumbBtn.click()
    await nextTick()
    expect(onBcClick).toHaveBeenCalledTimes(1)
    expect((onBcClick.mock.calls[0]![0] as CustomEvent).detail.item.label).toBe('Home')

    // Breadcrumb (JSON)
    expect(container.querySelector('.json-bc')?.textContent).toContain('Root')
    expect(container.querySelector('.json-bc')?.textContent).toContain('Current')

    // NavBar back event
    const navBar = container.querySelector('tx-nav-bar')!
    const onBack = vi.fn()
    navBar.addEventListener('back', onBack)
    ;(navBar.querySelector('button') as HTMLButtonElement).click()
    await nextTick()
    expect(onBack).toHaveBeenCalledTimes(1)

    // SidebarNav select event
    const sidebar = container.querySelector('tx-sidebar-nav')!
    const onSelect = vi.fn()
    sidebar.addEventListener('select', onSelect)
    const logsBtn = Array.from(sidebar.querySelectorAll('button')).find(b => b.textContent?.includes('Logs'))
    expect(logsBtn).toBeDefined()
    logsBtn!.click()
    await nextTick()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(sidebar.modelValue).toBe('logs')

    // TabBar change event
    const tabBar = container.querySelector('tx-tab-bar')!
    const onTabChange = vi.fn()
    tabBar.addEventListener('change', onTabChange)
    const twoBtn = Array.from(tabBar.querySelectorAll('button')).find(b => b.textContent?.includes('Two'))
    expect(twoBtn).toBeDefined()
    twoBtn!.click()
    await nextTick()
    expect(onTabChange).toHaveBeenCalledTimes(1)
    expect((onTabChange.mock.calls[0]![0] as CustomEvent).detail).toBe('two')

    // Pagination page change
    const pagination = container.querySelector('tx-pagination')!
    const onPageChange = vi.fn()
    pagination.addEventListener('page-change', onPageChange)
    const page2Btn = Array.from(pagination.querySelectorAll('button')).find(b => b.textContent?.trim() === '2')
    expect(page2Btn).toBeDefined()
    page2Btn!.click()
    await nextTick()
    expect(onPageChange).toHaveBeenCalledTimes(1)
    expect((onPageChange.mock.calls[0]![0] as CustomEvent).detail).toBe(2)
    expect(pagination.currentPage).toBe(2)
  })

  it('renders steps (+ step), loading-overlay, modal (teleport open/close), toast, toast-panel, and timeline (+ timeline-item)', async () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <tx-steps active="0">
        <tx-step title="Setup"></tx-step>
        <tx-step title="Verify"></tx-step>
      </tx-steps>
      <tx-loading-overlay loading text="Building..."><div class="inner-target">Content</div></tx-loading-overlay>
      <tx-modal open title="Deploy Confirmation">
        <p class="modal-body-text">Confirm deployment?</p>
      </tx-modal>
      <tx-toast variant="success" title="Published" description="Package live"></tx-toast>
      <tx-toast-panel open stack="1"><div>Anchored toast</div></tx-toast-panel>
      <tx-timeline>
        <tx-timeline-item title="Init" time="09:00" color="primary"></tx-timeline-item>
        <tx-timeline-item title="Done" time="10:00" color="success" active>Shipped</tx-timeline-item>
      </tx-timeline>
    `
    document.body.appendChild(container)
    await nextTick()
    await nextTick()

    // Steps coordination
    const stepHeads = Array.from(container.querySelectorAll('tx-step .tx-step__head')) as HTMLButtonElement[]
    expect(stepHeads).toHaveLength(2)
    stepHeads[1]!.click()
    await nextTick()
    expect(stepHeads[1]?.getAttribute('aria-current')).toBe('step')

    // Loading overlay
    expect(container.querySelector('tx-loading-overlay')?.textContent).toContain('Building...')
    expect(container.querySelector('tx-loading-overlay .inner-target')?.textContent).toBe('Content')

    // Modal teleports to document.body and emits close
    const modalEl = document.body.querySelector('.tx-modal__overlay[role="dialog"]')
    expect(modalEl).not.toBeNull()
    expect(modalEl?.textContent).toContain('Deploy Confirmation')
    expect(modalEl?.textContent).toContain('Confirm deployment?')

    const txModal = container.querySelector('tx-modal')!
    const onModalClose = vi.fn()
    txModal.addEventListener('close', onModalClose)
    ;(modalEl!.querySelector('.tx-modal__close') as HTMLButtonElement).click()
    await nextTick()
    expect(onModalClose).toHaveBeenCalledTimes(1)
    expect(txModal.modelValue).toBe(false)

    // Toast inline + dismiss
    const toast = container.querySelector('tx-toast')!
    expect(toast.textContent).toContain('Published')
    const onToastClose = vi.fn()
    toast.addEventListener('close', onToastClose)
    ;(toast.querySelector('.tx-toast__close') as HTMLButtonElement).click()
    await nextTick()
    expect(onToastClose).toHaveBeenCalledTimes(1)

    // Toast panel & Timeline
    expect(container.querySelector('tx-toast-panel')?.textContent).toContain('Anchored toast')
    expect(container.querySelectorAll('tx-timeline .tx-timeline-item')).toHaveLength(2)
    expect(container.querySelector('tx-timeline')?.textContent).toContain('Shipped')
  })
})
