import { act, createRef, useState } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as BaseA from '../components/base-a'
import {
  BASE_A_REACT_COMPONENT_IDS,
  BASE_A_REACT_MANIFEST,
  clearToasts,
  TxAside,
  TxBlankSlate,
  TxBlockLine,
  TxBlockSlot,
  TxBlockSwitch,
  TxBreadcrumb,
  TxBreadcrumbItem,
  TxCardItem,
  TxCellLink,
  TxCol,
  TxContainer,
  TxEmptyState,
  TxErrorState,
  TxFlex,
  TxFooter,
  TxGrid,
  TxGridItem,
  TxGridLayout,
  TxGroupBlock,
  TxGuideState,
  TxHeader,
  TxIcon,
  TxIconChip,
  TxLayoutSkeleton,
  TxLoadingOverlay,
  TxLoadingState,
  TxMain,
  TxModal,
  TxNavBar,
  TxNoData,
  TxNoSelection,
  TxOfflineState,
  TxPagination,
  TxPermissionState,
  TxRow,
  TxScroll,
  TxSearchEmpty,
  TxSidebarNav,
  TxSplitter,
  TxStack,
  TxStep,
  TxSteps,
  TxTabBar,
  TxText,
  TxTimeline,
  TxTimelineItem,
  TxToast,
  txToast,
  TxToastHost,
  TxToastPanel,
} from '../components/base-a'
import { cleanupAll, mount } from './render-helper'

afterEach(() => {
  cleanupAll()
  clearToasts()
})

const EXPECTED_PACK_A_IDS = [
  'container',
  'flex',
  'grid',
  'grid-layout',
  'stack',
  'splitter',
  'scroll',
  'group-block',
  'card-item',
  'layout-skeleton',
  'text',
  'icon',
  'icon-chip',
  'cell-link',
  'blank-slate',
  'empty-state',
  'error-state',
  'guide-state',
  'loading-state',
  'no-data',
  'no-selection',
  'offline-state',
  'permission-state',
  'search-empty',
  'breadcrumb',
  'nav-bar',
  'sidebar-nav',
  'tab-bar',
  'pagination',
  'steps',
  'loading-overlay',
  'modal',
  'toast',
  'toast-panel',
  'timeline',
] as const

describe('pack A manifest contract (35 modules)', () => {
  it('exports BASE_A_REACT_MANIFEST with all 35 locked IDs and matching runtime symbols', () => {
    expect(BASE_A_REACT_COMPONENT_IDS).toHaveLength(35)
    expect([...BASE_A_REACT_COMPONENT_IDS].sort()).toEqual([...EXPECTED_PACK_A_IDS].sort())

    for (const id of EXPECTED_PACK_A_IDS) {
      const entry = BASE_A_REACT_MANIFEST[id]
      expect(entry, `manifest missing ${id}`).toBeDefined()
      expect(entry?.id).toBe(id)
      expect(entry?.status).toBe('ready')
      expect(['A', 'B']).toContain(entry?.tier)
      expect(entry?.sampleTsx.length).toBeGreaterThan(0)
      for (const symbol of entry!.exports) {
        expect(symbol).toMatch(/^Tx[A-Z]/)
        expect(BaseA[symbol as keyof typeof BaseA], `missing runtime export ${symbol} for ${id}`).toBeDefined()
      }
    }
    expect(typeof BaseA.txToast).toBe('function')
  })
})

describe('pack A layout & structural components (10 modules)', () => {
  it('txContainer composes shell regions (TxHeader, TxAside, TxMain, TxFooter) and supports fluid/row/col', () => {
    const ref = createRef<HTMLDivElement>()
    const { container } = mount(
      <TxContainer ref={ref}>
        <TxHeader height={48}>Top</TxHeader>
        <TxContainer>
          <TxAside width={200}>Nav</TxAside>
          <TxMain>
            <TxRow gutter={16}>
              <TxCol span={12}>Col A</TxCol>
              <TxCol span={12}>Col B</TxCol>
            </TxRow>
          </TxMain>
        </TxContainer>
        <TxFooter height={40}>Bottom</TxFooter>
      </TxContainer>,
    )

    expect(ref.current?.className).toContain('tx-container--shell')
    expect(ref.current?.className).toContain('is-vertical')
    expect(container.querySelector('header.tx-header')?.textContent).toBe('Top')
    expect(container.querySelector('aside.tx-aside')?.textContent).toBe('Nav')
    expect(container.querySelector('main.tx-main')?.textContent).toContain('Col A')
    expect(container.querySelector('footer.tx-footer')?.textContent).toBe('Bottom')
    expect(container.querySelectorAll('.tx-col')).toHaveLength(2)
  })

  it('txFlex, TxGrid/TxGridItem, TxGridLayout, and TxStack apply CSS layout variables & props', () => {
    const { container } = mount(
      <div>
        <TxFlex direction="row" gap={8} justify="space-between" inline>
          <span>A</span>
          <span>B</span>
        </TxFlex>
        <TxGrid cols={3} gap={{ row: 12, col: 20 }}>
          <TxGridItem colSpan={2} rowSpan={1}>Wide</TxGridItem>
          <TxGridItem>Side</TxGridItem>
        </TxGrid>
        <TxGridLayout minItemWidth="220px" maxColumns={3}>
          <div className="tx-grid-layout__item">Tile</div>
        </TxGridLayout>
        <TxStack direction="horizontal" gap={10} wrap>
          <span>S1</span>
          <span>S2</span>
        </TxStack>
      </div>,
    )

    expect(container.querySelector<HTMLDivElement>('.tx-flex')?.style.getPropertyValue('--tx-flex-display')).toBe('inline-flex')
    expect(container.querySelector<HTMLDivElement>('.tx-grid')?.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))')
    expect(container.querySelector<HTMLDivElement>('.tx-grid-item')?.style.gridColumn).toBe('span 2 / span 2')
    expect(container.querySelector<HTMLDivElement>('.tx-grid-layout')?.style.getPropertyValue('--tx-grid-max-columns')).toBe('3')
    expect(container.querySelector<HTMLDivElement>('.tx-stack')?.style.getPropertyValue('--tx-stack-direction')).toBe('row')
  })

  it('txSplitter resizes via keyboard arrows and exposes separator ARIA attributes', () => {
    const onChange = vi.fn()
    const { container } = mount(
      <TxSplitter defaultValue={0.5} min={0.2} max={0.8} onChange={onChange}>
        <div>Pane A</div>
        <div>Pane B</div>
      </TxSplitter>,
    )

    const bar = container.querySelector<HTMLDivElement>('[role="separator"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('50')
    expect(bar.getAttribute('aria-orientation')).toBe('vertical')

    act(() => {
      bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith(0.52)
    expect(bar.getAttribute('aria-valuenow')).toBe('52')
  })

  it('txScroll renders scrollable container and reports scroll position', () => {
    const onScroll = vi.fn()
    const { container } = mount(
      <TxScroll height={160} direction="vertical" onScroll={onScroll}>
        <div style={{ height: 600 }}>Long content</div>
      </TxScroll>,
    )

    const viewport = container.querySelector<HTMLDivElement>('.tx-scroll__native')!
    expect(viewport.style.overflowY).toBe('auto')
    act(() => {
      viewport.scrollTop = 48
      viewport.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    expect(onScroll).toHaveBeenCalledWith({ scrollTop: 48, scrollLeft: 0 })
  })

  it('txGroupBlock + TxBlockLine + TxBlockSlot + TxBlockSwitch support collapse, links, and switch state', () => {
    const onToggle = vi.fn()
    const onLineClick = vi.fn()
    const onSwitchChange = vi.fn()

    const { container } = mount(
      <TxGroupBlock name="Preferences" description="Manage defaults" defaultExpand onToggle={onToggle}>
        <TxBlockLine title="Docs" link onClick={onLineClick}>Open docs</TxBlockLine>
        <TxBlockSlot title="Channel" description="Release track">
          <span>Beta</span>
        </TxBlockSlot>
        <TxBlockSwitch
          title="Telemetry"
          description="Send diagnostics"
          defaultChecked={false}
          onChange={onSwitchChange}
        />
      </TxGroupBlock>,
    )

    const trigger = container.querySelector<HTMLButtonElement>('.tx-group-block__trigger')!
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    act(() => {
      container.querySelector<HTMLButtonElement>('.tx-block-line--link')!.click()
    })
    expect(onLineClick).toHaveBeenCalledTimes(1)

    const sw = container.querySelector<HTMLButtonElement>('[role="switch"]')!
    act(() => {
      sw.click()
    })
    expect(onSwitchChange).toHaveBeenCalledWith(true)
    expect(sw.getAttribute('aria-checked')).toBe('true')

    act(() => {
      trigger.click()
    })
    expect(onToggle).toHaveBeenCalledWith(false)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector<HTMLDivElement>('.tx-group-block__body')?.hidden).toBe(true)
  })

  it('txCardItem handles click/keyboard activation and TxLayoutSkeleton renders placeholder regions', () => {
    const onClick = vi.fn()
    const { container } = mount(
      <div>
        <TxCardItem
          title="Agent Service"
          subtitle="Running"
          description="Healthy across 3 workers"
          avatarText="AS"
          clickable
          active
          onClick={onClick}
        />
        <TxLayoutSkeleton />
      </div>,
    )

    const item = container.querySelector<HTMLDivElement>('.tx-card-item')!
    expect(item.className).toContain('tx-card-item--active')
    expect(item.getAttribute('role')).toBe('button')

    act(() => {
      item.click()
      item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onClick).toHaveBeenCalledTimes(2)

    expect(container.querySelector('.tx-layout-skeleton')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('.tx-layout-skeleton__sidebar-item')).toHaveLength(6)
  })
})

describe('pack A content primitives & state surfaces (14 modules)', () => {
  it('txText, TxIcon, TxIconChip, and TxCellLink render faithfully and emit interactions', () => {
    const onOpen = vi.fn()
    const { container } = mount(
      <div>
        <TxText text="Long workspace label" overflow="middle" scroll="hover" />
        <TxIcon name="check-circle" size={20} alt="Verified" />
        <TxIconChip size={18} tone="green" variant="soft" label="JSON" ariaLabel="JSON file" />
        <TxCellLink href="https://tuff.tagzxia.com" label="Tuff Docs" external onOpen={onOpen} />
      </div>,
    )

    expect(container.querySelector('.tx-text__sr')?.textContent).toBe('Long workspace label')
    const icon = container.querySelector('.tuff-icon')!
    expect(icon.getAttribute('role')).toBe('img')
    expect(icon.querySelector('svg')).toBeTruthy()

    const chip = container.querySelector('.tx-bui-icon-chip')!
    expect(chip.className).toContain('is-green')
    expect(chip.className).toContain('is-soft')
    expect(chip.className).toContain('is-wide')
    expect(chip.getAttribute('role')).toBe('img')

    const link = container.querySelector<HTMLAnchorElement>('.tx-bui-cell-link')!
    expect(link.querySelector('.tx-bui-cell-link__arrow')).toBeTruthy()
    act(() => {
      link.click()
    })
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0]?.[0]?.href).toBe('https://tuff.tagzxia.com')
  })

  it('all 10 state surfaces render illustrations/defaults and trigger primary & secondary actions', () => {
    const onPrimary = vi.fn()
    const onSecondary = vi.fn()

    const { container } = mount(
      <div>
        <TxEmptyState
          variant="empty"
          primaryAction={{ label: 'Create' }}
          secondaryAction={{ label: 'Learn more' }}
          onPrimary={onPrimary}
          onSecondary={onSecondary}
        />
        <TxBlankSlate />
        <TxErrorState />
        <TxGuideState />
        <TxLoadingState />
        <TxNoData />
        <TxNoSelection />
        <TxOfflineState />
        <TxPermissionState />
        <TxSearchEmpty />
      </div>,
    )

    expect(container.querySelectorAll('.tx-empty-state')).toHaveLength(10)
    expect(container.querySelector('.tx-empty-state--variant-blank-slate')).toBeTruthy()
    expect(container.querySelector('.tx-empty-state--variant-error')?.getAttribute('role')).toBe('alert')
    expect(container.querySelector('.tx-empty-state--variant-loading')?.getAttribute('aria-busy')).toBe('true')
    expect(container.querySelector('.tx-empty-state--variant-search-empty')).toBeTruthy()

    const buttons = container.querySelectorAll<HTMLButtonElement>('.tx-empty-state--variant-empty button')
    expect(buttons).toHaveLength(2)
    act(() => {
      buttons[0]!.click()
      buttons[1]!.click()
    })
    expect(onSecondary).toHaveBeenCalledTimes(1)
    expect(onPrimary).toHaveBeenCalledTimes(1)
  })
})

describe('pack A navigation, overlays & timeline (11 modules)', () => {
  it('txBreadcrumb supports items prop and compound TxBreadcrumbItem children', () => {
    const onItemClick = vi.fn()
    const { container } = mount(
      <div>
        <TxBreadcrumb
          items={[
            { label: 'Home' },
            { label: 'Library', href: '/library' },
            { label: 'Button' },
          ]}
          onItemClick={onItemClick}
        />
        <TxBreadcrumb>
          <TxBreadcrumbItem href="/">Root</TxBreadcrumbItem>
          <TxBreadcrumbItem>Current</TxBreadcrumbItem>
        </TxBreadcrumb>
      </div>,
    )

    const navs = container.querySelectorAll('nav.tx-breadcrumb')
    expect(navs).toHaveLength(2)
    expect(navs[0]!.querySelector('[aria-current="page"]')?.textContent).toBe('Button')

    const homeBtn = navs[0]!.querySelector<HTMLButtonElement>('button.tx-breadcrumb__link')!
    act(() => {
      homeBtn.click()
    })
    expect(onItemClick).toHaveBeenCalledWith({ label: 'Home' }, 0)
    expect(navs[1]!.querySelector('[aria-current="page"]')?.textContent).toBe('Current')
  })

  it('txNavBar, TxSidebarNav, and TxTabBar handle navigation clicks and search filtering', () => {
    const onBack = vi.fn()
    const onNavSelect = vi.fn()
    const onTabChange = vi.fn()

    const { container } = mount(
      <div>
        <TxNavBar title="Details" showBack onBack={onBack} />
        <TxSidebarNav
          defaultValue="overview"
          workspace={{ name: 'Tuff Studio', description: 'Pro plan' }}
          searchPlaceholder="Filter..."
          items={[
            { value: 'overview', label: 'Overview', group: 'main' },
            { value: 'plugins', label: 'Plugins', group: 'main', badge: 4 },
          ]}
          groups={[{ key: 'main', label: 'Main' }]}
          onSelect={onNavSelect}
        />
        <TxTabBar
          defaultValue="home"
          items={[
            { value: 'home', label: 'Home' },
            { value: 'inbox', label: 'Inbox', badge: 2 },
          ]}
          onChange={onTabChange}
        />
      </div>,
    )

    act(() => {
      container.querySelector<HTMLButtonElement>('.tx-nav-bar__left')!.click()
    })
    expect(onBack).toHaveBeenCalledTimes(1)

    const sidebarRows = container.querySelectorAll<HTMLButtonElement>('.tx-bui-sidebar-nav__row')
    act(() => {
      sidebarRows[1]!.click()
    })
    expect(onNavSelect).toHaveBeenCalledWith(expect.objectContaining({ value: 'plugins' }))
    expect(sidebarRows[1]!.getAttribute('aria-current')).toBe('page')

    const tabButtons = container.querySelectorAll<HTMLButtonElement>('.tx-tab-bar__item')
    act(() => {
      tabButtons[1]!.click()
    })
    expect(onTabChange).toHaveBeenCalledWith('inbox')
    expect(tabButtons[1]!.getAttribute('aria-current')).toBe('page')
  })

  it('txPagination navigates pages and TxSteps/TxStep activates steps', () => {
    const onPageChange = vi.fn()
    const onStepChange = vi.fn()
    const { container } = mount(
      <div>
        <TxPagination defaultCurrentPage={1} total={100} pageSize={10} showInfo showFirstLast onPageChange={onPageChange} />
        <TxSteps defaultActive={0} onChange={onStepChange}>
          <TxStep title="Install" description="Add package" />
          <TxStep title="Configure" description="Import styles" />
          <TxStep title="Ship" description="Build bundle" />
        </TxSteps>
      </div>,
    )

    const nextBtn = container.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!
    act(() => {
      nextBtn.click()
    })
    expect(onPageChange).toHaveBeenCalledWith(2)
    expect(container.querySelector('.tx-pagination__info')?.textContent).toContain('Page 2 of 10')

    const stepHeads = container.querySelectorAll<HTMLButtonElement>('.tx-step__head')
    expect(stepHeads).toHaveLength(3)
    act(() => {
      stepHeads[2]!.click()
    })
    expect(onStepChange).toHaveBeenCalledWith(2)
    expect(stepHeads[2]!.getAttribute('aria-current')).toBe('step')
    expect(container.querySelectorAll('.tx-step--completed')).toHaveLength(2)
  })

  it('txLoadingOverlay renders inline and fullscreen portal overlays', () => {
    const tree = mount(
      <TxLoadingOverlay loading text="Loading panel...">
        <div>Underlying content</div>
      </TxLoadingOverlay>,
    )
    expect(tree.container.querySelector('.tx-loading-overlay__container')?.getAttribute('aria-busy')).toBe('true')
    expect(tree.container.querySelector('.tx-loading-overlay__text')?.textContent).toBe('Loading panel...')

    tree.rerender(<TxLoadingOverlay loading fullscreen text="Fullscreen load" />)
    expect(document.body.querySelector('.tx-loading-overlay--fullscreen')?.textContent).toContain('Fullscreen load')
  })

  it('txModal portals to body, supports controlled/uncontrolled open, and closes on Escape & backdrop click', () => {
    const onClose = vi.fn()
    mount(
      <TxModal defaultOpen title="Deploy release" onClose={onClose} footer={<button type="button">OK</button>}>
        <p>Ready to deploy?</p>
      </TxModal>,
    )

    const modal = document.body.querySelector<HTMLDivElement>('[role="dialog"]')!
    expect(modal).toBeTruthy()
    expect(modal.getAttribute('aria-modal')).toBe('true')
    expect(modal.textContent).toContain('Deploy release')

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    // Controlled mode + backdrop click
    function ControlledModal() {
      const [open, setOpen] = useState(true)
      return (
        <TxModal open={open} onOpenChange={setOpen} title="Controlled Modal">
          Body
        </TxModal>
      )
    }
    mount(<ControlledModal />)
    const overlay = document.body.querySelector<HTMLDivElement>('.tx-modal__overlay')!
    expect(overlay).toBeTruthy()
    act(() => {
      overlay.click()
    })
    expect(document.body.querySelector('.tx-modal__overlay')).toBeNull()
  })

  it('txToast, TxToastHost + txToast helper, TxToastPanel, and TxTimeline work cleanly', () => {
    const onToastClose = vi.fn()
    const { container } = mount(
      <div>
        <TxToast title="Inline notice" description="Saved locally" variant="success" onClose={onToastClose} />
        <TxToastHost position="top-right" />
        <TxToastPanel open stack={2}>
          <div>Anchored notification</div>
        </TxToastPanel>
        <TxTimeline>
          <TxTimelineItem title="Queued" time="09:00" color="primary" active>
            Waiting for runner
          </TxTimelineItem>
          <TxTimelineItem title="Finished" time="09:05" color="success">
            All checks green
          </TxTimelineItem>
        </TxTimeline>
      </div>,
    )

    // Inline toast dismiss
    act(() => {
      container.querySelector<HTMLButtonElement>('.tx-toast--inline .tx-toast__close')!.click()
    })
    expect(onToastClose).toHaveBeenCalledTimes(1)

    // Imperative txToast helper -> TxToastHost portal
    let id = ''
    act(() => {
      id = txToast.success({ title: 'Synced', description: '3 files updated', duration: 0 })
    })
    const host = document.body.querySelector('.tx-toast-host')!
    expect(host.textContent).toContain('Synced')
    act(() => {
      txToast.dismiss(id)
    })
    expect(host.textContent).not.toContain('Synced')

    // ToastPanel & Timeline
    expect(container.querySelectorAll('.tx-toast-panel__layer')).toHaveLength(2)
    expect(container.querySelector('.tx-timeline')?.getAttribute('role')).toBe('list')
    expect(container.querySelectorAll('.tx-timeline-item')).toHaveLength(2)
  })
})

describe('pack A SSR smoke tests (all 35 modules via renderToString)', () => {
  it('renders every Pack A component safely on the server without throwing', () => {
    const ssrNodes: Array<[string, React.ReactElement]> = [
      [
        'container',
        (
          <TxContainer key="1">
            <TxHeader>H</TxHeader>
            <TxContainer>
              <TxAside>A</TxAside>
              <TxMain>M</TxMain>
            </TxContainer>
            <TxFooter>F</TxFooter>
          </TxContainer>
        ),
      ],
      ['flex', <TxFlex key="2"><span>F</span></TxFlex>],
      ['grid', <TxGrid key="3" cols={2}><TxGridItem>G</TxGridItem></TxGrid>],
      ['grid-layout', <TxGridLayout key="4"><div className="tx-grid-layout__item">GL</div></TxGridLayout>],
      ['stack', <TxStack key="5"><div>S</div></TxStack>],
      ['splitter', <TxSplitter key="6" paneA={<div>A</div>} paneB={<div>B</div>} />],
      ['scroll', <TxScroll key="7"><div>Scroll</div></TxScroll>],
      [
        'group-block',
        (
          <TxGroupBlock key="8" name="Group">
            <TxBlockLine title="Line" />
            <TxBlockSlot title="Slot" />
            <TxBlockSwitch title="Switch" />
          </TxGroupBlock>
        ),
      ],
      ['card-item', <TxCardItem key="9" title="Card" />],
      ['layout-skeleton', <TxLayoutSkeleton key="10" />],
      ['text', <TxText key="11" text="Hello" />],
      ['icon', <TxIcon key="12" name="check" />],
      ['icon-chip', <TxIconChip key="13" label="TS" />],
      ['cell-link', <TxCellLink key="14" href="https://example.com" label="Link" />],
      ['blank-slate', <TxBlankSlate key="15" />],
      ['empty-state', <TxEmptyState key="16" />],
      ['error-state', <TxErrorState key="17" />],
      ['guide-state', <TxGuideState key="18" />],
      ['loading-state', <TxLoadingState key="19" />],
      ['no-data', <TxNoData key="20" />],
      ['no-selection', <TxNoSelection key="21" />],
      ['offline-state', <TxOfflineState key="22" />],
      ['permission-state', <TxPermissionState key="23" />],
      ['search-empty', <TxSearchEmpty key="24" />],
      ['breadcrumb', <TxBreadcrumb key="25" items={[{ label: 'A' }, { label: 'B' }]} />],
      ['nav-bar', <TxNavBar key="26" title="Nav" showBack />],
      ['sidebar-nav', <TxSidebarNav key="27" items={[{ value: 'a', label: 'A' }]} />],
      ['tab-bar', <TxTabBar key="28" items={[{ value: 'a', label: 'A' }]} />],
      ['pagination', <TxPagination key="29" total={30} />],
      [
        'steps',
        (
          <TxSteps key="30" defaultActive={0}>
            <TxStep title="S1" />
            <TxStep title="S2" />
          </TxSteps>
        ),
      ],
      ['loading-overlay', <TxLoadingOverlay key="31" loading text="Wait"><div>C</div></TxLoadingOverlay>],
      ['modal', <TxModal key="32" open title="Modal">Body</TxModal>],
      ['toast', <TxToast key="33" title="Toast" variant="info" />],
      ['toast-panel', <TxToastPanel key="34" open><div>Panel</div></TxToastPanel>],
      ['timeline', <TxTimeline key="35"><TxTimelineItem title="Start" /></TxTimeline>],
    ]

    expect(ssrNodes).toHaveLength(35)
    for (const [id, element] of ssrNodes) {
      const html = renderToString(element)
      if (id === 'modal') {
        // Portal modals defer mounting until client effect so SSR never throws on createPortal
        expect(html).toBe('')
      }
      else {
        expect(html.length, `SSR output empty for ${id}`).toBeGreaterThan(0)
      }
    }

    // Fullscreen portal overlay & global toast host also remain SSR-safe
    expect(renderToString(<TxLoadingOverlay loading fullscreen text="Wait" />)).toBe('')
    expect(renderToString(<TxToastHost />)).toBe('')
  })
})
