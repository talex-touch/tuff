import type { FrameworkShowcaseDefinition, ShowcaseLocale } from './types'
import {
  createBoxEl,
  createStageRow,
  createStatusReadout,
  createWcEl,
  DEMO_BOX_STYLE,
  disposeAll,
  pickReactComponent,
  unpackDetail,
} from './types'

export type BaseAShowcaseId
  = | 'container'
    | 'flex'
    | 'grid'
    | 'grid-layout'
    | 'stack'
    | 'splitter'
    | 'scroll'
    | 'group-block'
    | 'card-item'
    | 'layout-skeleton'
    | 'text'
    | 'icon'
    | 'icon-chip'
    | 'cell-link'
    | 'blank-slate'
    | 'empty-state'
    | 'error-state'
    | 'guide-state'
    | 'loading-state'
    | 'no-data'
    | 'no-selection'
    | 'offline-state'
    | 'permission-state'
    | 'search-empty'
    | 'breadcrumb'
    | 'nav-bar'
    | 'sidebar-nav'
    | 'tab-bar'
    | 'pagination'
    | 'steps'
    | 'loading-overlay'
    | 'modal'
    | 'toast'
    | 'toast-panel'
    | 'timeline'

function makeStateShowcase(config: {
  id: BaseAShowcaseId
  wcTag: string
  reactName: string
  title: (l: ShowcaseLocale) => string
  description: (l: ShowcaseLocale) => string
  actionLabel?: (l: ShowcaseLocale) => string
  extraWcAttrs?: Record<string, string | boolean>
  extraReactProps?: Record<string, unknown>
}): FrameworkShowcaseDefinition {
  return {
    id: config.id,
    wcTag: config.wcTag,
    wcCode: (locale) => {
      const actionAttr = config.actionLabel
        ? `\n  primary-action='${JSON.stringify({ label: config.actionLabel(locale), variant: 'primary' })}'`
        : ''
      return `<${config.wcTag}
  title="${config.title(locale)}"
  description="${config.description(locale)}"${actionAttr}
></${config.wcTag}>`
    },
    reactCode: (locale) => {
      const actionLine = config.actionLabel
        ? `\n      primaryAction={{ label: '${config.actionLabel(locale)}', variant: 'primary' }}`
        : ''
      return `import { ${config.reactName} } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function Demo() {
  return (
    <${config.reactName}
      title="${config.title(locale)}"
      description="${config.description(locale)}"${actionLine}
    />
  )
}`
    },
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const primaryAction = config.actionLabel
        ? { label: config.actionLabel(locale), variant: 'primary' }
        : undefined
      let clicks = 0
      const readout = primaryAction
        ? createStatusReadout(locale === 'zh' ? '操作次数: 0' : 'Actions: 0')
        : null
      const el = createWcEl(config.wcTag, {
        attrs: {
          title: config.title(locale),
          description: config.description(locale),
          ...(primaryAction ? { 'primary-action': JSON.stringify(primaryAction) } : {}),
          ...config.extraWcAttrs,
        },
        props: {
          ...(primaryAction ? { primaryAction } : {}),
          ...config.extraReactProps,
        },
        events: readout
          ? {
              primary: () => {
                clicks += 1
                readout.textContent = locale === 'zh' ? `操作次数: ${clicks}` : `Actions: ${clicks}`
              },
            }
          : undefined,
      }, disposers)
      container.replaceChildren(createStageRow(readout ? [el, readout] : [el], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const Comp = pickReactComponent(TuffexReact, config.reactName)
      const actionLabel = config.actionLabel?.(locale)
      function Demo() {
        const [clicks, setClicks] = React.useState(0)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(Comp, {
            title: config.title(locale),
            description: config.description(locale),
            ...(actionLabel
              ? {
                  primaryAction: { label: actionLabel, variant: 'primary' },
                  onPrimary: () => setClicks(prev => prev + 1),
                }
              : {}),
            ...config.extraReactProps,
          }),
          actionLabel
            ? React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `操作次数: ${clicks}` : `Actions: ${clicks}`)
            : null,
        )
      }
      return React.createElement(Demo)
    },
  }
}

export const BASE_A_FRAMEWORK_SHOWCASES: Readonly<Record<BaseAShowcaseId, FrameworkShowcaseDefinition>> = {
  container: {
    id: 'container',
    wcTag: 'tx-container',
    wcCode: locale => `<tx-container max-width="640px" padding="medium">
  <tx-header>${locale === 'zh' ? '顶部栏' : 'Header'}</tx-header>
  <tx-main>${locale === 'zh' ? '主内容区' : 'Main content'}</tx-main>
  <tx-footer>${locale === 'zh' ? '底部栏' : 'Footer'}</tx-footer>
</tx-container>`,
    reactCode: locale => `import { TxAside, TxContainer, TxFooter, TxHeader, TxMain } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ContainerDemo() {
  return (
    <TxContainer maxWidth="640px" padding="medium">
      <TxHeader>${locale === 'zh' ? '顶部栏' : 'Header'}</TxHeader>
      <TxContainer>
        <TxAside width="120px">${locale === 'zh' ? '侧栏' : 'Aside'}</TxAside>
        <TxMain>${locale === 'zh' ? '主内容区' : 'Main content'}</TxMain>
      </TxContainer>
      <TxFooter>${locale === 'zh' ? '底部栏' : 'Footer'}</TxFooter>
    </TxContainer>
  )
}`,
    mountWc: (container, locale) => {
      const shell = createWcEl('tx-container', {
        attrs: { 'max-width': '520px', padding: 'small' },
        style: { width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' },
        children: [
          createWcEl('tx-header', { text: locale === 'zh' ? '顶部栏 Header' : 'Header', style: DEMO_BOX_STYLE }),
          createWcEl('tx-main', { text: locale === 'zh' ? '主内容区 Main' : 'Main content', style: { ...DEMO_BOX_STYLE, minHeight: '48px' } }),
          createWcEl('tx-footer', { text: locale === 'zh' ? '底部栏 Footer' : 'Footer', style: DEMO_BOX_STYLE }),
        ],
      })
      container.replaceChildren(createStageRow([shell], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxContainer = pickReactComponent(TuffexReact, 'TxContainer')
      const TxHeader = pickReactComponent(TuffexReact, 'TxHeader')
      const TxAside = pickReactComponent(TuffexReact, 'TxAside')
      const TxMain = pickReactComponent(TuffexReact, 'TxMain')
      const TxFooter = pickReactComponent(TuffexReact, 'TxFooter')
      return React.createElement(
        TxContainer,
        { maxWidth: '520px', padding: 'small', style: { width: '100%', display: 'flex', flexDirection: 'column', gap: 6 } },
        React.createElement(TxHeader, { style: DEMO_BOX_STYLE }, locale === 'zh' ? '顶部栏 Header' : 'Header'),
        React.createElement(
          'div',
          { style: { display: 'flex', gap: 6 } },
          React.createElement(TxAside, { width: '110px', style: DEMO_BOX_STYLE }, locale === 'zh' ? '侧栏 Aside' : 'Aside'),
          React.createElement(TxMain, { style: { ...DEMO_BOX_STYLE, flex: 1 } }, locale === 'zh' ? '主内容区 Main' : 'Main content'),
        ),
        React.createElement(TxFooter, { style: DEMO_BOX_STYLE }, locale === 'zh' ? '底部栏 Footer' : 'Footer'),
      )
    },
  },

  flex: {
    id: 'flex',
    wcTag: 'tx-flex',
    wcCode: locale => `<tx-flex gap="12" align="center" wrap="wrap">
  <div>${locale === 'zh' ? '令牌' : 'Tokens'}</div>
  <div>${locale === 'zh' ? '布局' : 'Layout'}</div>
  <div>${locale === 'zh' ? '动效' : 'Motion'}</div>
</tx-flex>`,
    reactCode: locale => `import { TxFlex } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function FlexDemo() {
  return (
    <TxFlex gap={12} align="center" wrap="wrap">
      <span>${locale === 'zh' ? '令牌' : 'Tokens'}</span>
      <span>${locale === 'zh' ? '布局' : 'Layout'}</span>
      <span>${locale === 'zh' ? '动效' : 'Motion'}</span>
    </TxFlex>
  )
}`,
    mountWc: (container, locale) => {
      const items = locale === 'zh' ? ['令牌', '布局', '动效'] : ['Tokens', 'Layout', 'Motion']
      const el = createWcEl('tx-flex', {
        attrs: { gap: 12, align: 'center', wrap: 'wrap' },
        props: { gap: 12, align: 'center', wrap: 'wrap' },
        children: items.map(label => createBoxEl(label)),
      })
      container.replaceChildren(createStageRow([el], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxFlex = pickReactComponent(TuffexReact, 'TxFlex')
      const items = locale === 'zh' ? ['令牌', '布局', '动效'] : ['Tokens', 'Layout', 'Motion']
      return React.createElement(
        TxFlex,
        { gap: 12, align: 'center', wrap: 'wrap' },
        ...items.map(label => React.createElement('div', { key: label, style: DEMO_BOX_STYLE }, label)),
      )
    },
  },

  grid: {
    id: 'grid',
    wcTag: 'tx-grid',
    wcCode: locale => `<tx-grid cols="3" gap="10">
  <tx-grid-item col-span="2">${locale === 'zh' ? '主面板 (2 列)' : 'Primary (2 cols)'}</tx-grid-item>
  <tx-grid-item>${locale === 'zh' ? '侧面板' : 'Side'}</tx-grid-item>
</tx-grid>`,
    reactCode: locale => `import { TxGrid, TxGridItem } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function GridDemo() {
  return (
    <TxGrid cols={3} gap={10}>
      <TxGridItem colSpan={2}>${locale === 'zh' ? '主面板 (2 列)' : 'Primary (2 cols)'}</TxGridItem>
      <TxGridItem>${locale === 'zh' ? '侧面板' : 'Side'}</TxGridItem>
    </TxGrid>
  )
}`,
    mountWc: (container, locale) => {
      const grid = createWcEl('tx-grid', {
        attrs: { cols: 3, gap: 10 },
        props: { cols: 3, gap: 10 },
        children: [
          createWcEl('tx-grid-item', { attrs: { 'col-span': 2 }, props: { colSpan: 2 }, children: [createBoxEl(locale === 'zh' ? '主面板 (2 列)' : 'Primary (2 cols)')] }),
          createWcEl('tx-grid-item', { children: [createBoxEl(locale === 'zh' ? '侧面板' : 'Side')] }),
        ],
      })
      container.replaceChildren(createStageRow([grid], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxGrid = pickReactComponent(TuffexReact, 'TxGrid')
      const TxGridItem = pickReactComponent(TuffexReact, 'TxGridItem')
      return React.createElement(
        TxGrid,
        { cols: 3, gap: 10 },
        React.createElement(TxGridItem, { colSpan: 2, style: DEMO_BOX_STYLE }, locale === 'zh' ? '主面板 (2 列)' : 'Primary (2 cols)'),
        React.createElement(TxGridItem, { style: DEMO_BOX_STYLE }, locale === 'zh' ? '侧面板' : 'Side'),
      )
    },
  },

  'grid-layout': {
    id: 'grid-layout',
    wcTag: 'tx-grid-layout',
    wcCode: locale => `<tx-grid-layout min-item-width="140px" gap="12px" max-columns="3" interactive>
  <div class="tx-grid-layout__item">${locale === 'zh' ? '核心插件' : 'Core'}</div>
  <div class="tx-grid-layout__item">${locale === 'zh' ? '主题包' : 'Themes'}</div>
  <div class="tx-grid-layout__item">${locale === 'zh' ? '同步服务' : 'Sync'}</div>
</tx-grid-layout>`,
    reactCode: locale => `import { TxGridLayout } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function GridLayoutDemo() {
  return (
    <TxGridLayout minItemWidth="140px" gap="12px" maxColumns={3} interactive>
      <div className="tx-grid-layout__item">${locale === 'zh' ? '核心插件' : 'Core'}</div>
      <div className="tx-grid-layout__item">${locale === 'zh' ? '主题包' : 'Themes'}</div>
      <div className="tx-grid-layout__item">${locale === 'zh' ? '同步服务' : 'Sync'}</div>
    </TxGridLayout>
  )
}`,
    mountWc: (container, locale) => {
      const labels = locale === 'zh' ? ['核心插件', '主题包', '同步服务'] : ['Core', 'Themes', 'Sync']
      const layout = createWcEl('tx-grid-layout', {
        attrs: { 'min-item-width': '120px', gap: '10px', 'max-columns': 3, interactive: true },
        props: { minItemWidth: '120px', gap: '10px', maxColumns: 3, interactive: true },
        children: labels.map(label => createWcEl('div', { className: 'tx-grid-layout__item', text: label, style: DEMO_BOX_STYLE })),
      })
      container.replaceChildren(createStageRow([layout], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxGridLayout = pickReactComponent(TuffexReact, 'TxGridLayout')
      const labels = locale === 'zh' ? ['核心插件', '主题包', '同步服务'] : ['Core', 'Themes', 'Sync']
      return React.createElement(
        TxGridLayout,
        { minItemWidth: '120px', gap: '10px', maxColumns: 3, interactive: true },
        ...labels.map(label => React.createElement('div', { key: label, className: 'tx-grid-layout__item', style: DEMO_BOX_STYLE }, label)),
      )
    },
  },

  stack: {
    id: 'stack',
    wcTag: 'tx-stack',
    wcCode: locale => `<tx-stack direction="horizontal" gap="10" align="center">
  <tx-tag label="${locale === 'zh' ? '设计令牌' : 'Tokens'}"></tx-tag>
  <tx-tag label="${locale === 'zh' ? '无障碍' : 'A11y'}"></tx-tag>
  <tx-tag label="${locale === 'zh' ? '多框架' : 'Multi-FW'}"></tx-tag>
</tx-stack>`,
    reactCode: locale => `import { useState } from 'react'
import { TxButton, TxStack, TxTag } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function StackDemo() {
  const [direction, setDirection] = useState<'horizontal' | 'vertical'>('horizontal')
  return (
    <TxStack direction="vertical" gap={10}>
      <TxButton size="sm" onClick={() => setDirection(d => (d === 'horizontal' ? 'vertical' : 'horizontal'))}>
        ${locale === 'zh' ? '切换方向' : 'Toggle direction'}
      </TxButton>
      <TxStack direction={direction} gap={8}>
        <TxTag label="${locale === 'zh' ? '设计令牌' : 'Tokens'}" />
        <TxTag label="${locale === 'zh' ? '无障碍' : 'A11y'}" />
      </TxStack>
    </TxStack>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      let dir: 'horizontal' | 'vertical' = 'horizontal'
      const stack = createWcEl('tx-stack', {
        attrs: { direction: dir, gap: 10, align: 'center' },
        props: { direction: dir, gap: 10 },
        children: [
          createBoxEl(locale === 'zh' ? '设计令牌' : 'Tokens'),
          createBoxEl(locale === 'zh' ? '无障碍' : 'A11y'),
          createBoxEl(locale === 'zh' ? '多框架' : 'Multi-FW'),
        ],
      })
      const toggle = createWcEl('tx-button', {
        attrs: { size: 'sm', variant: 'secondary' },
        text: locale === 'zh' ? '切换方向: horizontal' : 'Direction: horizontal',
        events: {
          click: () => {
            dir = dir === 'horizontal' ? 'vertical' : 'horizontal'
            stack.setAttribute('direction', dir)
            ;(stack as unknown as Record<string, unknown>).direction = dir
            toggle.textContent = locale === 'zh' ? `切换方向: ${dir}` : `Direction: ${dir}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([toggle, stack], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxStack = pickReactComponent(TuffexReact, 'TxStack')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      function Demo() {
        const [dir, setDir] = React.useState<'horizontal' | 'vertical'>('horizontal')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(
            TxButton,
            { size: 'sm', variant: 'secondary', onClick: () => setDir(prev => (prev === 'horizontal' ? 'vertical' : 'horizontal')) },
            locale === 'zh' ? `切换方向: ${dir}` : `Direction: ${dir}`,
          ),
          React.createElement(
            TxStack,
            { direction: dir, gap: 8 },
            React.createElement('div', { style: DEMO_BOX_STYLE }, locale === 'zh' ? '设计令牌' : 'Tokens'),
            React.createElement('div', { style: DEMO_BOX_STYLE }, locale === 'zh' ? '无障碍' : 'A11y'),
            React.createElement('div', { style: DEMO_BOX_STYLE }, locale === 'zh' ? '多框架' : 'Multi-FW'),
          ),
        )
      }
      return React.createElement(Demo)
    },
  },

  splitter: {
    id: 'splitter',
    wcTag: 'tx-splitter',
    wcCode: locale => `<tx-splitter model-value="45" min="20" max="80" style="height: 120px">
  <div slot="a">${locale === 'zh' ? '导航面板' : 'Sidebar pane'}</div>
  <div slot="b">${locale === 'zh' ? '内容面板' : 'Editor pane'}</div>
</tx-splitter>`,
    reactCode: locale => `import { useState } from 'react'
import { TxSplitter } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function SplitterDemo() {
  const [ratio, setRatio] = useState(45)
  return (
    <TxSplitter
      value={ratio}
      min={20}
      max={80}
      onChange={setRatio}
      style={{ height: 120 }}
      first={<div>${locale === 'zh' ? '导航面板' : 'Sidebar pane'}</div>}
      second={<div>${locale === 'zh' ? '内容面板' : 'Editor pane'}</div>}
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '分割比例: 45%' : 'Split: 45%')
      const paneA = createBoxEl(locale === 'zh' ? '导航面板' : 'Sidebar pane')
      paneA.setAttribute('slot', 'a')
      const paneB = createBoxEl(locale === 'zh' ? '内容面板' : 'Editor pane')
      paneB.setAttribute('slot', 'b')
      const el = createWcEl('tx-splitter', {
        attrs: { 'model-value': 45, min: 20, max: 80 },
        props: { modelValue: 45, min: 20, max: 80 },
        style: { height: '110px', width: '100%' },
        children: [paneA, paneB],
        events: {
          'update:model-value': (event: Event) => {
            const val = Math.round(Number(unpackDetail(event) ?? 45))
            readout.textContent = locale === 'zh' ? `分割比例: ${val}%` : `Split: ${val}%`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxSplitter = pickReactComponent(TuffexReact, 'TxSplitter')
      function Demo() {
        const [ratio, setRatio] = React.useState(45)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxSplitter, {
            value: ratio,
            min: 20,
            max: 80,
            onChange: (val: number) => setRatio(Math.round(Number(val))),
            style: { height: 110, width: '100%' },
            first: React.createElement('div', { style: DEMO_BOX_STYLE }, locale === 'zh' ? '导航面板' : 'Sidebar pane'),
            second: React.createElement('div', { style: DEMO_BOX_STYLE }, locale === 'zh' ? '内容面板' : 'Editor pane'),
          }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `分割比例: ${ratio}%` : `Split: ${ratio}%`),
        )
      }
      return React.createElement(Demo)
    },
  },

  scroll: {
    id: 'scroll',
    wcTag: 'tx-scroll',
    wcCode: locale => `<tx-scroll native style="height: 120px">
  <div>${locale === 'zh' ? '条目 1 · 核心引擎' : 'Item 1 · Core engine'}</div>
  <div>${locale === 'zh' ? '条目 2 · 响应式令牌' : 'Item 2 · Reactive tokens'}</div>
  <div>${locale === 'zh' ? '条目 3 · 跨框架适配' : 'Item 3 · Cross-framework adapters'}</div>
</tx-scroll>`,
    reactCode: locale => `import { TxScroll } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ScrollDemo() {
  return (
    <TxScroll native style={{ height: 120 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i}>${locale === 'zh' ? '滚动条目' : 'Scroll item'} #{i}</div>
      ))}
    </TxScroll>
  )
}`,
    mountWc: (container, locale) => {
      const scroll = createWcEl('tx-scroll', {
        attrs: { native: true },
        props: { native: true },
        style: { height: '120px', width: '100%', border: '1px solid var(--tx-border-color-lighter, #ebeef5)', borderRadius: '10px', padding: '8px' },
        children: [1, 2, 3, 4, 5, 6].map(i => createBoxEl(locale === 'zh' ? `滚动条目 #${i}` : `Scroll item #${i}`, { marginBottom: '6px' })),
      })
      container.replaceChildren(createStageRow([scroll], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxScroll = pickReactComponent(TuffexReact, 'TxScroll')
      return React.createElement(
        TxScroll,
        { native: true, style: { height: 120, width: '100%', border: '1px solid var(--tx-border-color-lighter, #ebeef5)', borderRadius: 10, padding: 8 } },
        ...[1, 2, 3, 4, 5, 6].map(i =>
          React.createElement('div', { key: i, style: { ...DEMO_BOX_STYLE, marginBottom: 6 } }, locale === 'zh' ? `滚动条目 #${i}` : `Scroll item #${i}`),
        ),
      )
    },
  },

  'group-block': {
    id: 'group-block',
    wcTag: 'tx-group-block',
    wcCode: locale => `<tx-group-block name="${locale === 'zh' ? '工作区偏好' : 'Workspace preferences'}" description="${locale === 'zh' ? '管理桌面与文档同步选项' : 'Manage desktop and docs sync options'}" default-expand>
  <tx-block-line title="${locale === 'zh' ? '配置版本' : 'Config version'}" description="v2.4.0"></tx-block-line>
  <tx-block-switch title="${locale === 'zh' ? '自动同步' : 'Auto sync'}" model-value="true"></tx-block-switch>
</tx-group-block>`,
    reactCode: locale => `import { useState } from 'react'
import { TxBlockLine, TxBlockSwitch, TxGroupBlock } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function GroupBlockDemo() {
  const [sync, setSync] = useState(true)
  return (
    <TxGroupBlock name="${locale === 'zh' ? '工作区偏好' : 'Workspace preferences'}" description="${locale === 'zh' ? '管理桌面与文档同步选项' : 'Manage desktop and docs sync options'}" defaultExpand>
      <TxBlockLine title="${locale === 'zh' ? '配置版本' : 'Config version'}" description="v2.4.0" />
      <TxBlockSwitch title="${locale === 'zh' ? '自动同步' : 'Auto sync'}" checked={sync} onChange={setSync} />
    </TxGroupBlock>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '自动同步: 开启' : 'Auto sync: on')
      const sw = createWcEl('tx-block-switch', {
        attrs: { title: locale === 'zh' ? '自动同步' : 'Auto sync', 'model-value': 'true' },
        props: { modelValue: true },
        events: {
          'update:model-value': (event: Event) => {
            const on = Boolean(unpackDetail(event))
            readout.textContent = locale === 'zh' ? `自动同步: ${on ? '开启' : '关闭'}` : `Auto sync: ${on ? 'on' : 'off'}`
          },
        },
      }, disposers)
      const block = createWcEl('tx-group-block', {
        attrs: {
          name: locale === 'zh' ? '工作区偏好' : 'Workspace preferences',
          description: locale === 'zh' ? '管理桌面与文档同步选项' : 'Manage desktop and docs sync options',
          'default-expand': true,
        },
        props: { defaultExpand: true },
        children: [
          createWcEl('tx-block-line', { attrs: { title: locale === 'zh' ? '配置版本' : 'Config version', description: 'v2.4.0' } }),
          sw,
        ],
      })
      container.replaceChildren(createStageRow([block, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxGroupBlock = pickReactComponent(TuffexReact, 'TxGroupBlock')
      const TxBlockLine = pickReactComponent(TuffexReact, 'TxBlockLine')
      const TxBlockSwitch = pickReactComponent(TuffexReact, 'TxBlockSwitch')
      function Demo() {
        const [sync, setSync] = React.useState(true)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(
            TxGroupBlock,
            {
              name: locale === 'zh' ? '工作区偏好' : 'Workspace preferences',
              description: locale === 'zh' ? '管理桌面与文档同步选项' : 'Manage desktop and docs sync options',
              defaultExpand: true,
            },
            React.createElement(TxBlockLine, { title: locale === 'zh' ? '配置版本' : 'Config version', description: 'v2.4.0' }),
            React.createElement(TxBlockSwitch, { title: locale === 'zh' ? '自动同步' : 'Auto sync', checked: sync, onChange: (v: boolean) => setSync(Boolean(v)) }),
          ),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `自动同步: ${sync ? '开启' : '关闭'}` : `Auto sync: ${sync ? 'on' : 'off'}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'card-item': {
    id: 'card-item',
    wcTag: 'tx-card-item',
    wcCode: locale => `<tx-card-item
  title="TuffEx React"
  subtitle="${locale === 'zh' ? '原生 React 18/19 适配包' : 'Native React 18/19 adapter'}"
  avatar-text="TR"
  clickable
  active
></tx-card-item>`,
    reactCode: locale => `import { useState } from 'react'
import { TxCardItem } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function CardItemDemo() {
  const [active, setActive] = useState('react')
  return (
    <div className="tuff-fw-stage__stack">
      <TxCardItem title="TuffEx React" subtitle="${locale === 'zh' ? '原生 React 18/19 适配包' : 'Native React 18/19 adapter'}" avatarText="TR" clickable active={active === 'react'} onClick={() => setActive('react')} />
      <TxCardItem title="TuffEx WC" subtitle="${locale === 'zh' ? '跨框架 Web Components' : 'Framework-agnostic Web Components'}" avatarText="WC" clickable active={active === 'wc'} onClick={() => setActive('wc')} />
    </div>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '已选: react' : 'Active: react')
      const cardA = createWcEl('tx-card-item', {
        attrs: { title: 'TuffEx React', subtitle: locale === 'zh' ? '原生 React 18/19 适配包' : 'Native React 18/19 adapter', 'avatar-text': 'TR', clickable: true, active: true },
        events: {
          click: () => {
            cardA.setAttribute('active', '')
            cardB.removeAttribute('active')
            readout.textContent = locale === 'zh' ? '已选: react' : 'Active: react'
          },
        },
      }, disposers)
      const cardB = createWcEl('tx-card-item', {
        attrs: { title: 'TuffEx WC', subtitle: locale === 'zh' ? '跨框架 Web Components' : 'Framework-agnostic Web Components', 'avatar-text': 'WC', clickable: true },
        events: {
          click: () => {
            cardB.setAttribute('active', '')
            cardA.removeAttribute('active')
            readout.textContent = locale === 'zh' ? '已选: wc' : 'Active: wc'
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([cardA, cardB, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxCardItem = pickReactComponent(TuffexReact, 'TxCardItem')
      function Demo() {
        const [active, setActive] = React.useState('react')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxCardItem, { title: 'TuffEx React', subtitle: locale === 'zh' ? '原生 React 18/19 适配包' : 'Native React 18/19 adapter', avatarText: 'TR', clickable: true, active: active === 'react', onClick: () => setActive('react') }),
          React.createElement(TxCardItem, { title: 'TuffEx WC', subtitle: locale === 'zh' ? '跨框架 Web Components' : 'Framework-agnostic Web Components', avatarText: 'WC', clickable: true, active: active === 'wc', onClick: () => setActive('wc') }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `已选: ${active}` : `Active: ${active}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'layout-skeleton': {
    id: 'layout-skeleton',
    wcTag: 'tx-layout-skeleton',
    wcCode: () => `<tx-layout-skeleton style="height: 180px"></tx-layout-skeleton>`,
    reactCode: () => `import { TxLayoutSkeleton } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function LayoutSkeletonDemo() {
  return <TxLayoutSkeleton style={{ height: 180 }} />
}`,
    mountWc: (container) => {
      const el = createWcEl('tx-layout-skeleton', { style: { display: 'block', width: '100%', height: '160px', overflow: 'hidden' } })
      container.replaceChildren(createStageRow([el], true))
      return () => {}
    },
    renderReact: (React, TuffexReact) => {
      const TxLayoutSkeleton = pickReactComponent(TuffexReact, 'TxLayoutSkeleton')
      return React.createElement(TxLayoutSkeleton, { style: { width: '100%', height: 160, overflow: 'hidden' } })
    },
  },

  text: {
    id: 'text',
    wcTag: 'tx-text',
    wcCode: locale => `<div style="max-width: 240px">
  <tx-text text="${locale === 'zh' ? '超长路径 /workspace/packages/tuffex-react/components/index.ts' : 'Long path /workspace/packages/tuffex-react/components/index.ts'}" overflow="middle" scroll="hover"></tx-text>
</div>`,
    reactCode: locale => `import { TxText } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function TextDemo() {
  return (
    <div style={{ maxWidth: 240 }}>
      <TxText text="${locale === 'zh' ? '超长路径 /workspace/packages/tuffex-react/components/index.ts' : 'Long path /workspace/packages/tuffex-react/components/index.ts'}" overflow="middle" scroll="hover" />
    </div>
  )
}`,
    mountWc: (container, locale) => {
      const text = locale === 'zh'
        ? '超长路径 /workspace/packages/tuffex-react/components/index.ts'
        : 'Long path /workspace/packages/tuffex-react/components/index.ts'
      const box = createWcEl('div', {
        style: { maxWidth: '240px' },
        children: [createWcEl('tx-text', { attrs: { text, overflow: 'middle', scroll: 'hover' }, props: { text, overflow: 'middle', scroll: 'hover' } })],
      })
      container.replaceChildren(createStageRow([box], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxText = pickReactComponent(TuffexReact, 'TxText')
      const text = locale === 'zh'
        ? '超长路径 /workspace/packages/tuffex-react/components/index.ts'
        : 'Long path /workspace/packages/tuffex-react/components/index.ts'
      return React.createElement('div', { style: { maxWidth: 240 } }, React.createElement(TxText, { text, overflow: 'middle', scroll: 'hover' }))
    },
  },

  icon: {
    id: 'icon',
    wcTag: 'tx-icon',
    wcCode: () => `<div class="tuff-demo-row">
  <tx-icon name="i-carbon-rocket" size="22"></tx-icon>
  <tx-icon icon='{"type":"emoji","value":"✨"}' size="22"></tx-icon>
  <tx-icon icon='{"type":"emoji","value":"⚡"}' size="22"></tx-icon>
</div>`,
    reactCode: () => `import { TxIcon } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function IconDemo() {
  return (
    <div className="tuff-demo-row">
      <TxIcon name="i-carbon-rocket" size={22} />
      <TxIcon icon={{ type: 'emoji', value: '✨' }} size={22} />
      <TxIcon icon={{ type: 'emoji', value: '⚡' }} size={22} />
    </div>
  )
}`,
    mountWc: (container) => {
      const spark = { type: 'emoji', value: '✨' }
      const bolt = { type: 'emoji', value: '⚡' }
      container.replaceChildren(createStageRow([
        createWcEl('tx-icon', { attrs: { name: 'i-carbon-rocket', size: 22 }, props: { size: 22 } }),
        createWcEl('tx-icon', { attrs: { icon: JSON.stringify(spark), size: 22 }, props: { icon: spark, size: 22 } }),
        createWcEl('tx-icon', { attrs: { icon: JSON.stringify(bolt), size: 22 }, props: { icon: bolt, size: 22 } }),
      ]))
      return () => {}
    },
    renderReact: (React, TuffexReact) => {
      const TxIcon = pickReactComponent(TuffexReact, 'TxIcon')
      return React.createElement(
        'div',
        { className: 'tuff-fw-stage__row' },
        React.createElement(TxIcon, { name: 'i-carbon-rocket', size: 22 }),
        React.createElement(TxIcon, { icon: { type: 'emoji', value: '✨' }, size: 22 }),
        React.createElement(TxIcon, { icon: { type: 'emoji', value: '⚡' }, size: 22 }),
      )
    },
  },

  'icon-chip': {
    id: 'icon-chip',
    wcTag: 'tx-icon-chip',
    wcCode: () => `<div class="tuff-demo-row">
  <tx-icon-chip label="PDF" tone="red" size="22"></tx-icon-chip>
  <tx-icon-chip label="TS" tone="accent" variant="soft" size="22"></tx-icon-chip>
  <tx-icon-chip label="AI" tone="green" shape="circle" size="22"></tx-icon-chip>
</div>`,
    reactCode: () => `import { TxIconChip } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function IconChipDemo() {
  return (
    <div className="tuff-demo-row">
      <TxIconChip label="PDF" tone="red" size={22} />
      <TxIconChip label="TS" tone="accent" variant="soft" size={22} />
      <TxIconChip label="AI" tone="green" shape="circle" size={22} />
    </div>
  )
}`,
    mountWc: (container) => {
      container.replaceChildren(createStageRow([
        createWcEl('tx-icon-chip', { attrs: { label: 'PDF', tone: 'red', size: 22 }, props: { size: 22 } }),
        createWcEl('tx-icon-chip', { attrs: { label: 'TS', tone: 'accent', variant: 'soft', size: 22 }, props: { size: 22 } }),
        createWcEl('tx-icon-chip', { attrs: { label: 'AI', tone: 'green', shape: 'circle', size: 22 }, props: { size: 22 } }),
      ]))
      return () => {}
    },
    renderReact: (React, TuffexReact) => {
      const TxIconChip = pickReactComponent(TuffexReact, 'TxIconChip')
      return React.createElement(
        'div',
        { className: 'tuff-fw-stage__row' },
        React.createElement(TxIconChip, { label: 'PDF', tone: 'red', size: 22 }),
        React.createElement(TxIconChip, { label: 'TS', tone: 'accent', variant: 'soft', size: 22 }),
        React.createElement(TxIconChip, { label: 'AI', tone: 'green', shape: 'circle', size: 22 }),
      )
    },
  },

  'cell-link': {
    id: 'cell-link',
    wcTag: 'tx-cell-link',
    wcCode: locale => `<div class="tuff-demo-row">
  <tx-cell-link href="#release" label="${locale === 'zh' ? '查看发布日志' : 'View release notes'}" underline="always"></tx-cell-link>
  <tx-cell-link href="#docs" label="${locale === 'zh' ? '打开文档' : 'Open docs'}" external></tx-cell-link>
</div>`,
    reactCode: locale => `import { TxCellLink } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function CellLinkDemo() {
  return (
    <div className="tuff-demo-row">
      <TxCellLink href="#release" label="${locale === 'zh' ? '查看发布日志' : 'View release notes'}" underline="always" />
      <TxCellLink href="#docs" label="${locale === 'zh' ? '打开文档' : 'Open docs'}" external />
    </div>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      let clicks = 0
      const readout = createStatusReadout(locale === 'zh' ? '触发次数: 0' : 'Clicks: 0')
      const onOpen = (e: Event) => {
        e.preventDefault()
        clicks += 1
        readout.textContent = locale === 'zh' ? `触发次数: ${clicks}` : `Clicks: ${clicks}`
      }
      container.replaceChildren(createStageRow([
        createWcEl('tx-cell-link', { attrs: { href: '#release', label: locale === 'zh' ? '查看发布日志' : 'View release notes', underline: 'always' }, events: { open: onOpen, click: onOpen } }, disposers),
        createWcEl('tx-cell-link', { attrs: { href: '#docs', label: locale === 'zh' ? '打开文档' : 'Open docs', external: true }, events: { open: onOpen, click: onOpen } }, disposers),
        readout,
      ]))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxCellLink = pickReactComponent(TuffexReact, 'TxCellLink')
      function Demo() {
        const [clicks, setClicks] = React.useState(0)
        const bump = (e?: Event) => {
          e?.preventDefault?.()
          setClicks(prev => prev + 1)
        }
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__row' },
          React.createElement(TxCellLink, { href: '#release', label: locale === 'zh' ? '查看发布日志' : 'View release notes', underline: 'always', onOpen: bump, onClick: bump }),
          React.createElement(TxCellLink, { href: '#docs', label: locale === 'zh' ? '打开文档' : 'Open docs', external: true, onOpen: bump, onClick: bump }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `触发次数: ${clicks}` : `Clicks: ${clicks}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'blank-slate': makeStateShowcase({
    id: 'blank-slate',
    wcTag: 'tx-blank-slate',
    reactName: 'TxBlankSlate',
    title: l => (l === 'zh' ? '从空白画布开始' : 'Start with a blank slate'),
    description: l => (l === 'zh' ? '创建第一个工作区模板以启用跨框架同步。' : 'Create your first workspace template to enable sync.'),
    actionLabel: l => (l === 'zh' ? '新建模板' : 'Create template'),
  }),

  'empty-state': makeStateShowcase({
    id: 'empty-state',
    wcTag: 'tx-empty-state',
    reactName: 'TxEmptyState',
    title: l => (l === 'zh' ? '暂无可用项目' : 'Nothing here yet'),
    description: l => (l === 'zh' ? '添加插件或导入配置即可开始使用。' : 'Add a plugin or import a configuration to begin.'),
    actionLabel: l => (l === 'zh' ? '添加项目' : 'Add item'),
    extraWcAttrs: { surface: 'card' },
    extraReactProps: { surface: 'card' },
  }),

  'error-state': makeStateShowcase({
    id: 'error-state',
    wcTag: 'tx-error-state',
    reactName: 'TxErrorState',
    title: l => (l === 'zh' ? '加载失败' : 'Failed to load'),
    description: l => (l === 'zh' ? '无法连接至远程配置源，请稍后重试。' : 'Unable to reach the remote registry. Please retry.'),
    actionLabel: l => (l === 'zh' ? '重试' : 'Retry'),
  }),

  'guide-state': makeStateShowcase({
    id: 'guide-state',
    wcTag: 'tx-guide-state',
    reactName: 'TxGuideState',
    title: l => (l === 'zh' ? '配置你的首个快捷指令' : 'Configure your first shortcut'),
    description: l => (l === 'zh' ? '只需两步即可将组件库接入项目。' : 'Connect the component kit in two quick steps.'),
    actionLabel: l => (l === 'zh' ? '开始引导' : 'Start guide'),
  }),

  'loading-state': makeStateShowcase({
    id: 'loading-state',
    wcTag: 'tx-loading-state',
    reactName: 'TxLoadingState',
    title: l => (l === 'zh' ? '正在同步组件索引…' : 'Syncing component index...'),
    description: l => (l === 'zh' ? '正在拉取最新设计令牌与元数据。' : 'Fetching latest design tokens and metadata.'),
    extraWcAttrs: { loading: true },
    extraReactProps: { loading: true },
  }),

  'no-data': makeStateShowcase({
    id: 'no-data',
    wcTag: 'tx-no-data',
    reactName: 'TxNoData',
    title: l => (l === 'zh' ? '暂无统计数据' : 'No metrics available'),
    description: l => (l === 'zh' ? '当前筛选区间内还没有记录。' : 'No records were recorded in this range.'),
    actionLabel: l => (l === 'zh' ? '刷新数据' : 'Refresh'),
  }),

  'no-selection': makeStateShowcase({
    id: 'no-selection',
    wcTag: 'tx-no-selection',
    reactName: 'TxNoSelection',
    title: l => (l === 'zh' ? '未选择对象' : 'No item selected'),
    description: l => (l === 'zh' ? '请在左侧列表选择一项以查看详情。' : 'Select an entry from the list to inspect details.'),
  }),

  'offline-state': makeStateShowcase({
    id: 'offline-state',
    wcTag: 'tx-offline-state',
    reactName: 'TxOfflineState',
    title: l => (l === 'zh' ? '当前处于离线状态' : 'You are offline'),
    description: l => (l === 'zh' ? '本地变更已暂存，网络恢复后将自动同步。' : 'Local changes are queued and will sync once online.'),
    actionLabel: l => (l === 'zh' ? '重新连接' : 'Reconnect'),
  }),

  'permission-state': makeStateShowcase({
    id: 'permission-state',
    wcTag: 'tx-permission-state',
    reactName: 'TxPermissionState',
    title: l => (l === 'zh' ? '需要访问权限' : 'Permission required'),
    description: l => (l === 'zh' ? '请授予辅助功能权限以启用全局唤起。' : 'Grant accessibility permission to enable global summon.'),
    actionLabel: l => (l === 'zh' ? '授予权限' : 'Grant access'),
  }),

  'search-empty': makeStateShowcase({
    id: 'search-empty',
    wcTag: 'tx-search-empty',
    reactName: 'TxSearchEmpty',
    title: l => (l === 'zh' ? '未找到匹配结果' : 'No matching results'),
    description: l => (l === 'zh' ? '尝试更换关键词或清除筛选条件。' : 'Try a different keyword or clear active filters.'),
    actionLabel: l => (l === 'zh' ? '清除搜索' : 'Clear search'),
  }),

  breadcrumb: {
    id: 'breadcrumb',
    wcTag: 'tx-breadcrumb',
    wcCode: locale => `<tx-breadcrumb items='${JSON.stringify([
      { label: locale === 'zh' ? '工作区' : 'Workspace', href: '#workspace' },
      { label: locale === 'zh' ? '组件库' : 'Components', href: '#components' },
      { label: 'Breadcrumb' },
    ])}'></tx-breadcrumb>`,
    reactCode: locale => `import { TxBreadcrumb, TxBreadcrumbItem } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function BreadcrumbDemo() {
  return (
    <TxBreadcrumb>
      <TxBreadcrumbItem href="#workspace">${locale === 'zh' ? '工作区' : 'Workspace'}</TxBreadcrumbItem>
      <TxBreadcrumbItem href="#components">${locale === 'zh' ? '组件库' : 'Components'}</TxBreadcrumbItem>
      <TxBreadcrumbItem>Breadcrumb</TxBreadcrumbItem>
    </TxBreadcrumb>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const items = [
        { label: locale === 'zh' ? '工作区' : 'Workspace', href: '#workspace' },
        { label: locale === 'zh' ? '组件库' : 'Components', href: '#components' },
        { label: 'Breadcrumb' },
      ]
      const readout = createStatusReadout(locale === 'zh' ? '当前路径: Breadcrumb' : 'Active: Breadcrumb')
      const el = createWcEl('tx-breadcrumb', {
        attrs: { items: JSON.stringify(items) },
        props: { items },
        events: {
          click: (event: Event) => {
            const payload = unpackDetail<{ label?: string }>(event)
            if (payload?.label)
              readout.textContent = locale === 'zh' ? `点击节点: ${payload.label}` : `Clicked: ${payload.label}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxBreadcrumb = pickReactComponent(TuffexReact, 'TxBreadcrumb')
      const TxBreadcrumbItem = pickReactComponent(TuffexReact, 'TxBreadcrumbItem')
      const items = [
        { label: locale === 'zh' ? '工作区' : 'Workspace', href: '#workspace' },
        { label: locale === 'zh' ? '组件库' : 'Components', href: '#components' },
        { label: 'Breadcrumb' },
      ]
      return React.createElement(
        TxBreadcrumb,
        { items },
        ...items.map(item => React.createElement(TxBreadcrumbItem, { key: item.label, href: item.href }, item.label)),
      )
    },
  },

  'nav-bar': {
    id: 'nav-bar',
    wcTag: 'tx-nav-bar',
    wcCode: locale => `<tx-nav-bar title="${locale === 'zh' ? '组件详情' : 'Component details'}" show-back></tx-nav-bar>`,
    reactCode: locale => `import { TxNavBar } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function NavBarDemo() {
  return <TxNavBar title="${locale === 'zh' ? '组件详情' : 'Component details'}" showBack onBack={() => {}} />
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      let backs = 0
      const readout = createStatusReadout(locale === 'zh' ? '返回点击: 0' : 'Back clicks: 0')
      const el = createWcEl('tx-nav-bar', {
        attrs: { title: locale === 'zh' ? '组件详情' : 'Component details', 'show-back': true },
        props: { showBack: true },
        events: {
          back: () => {
            backs += 1
            readout.textContent = locale === 'zh' ? `返回点击: ${backs}` : `Back clicks: ${backs}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxNavBar = pickReactComponent(TuffexReact, 'TxNavBar')
      function Demo() {
        const [backs, setBacks] = React.useState(0)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxNavBar, { title: locale === 'zh' ? '组件详情' : 'Component details', showBack: true, onBack: () => setBacks(prev => prev + 1) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `返回点击: ${backs}` : `Back clicks: ${backs}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'sidebar-nav': {
    id: 'sidebar-nav',
    wcTag: 'tx-sidebar-nav',
    wcCode: locale => `<tx-sidebar-nav
  model-value="overview"
  items='${JSON.stringify([
    { value: 'overview', label: locale === 'zh' ? '概览' : 'Overview', group: 'core' },
    { value: 'tokens', label: locale === 'zh' ? '设计令牌' : 'Tokens', group: 'core', badge: 12 },
  ])}'
  groups='${JSON.stringify([{ key: 'core', label: locale === 'zh' ? '核心' : 'Core' }])}'
></tx-sidebar-nav>`,
    reactCode: locale => `import { useState } from 'react'
import { TxSidebarNav } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function SidebarNavDemo() {
  const [active, setActive] = useState('overview')
  return (
    <TxSidebarNav
      value={active}
      onChange={v => setActive(String(v))}
      groups={[{ key: 'core', label: '${locale === 'zh' ? '核心' : 'Core'}' }]}
      items={[
        { value: 'overview', label: '${locale === 'zh' ? '概览' : 'Overview'}', group: 'core' },
        { value: 'tokens', label: '${locale === 'zh' ? '设计令牌' : 'Tokens'}', group: 'core', badge: 12 },
      ]}
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const groups = [{ key: 'core', label: locale === 'zh' ? '核心' : 'Core' }]
      const items = [
        { value: 'overview', label: locale === 'zh' ? '概览' : 'Overview', group: 'core' },
        { value: 'tokens', label: locale === 'zh' ? '设计令牌' : 'Tokens', group: 'core', badge: 12 },
        { value: 'plugins', label: locale === 'zh' ? '插件' : 'Plugins', group: 'core' },
      ]
      const readout = createStatusReadout(locale === 'zh' ? '当前菜单: overview' : 'Active: overview')
      const nav = createWcEl('tx-sidebar-nav', {
        attrs: { 'model-value': 'overview', items: JSON.stringify(items), groups: JSON.stringify(groups) },
        props: { modelValue: 'overview', items, groups },
        events: {
          'update:model-value': (event: Event) => {
            const next = String(unpackDetail(event) ?? 'overview')
            readout.textContent = locale === 'zh' ? `当前菜单: ${next}` : `Active: ${next}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([nav, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxSidebarNav = pickReactComponent(TuffexReact, 'TxSidebarNav')
      const groups = [{ key: 'core', label: locale === 'zh' ? '核心' : 'Core' }]
      const items = [
        { value: 'overview', label: locale === 'zh' ? '概览' : 'Overview', group: 'core' },
        { value: 'tokens', label: locale === 'zh' ? '设计令牌' : 'Tokens', group: 'core', badge: 12 },
        { value: 'plugins', label: locale === 'zh' ? '插件' : 'Plugins', group: 'core' },
      ]
      function Demo() {
        const [active, setActive] = React.useState('overview')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxSidebarNav, { value: active, onChange: (v: string | number) => setActive(String(v)), groups, items }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `当前菜单: ${active}` : `Active: ${active}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'tab-bar': {
    id: 'tab-bar',
    wcTag: 'tx-tab-bar',
    wcCode: locale => `<tx-tab-bar
  model-value="home"
  indicator="pill"
  items='${JSON.stringify([
    { value: 'home', label: locale === 'zh' ? '首页' : 'Home' },
    { value: 'store', label: locale === 'zh' ? '商店' : 'Store', badge: 3 },
    { value: 'settings', label: locale === 'zh' ? '设置' : 'Settings' },
  ])}'
></tx-tab-bar>`,
    reactCode: locale => `import { useState } from 'react'
import { TxTabBar } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function TabBarDemo() {
  const [active, setActive] = useState('home')
  return (
    <TxTabBar
      value={active}
      indicator="pill"
      onChange={v => setActive(String(v))}
      items={[
        { value: 'home', label: '${locale === 'zh' ? '首页' : 'Home'}' },
        { value: 'store', label: '${locale === 'zh' ? '商店' : 'Store'}', badge: 3 },
        { value: 'settings', label: '${locale === 'zh' ? '设置' : 'Settings'}' },
      ]}
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const items = [
        { value: 'home', label: locale === 'zh' ? '首页' : 'Home' },
        { value: 'store', label: locale === 'zh' ? '商店' : 'Store', badge: 3 },
        { value: 'settings', label: locale === 'zh' ? '设置' : 'Settings' },
      ]
      const readout = createStatusReadout(locale === 'zh' ? '当前页签: home' : 'Active tab: home')
      const bar = createWcEl('tx-tab-bar', {
        attrs: { 'model-value': 'home', indicator: 'pill', items: JSON.stringify(items) },
        props: { modelValue: 'home', indicator: 'pill', items },
        events: {
          'update:model-value': (event: Event) => {
            const next = String(unpackDetail(event) ?? 'home')
            readout.textContent = locale === 'zh' ? `当前页签: ${next}` : `Active tab: ${next}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([bar, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxTabBar = pickReactComponent(TuffexReact, 'TxTabBar')
      const items = [
        { value: 'home', label: locale === 'zh' ? '首页' : 'Home' },
        { value: 'store', label: locale === 'zh' ? '商店' : 'Store', badge: 3 },
        { value: 'settings', label: locale === 'zh' ? '设置' : 'Settings' },
      ]
      function Demo() {
        const [active, setActive] = React.useState('home')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxTabBar, { value: active, indicator: 'pill', items, onChange: (v: string | number) => setActive(String(v)) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `当前页签: ${active}` : `Active tab: ${active}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  pagination: {
    id: 'pagination',
    wcTag: 'tx-pagination',
    wcCode: () => `<tx-pagination current-page="2" page-size="10" total="96" show-info></tx-pagination>`,
    reactCode: () => `import { useState } from 'react'
import { TxPagination } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function PaginationDemo() {
  const [page, setPage] = useState(2)
  return <TxPagination currentPage={page} pageSize={10} total={96} showInfo onChange={setPage} />
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '当前页: 2 / 10' : 'Page: 2 / 10')
      const onPage = (event: Event) => {
        const next = Number(unpackDetail(event) ?? 1)
        ;(pager as unknown as Record<string, unknown>).currentPage = next
        readout.textContent = locale === 'zh' ? `当前页: ${next} / 10` : `Page: ${next} / 10`
      }
      const pager = createWcEl('tx-pagination', {
        attrs: { 'current-page': 2, 'page-size': 10, total: 96, 'show-info': true },
        props: { currentPage: 2, pageSize: 10, total: 96, showInfo: true },
        events: { 'update:current-page': onPage, change: onPage },
      }, disposers)
      container.replaceChildren(createStageRow([pager, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxPagination = pickReactComponent(TuffexReact, 'TxPagination')
      function Demo() {
        const [page, setPage] = React.useState(2)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxPagination, { currentPage: page, pageSize: 10, total: 96, showInfo: true, onChange: (p: number) => setPage(Number(p)), onPageChange: (p: number) => setPage(Number(p)) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `当前页: ${page} / 10` : `Page: ${page} / 10`),
        )
      }
      return React.createElement(Demo)
    },
  },

  steps: {
    id: 'steps',
    wcTag: 'tx-steps',
    wcCode: locale => `<tx-steps active="1">
  <tx-step step="0" title="${locale === 'zh' ? '安装依赖' : 'Install'}"></tx-step>
  <tx-step step="1" title="${locale === 'zh' ? '配置令牌' : 'Configure'}"></tx-step>
  <tx-step step="2" title="${locale === 'zh' ? '发布上线' : 'Publish'}"></tx-step>
</tx-steps>`,
    reactCode: locale => `import { useState } from 'react'
import { TxStep, TxSteps } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function StepsDemo() {
  const [active, setActive] = useState(1)
  return (
    <TxSteps active={active} onChange={setActive}>
      <TxStep step={0} title="${locale === 'zh' ? '安装依赖' : 'Install'}" />
      <TxStep step={1} title="${locale === 'zh' ? '配置令牌' : 'Configure'}" />
      <TxStep step={2} title="${locale === 'zh' ? '发布上线' : 'Publish'}" />
    </TxSteps>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      let active = 1
      const steps = createWcEl('tx-steps', {
        attrs: { active: 1 },
        props: { active: 1 },
        children: [
          createWcEl('tx-step', { attrs: { step: 0, title: locale === 'zh' ? '安装依赖' : 'Install' } }),
          createWcEl('tx-step', { attrs: { step: 1, title: locale === 'zh' ? '配置令牌' : 'Configure' } }),
          createWcEl('tx-step', { attrs: { step: 2, title: locale === 'zh' ? '发布上线' : 'Publish' } }),
        ],
      })
      const nextBtn = createWcEl('tx-button', {
        attrs: { size: 'sm', variant: 'secondary' },
        text: locale === 'zh' ? '下一步' : 'Next step',
        events: {
          click: () => {
            active = (active + 1) % 3
            steps.setAttribute('active', String(active))
            ;(steps as unknown as Record<string, unknown>).active = active
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([steps, nextBtn], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxSteps = pickReactComponent(TuffexReact, 'TxSteps')
      const TxStep = pickReactComponent(TuffexReact, 'TxStep')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      function Demo() {
        const [active, setActive] = React.useState(1)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(
            TxSteps,
            { active, onChange: (next: number) => setActive(Number(next)) },
            React.createElement(TxStep, { step: 0, title: locale === 'zh' ? '安装依赖' : 'Install' }),
            React.createElement(TxStep, { step: 1, title: locale === 'zh' ? '配置令牌' : 'Configure' }),
            React.createElement(TxStep, { step: 2, title: locale === 'zh' ? '发布上线' : 'Publish' }),
          ),
          React.createElement(TxButton, { size: 'sm', variant: 'secondary', onClick: () => setActive(prev => (prev + 1) % 3) }, locale === 'zh' ? '下一步' : 'Next step'),
        )
      }
      return React.createElement(Demo)
    },
  },

  'loading-overlay': {
    id: 'loading-overlay',
    wcTag: 'tx-loading-overlay',
    wcCode: locale => `<div style="position: relative; min-height: 96px">
  <tx-loading-overlay loading text="${locale === 'zh' ? '同步中…' : 'Syncing...'}"></tx-loading-overlay>
</div>`,
    reactCode: locale => `import { useState } from 'react'
import { TxButton, TxLoadingOverlay } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function LoadingOverlayDemo() {
  const [loading, setLoading] = useState(true)
  return (
    <div style={{ position: 'relative', minHeight: 96 }}>
      <TxButton size="sm" onClick={() => setLoading(v => !v)}>${locale === 'zh' ? '切换遮罩' : 'Toggle overlay'}</TxButton>
      <TxLoadingOverlay loading={loading} text="${locale === 'zh' ? '同步中…' : 'Syncing...'}" />
    </div>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      let loading = true
      const overlay = createWcEl('tx-loading-overlay', {
        attrs: { loading: true, text: locale === 'zh' ? '同步中…' : 'Syncing...' },
        props: { loading: true },
      })
      const host = createWcEl('div', {
        style: { position: 'relative', minHeight: '96px', ...DEMO_BOX_STYLE },
        text: locale === 'zh' ? '数据面板内容' : 'Panel content',
        children: [overlay],
      })
      const toggle = createWcEl('tx-button', {
        attrs: { size: 'sm', variant: 'secondary' },
        text: locale === 'zh' ? '切换加载遮罩' : 'Toggle loading overlay',
        events: {
          click: () => {
            loading = !loading
            ;(overlay as unknown as Record<string, unknown>).loading = loading
            if (loading)
              overlay.setAttribute('loading', '')
            else
              overlay.removeAttribute('loading')
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([toggle, host], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxLoadingOverlay = pickReactComponent(TuffexReact, 'TxLoadingOverlay')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      function Demo() {
        const [loading, setLoading] = React.useState(true)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxButton, { size: 'sm', variant: 'secondary', onClick: () => setLoading(prev => !prev) }, locale === 'zh' ? '切换加载遮罩' : 'Toggle loading overlay'),
          React.createElement(
            'div',
            { style: { position: 'relative', minHeight: 96, ...DEMO_BOX_STYLE } },
            locale === 'zh' ? '数据面板内容' : 'Panel content',
            React.createElement(TxLoadingOverlay, { loading, text: locale === 'zh' ? '同步中…' : 'Syncing...' }),
          ),
        )
      }
      return React.createElement(Demo)
    },
  },

  modal: {
    id: 'modal',
    wcTag: 'tx-modal',
    wcCode: locale => `<tx-button variant="primary">${locale === 'zh' ? '打开模态框' : 'Open modal'}</tx-button>
<tx-modal title="${locale === 'zh' ? '确认配置' : 'Confirm configuration'}" width="440px">
  ${locale === 'zh' ? '支持 Esc、遮罩关闭与焦点回退。' : 'Supports Escape, backdrop dismiss, and focus return.'}
</tx-modal>`,
    reactCode: locale => `import { useState } from 'react'
import { TxButton, TxModal } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ModalDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TxButton variant="primary" onClick={() => setOpen(true)}>${locale === 'zh' ? '打开模态框' : 'Open modal'}</TxButton>
      <TxModal open={open} onOpenChange={setOpen} title="${locale === 'zh' ? '确认配置' : 'Confirm configuration'}" width="440px">
        ${locale === 'zh' ? '支持 Esc、遮罩关闭与焦点回退。' : 'Supports Escape, backdrop dismiss, and focus return.'}
      </TxModal>
    </>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const setOpen = (next: boolean) => {
        const el = modal as unknown as Record<string, unknown>
        el.modelValue = next
        el.open = next
        if (next)
          modal.setAttribute('model-value', '')
        else
          modal.removeAttribute('model-value')
      }
      const modal = createWcEl('tx-modal', {
        attrs: { title: locale === 'zh' ? '确认配置' : 'Confirm configuration', width: '440px' },
        text: locale === 'zh' ? '支持 Esc、遮罩关闭与焦点回退。' : 'Supports Escape, backdrop dismiss, and focus return.',
        events: {
          close: () => setOpen(false),
          'update:model-value': (event: Event) => {
            if (!unpackDetail(event))
              setOpen(false)
          },
        },
      }, disposers)
      const btn = createWcEl('tx-button', {
        attrs: { variant: 'primary' },
        text: locale === 'zh' ? '打开模态框' : 'Open modal',
        events: { click: () => setOpen(true) },
      }, disposers)
      container.replaceChildren(createStageRow([btn, modal]))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxModal = pickReactComponent(TuffexReact, 'TxModal')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      function Demo() {
        const [open, setOpen] = React.useState(false)
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(TxButton, { variant: 'primary', onClick: () => setOpen(true) }, locale === 'zh' ? '打开模态框' : 'Open modal'),
          React.createElement(
            TxModal,
            { open, onOpenChange: (v: boolean) => setOpen(Boolean(v)), onClose: () => setOpen(false), title: locale === 'zh' ? '确认配置' : 'Confirm configuration', width: '440px' },
            locale === 'zh' ? '支持 Esc、遮罩关闭与焦点回退。' : 'Supports Escape, backdrop dismiss, and focus return.',
          ),
        )
      }
      return React.createElement(Demo)
    },
  },

  toast: {
    id: 'toast',
    wcTag: 'tx-toast',
    wcCode: locale => `<tx-toast position="bottom-right" aria-label="${locale === 'zh' ? '通知中心' : 'Notifications'}"></tx-toast>`,
    reactCode: locale => `import { TxButton, TxToast, txToast } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ToastDemo() {
  return (
    <>
      <TxButton variant="primary" onClick={() => txToast('${locale === 'zh' ? '已保存更改' : 'Changes saved'}')}>
        ${locale === 'zh' ? '发送提示' : 'Show toast'}
      </TxButton>
      <TxToast position="bottom-right" />
    </>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      let sent = 0
      const readout = createStatusReadout(locale === 'zh' ? '已发送: 0' : 'Dispatched: 0')
      const host = createWcEl('tx-toast', { attrs: { position: 'bottom-right' } })
      const trigger = createWcEl('tx-button', {
        attrs: { variant: 'primary' },
        text: locale === 'zh' ? '触发 Toast 通知' : 'Trigger toast',
        events: {
          click: () => {
            sent += 1
            readout.textContent = locale === 'zh' ? `已发送: ${sent}` : `Dispatched: ${sent}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([trigger, readout, host]))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxToast = pickReactComponent(TuffexReact, 'TxToast')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      const txToastFn = typeof TuffexReact.txToast === 'function' ? (TuffexReact.txToast as (msg: string) => void) : null
      function Demo() {
        const [sent, setSent] = React.useState(0)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__row' },
          React.createElement(
            TxButton,
            {
              variant: 'primary',
              onClick: () => {
                setSent(prev => prev + 1)
                txToastFn?.(locale === 'zh' ? '已保存更改' : 'Changes saved')
              },
            },
            locale === 'zh' ? '触发 Toast 通知' : 'Trigger toast',
          ),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `已发送: ${sent}` : `Dispatched: ${sent}`),
          React.createElement(TxToast, { position: 'bottom-right' }),
        )
      }
      return React.createElement(Demo)
    },
  },

  'toast-panel': {
    id: 'toast-panel',
    wcTag: 'tx-toast-panel',
    wcCode: locale => `<tx-toast-panel open tether side="below">
  ${locale === 'zh' ? '来自上方卡片的关联提示面板。' : 'Tethered notification surfaced beneath its origin.'}
</tx-toast-panel>`,
    reactCode: locale => `import { useState } from 'react'
import { TxButton, TxToastPanel } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ToastPanelDemo() {
  const [open, setOpen] = useState(true)
  return (
    <div className="tuff-fw-stage__stack">
      <TxButton size="sm" variant="secondary" onClick={() => setOpen(v => !v)}>
        ${locale === 'zh' ? '切换关联面板' : 'Toggle panel'}
      </TxButton>
      <TxToastPanel open={open} tether side="below">
        ${locale === 'zh' ? '来自上方卡片的关联提示面板。' : 'Tethered notification surfaced beneath its origin.'}
      </TxToastPanel>
    </div>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      let open = true
      const panel = createWcEl('tx-toast-panel', {
        attrs: { open: true, tether: true, side: 'below' },
        props: { open: true, tether: true, side: 'below' },
        text: locale === 'zh' ? '来自上方卡片的关联提示面板。' : 'Tethered notification surfaced beneath its origin.',
      })
      const btn = createWcEl('tx-button', {
        attrs: { size: 'sm', variant: 'secondary' },
        text: locale === 'zh' ? '切换关联面板' : 'Toggle panel',
        events: {
          click: () => {
            open = !open
            ;(panel as unknown as Record<string, unknown>).open = open
            if (open)
              panel.setAttribute('open', '')
            else
              panel.removeAttribute('open')
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([btn, panel], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxToastPanel = pickReactComponent(TuffexReact, 'TxToastPanel')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      function Demo() {
        const [open, setOpen] = React.useState(true)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxButton, { size: 'sm', variant: 'secondary', onClick: () => setOpen(prev => !prev) }, locale === 'zh' ? '切换关联面板' : 'Toggle panel'),
          React.createElement(TxToastPanel, { open, tether: true, side: 'below' }, locale === 'zh' ? '来自上方卡片的关联提示面板。' : 'Tethered notification surfaced beneath its origin.'),
        )
      }
      return React.createElement(Demo)
    },
  },

  timeline: {
    id: 'timeline',
    wcTag: 'tx-timeline',
    wcCode: locale => `<tx-timeline layout="vertical">
  <tx-timeline-item title="${locale === 'zh' ? '基础组件全覆盖' : 'Base suite complete'}" time="10:30" color="success" active></tx-timeline-item>
  <tx-timeline-item title="${locale === 'zh' ? '令牌统一验证' : 'Token parity check'}" time="09:45" color="primary"></tx-timeline-item>
</tx-timeline>`,
    reactCode: locale => `import { TxTimeline, TxTimelineItem } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function TimelineDemo() {
  return (
    <TxTimeline layout="vertical">
      <TxTimelineItem title="${locale === 'zh' ? '基础组件全覆盖' : 'Base suite complete'}" time="10:30" color="success" active />
      <TxTimelineItem title="${locale === 'zh' ? '令牌统一验证' : 'Token parity check'}" time="09:45" color="primary" />
    </TxTimeline>
  )
}`,
    mountWc: (container, locale) => {
      const timeline = createWcEl('tx-timeline', {
        attrs: { layout: 'vertical' },
        children: [
          createWcEl('tx-timeline-item', { attrs: { title: locale === 'zh' ? '基础组件全覆盖' : 'Base suite complete', time: '10:30', color: 'success', active: true } }),
          createWcEl('tx-timeline-item', { attrs: { title: locale === 'zh' ? '令牌统一验证' : 'Token parity check', time: '09:45', color: 'primary' } }),
        ],
      })
      container.replaceChildren(createStageRow([timeline], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxTimeline = pickReactComponent(TuffexReact, 'TxTimeline')
      const TxTimelineItem = pickReactComponent(TuffexReact, 'TxTimelineItem')
      return React.createElement(
        TxTimeline,
        { layout: 'vertical' },
        React.createElement(TxTimelineItem, { title: locale === 'zh' ? '基础组件全覆盖' : 'Base suite complete', time: '10:30', color: 'success', active: true }),
        React.createElement(TxTimelineItem, { title: locale === 'zh' ? '令牌统一验证' : 'Token parity check', time: '09:45', color: 'primary' }),
      )
    },
  },
}
