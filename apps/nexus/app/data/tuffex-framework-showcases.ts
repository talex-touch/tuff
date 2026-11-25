import type { Phase1ReadyComponentId } from './tuffex-framework-matrix'

export type ShowcaseLocale = 'zh' | 'en'

export interface ReactModuleLike {
  createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown
  Fragment: unknown
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void]
}

export interface FrameworkShowcaseDefinition {
  id: Phase1ReadyComponentId
  wcTag: string
  wcCode: (locale: ShowcaseLocale) => string
  reactCode: (locale: ShowcaseLocale) => string
  mountWc: (container: HTMLElement, locale: ShowcaseLocale) => () => void
  renderReact: (
    React: ReactModuleLike,
    TuffexReact: Record<string, unknown>,
    locale: ShowcaseLocale,
  ) => unknown
}

type ElAttrs = Record<string, string | number | boolean | undefined>
type ElProps = Record<string, unknown>

function createWcEl(
  tag: string,
  options: {
    attrs?: ElAttrs
    props?: ElProps
    text?: string
    children?: Node[]
    events?: Record<string, EventListener>
  } = {},
  disposers?: Array<() => void>,
): HTMLElement {
  const el = document.createElement(tag)
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value === undefined || value === false)
        continue
      el.setAttribute(key, value === true ? '' : String(value))
    }
  }
  if (options.props) {
    for (const [key, value] of Object.entries(options.props))
      (el as unknown as Record<string, unknown>)[key] = value
  }
  if (options.text !== undefined)
    el.textContent = options.text
  if (options.children) {
    for (const child of options.children)
      el.appendChild(child)
  }
  if (options.events) {
    for (const [eventName, handler] of Object.entries(options.events)) {
      el.addEventListener(eventName, handler)
      disposers?.push(() => el.removeEventListener(eventName, handler))
    }
  }
  return el
}

function createStageRow(children: Node[], vertical = false): HTMLDivElement {
  const row = document.createElement('div')
  row.className = vertical ? 'tuff-fw-stage__stack' : 'tuff-fw-stage__row'
  for (const child of children)
    row.appendChild(child)
  return row
}

function createStatusReadout(initialText: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = 'tuff-fw-stage__readout'
  span.textContent = initialText
  return span
}

function pickReactComponent(TuffexReact: Record<string, unknown>, name: string): unknown {
  return TuffexReact[name] ?? TuffexReact.default ?? 'div'
}

export const TUFFEX_FRAMEWORK_SHOWCASES: Readonly<Record<Phase1ReadyComponentId, FrameworkShowcaseDefinition>> = {
  button: {
    id: 'button',
    wcTag: 'tx-button',
    wcCode: locale => `<script type="module">
  import { registerTuffexElements } from '@talex-touch/tuffex-wc'
  import '@talex-touch/tuffex-wc/style.css'
  registerTuffexElements()
</script>

<div class="tuff-demo-row">
  <tx-button>${locale === 'zh' ? '默认按钮' : 'Default'}</tx-button>
  <tx-button variant="primary">${locale === 'zh' ? '主要操作' : 'Primary'}</tx-button>
  <tx-button variant="secondary">${locale === 'zh' ? '次要操作' : 'Secondary'}</tx-button>
  <tx-button variant="ghost">${locale === 'zh' ? '幽灵按钮' : 'Ghost'}</tx-button>
  <tx-button variant="danger">${locale === 'zh' ? '危险操作' : 'Danger'}</tx-button>
</div>`,
    reactCode: locale => `import { TxButton } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ButtonDemo() {
  return (
    <div className="tuff-demo-row">
      <TxButton>${locale === 'zh' ? '默认按钮' : 'Default'}</TxButton>
      <TxButton variant="primary">${locale === 'zh' ? '主要操作' : 'Primary'}</TxButton>
      <TxButton variant="secondary">${locale === 'zh' ? '次要操作' : 'Secondary'}</TxButton>
      <TxButton variant="ghost">${locale === 'zh' ? '幽灵按钮' : 'Ghost'}</TxButton>
      <TxButton variant="danger">${locale === 'zh' ? '危险操作' : 'Danger'}</TxButton>
    </div>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      let clicks = 0
      const readout = createStatusReadout(locale === 'zh' ? '点击计数: 0' : 'Clicks: 0')
      const onClick = () => {
        clicks += 1
        readout.textContent = locale === 'zh' ? `点击计数: ${clicks}` : `Clicks: ${clicks}`
      }
      const row = createStageRow([
        createWcEl('tx-button', { text: locale === 'zh' ? '默认按钮' : 'Default', events: { click: onClick } }, disposers),
        createWcEl('tx-button', { attrs: { variant: 'primary' }, text: locale === 'zh' ? '主要操作' : 'Primary', events: { click: onClick } }, disposers),
        createWcEl('tx-button', { attrs: { variant: 'secondary' }, text: locale === 'zh' ? '次要操作' : 'Secondary', events: { click: onClick } }, disposers),
        createWcEl('tx-button', { attrs: { variant: 'ghost' }, text: locale === 'zh' ? '幽灵按钮' : 'Ghost', events: { click: onClick } }, disposers),
        createWcEl('tx-button', { attrs: { variant: 'danger' }, text: locale === 'zh' ? '危险操作' : 'Danger', events: { click: onClick } }, disposers),
        readout,
      ])
      container.replaceChildren(row)
      return () => {
        for (const dispose of disposers)
          dispose()
      }
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      function Demo() {
        const [count, setCount] = React.useState(0)
        const bump = () => setCount(prev => prev + 1)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__row' },
          React.createElement(TxButton, { onClick: bump }, locale === 'zh' ? '默认按钮' : 'Default'),
          React.createElement(TxButton, { variant: 'primary', onClick: bump }, locale === 'zh' ? '主要操作' : 'Primary'),
          React.createElement(TxButton, { variant: 'secondary', onClick: bump }, locale === 'zh' ? '次要操作' : 'Secondary'),
          React.createElement(TxButton, { variant: 'ghost', onClick: bump }, locale === 'zh' ? '幽灵按钮' : 'Ghost'),
          React.createElement(TxButton, { variant: 'danger', onClick: bump }, locale === 'zh' ? '危险操作' : 'Danger'),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `点击计数: ${count}` : `Clicks: ${count}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  badge: {
    id: 'badge',
    wcTag: 'tx-badge',
    wcCode: locale => `<tx-badge variant="primary" value="6">
  <tx-button>${locale === 'zh' ? '通知' : 'Inbox'}</tx-button>
</tx-badge>
<tx-badge dot color="var(--tx-color-success)">
  <tx-button variant="secondary">${locale === 'zh' ? '在线' : 'Online'}</tx-button>
</tx-badge>`,
    reactCode: locale => `import { TxBadge, TxButton } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function BadgeDemo() {
  return (
    <div className="tuff-demo-row">
      <TxBadge variant="primary" value={6}>
        <TxButton>${locale === 'zh' ? '通知' : 'Inbox'}</TxButton>
      </TxBadge>
      <TxBadge dot color="var(--tx-color-success)">
        <TxButton variant="secondary">${locale === 'zh' ? '在线' : 'Online'}</TxButton>
      </TxBadge>
    </div>
  )
}`,
    mountWc: (container, locale) => {
      const row = createStageRow([
        createWcEl('tx-badge', { attrs: { variant: 'primary', value: 6 }, children: [createWcEl('tx-button', { text: locale === 'zh' ? '通知' : 'Inbox' })] }),
        createWcEl('tx-badge', { attrs: { dot: true, color: 'var(--tx-color-success)' }, children: [createWcEl('tx-button', { attrs: { variant: 'secondary' }, text: locale === 'zh' ? '在线' : 'Online' })] }),
      ])
      container.replaceChildren(row)
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxBadge = pickReactComponent(TuffexReact, 'TxBadge')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      return React.createElement(
        'div',
        { className: 'tuff-fw-stage__row' },
        React.createElement(TxBadge, { variant: 'primary', value: 6 }, React.createElement(TxButton, null, locale === 'zh' ? '通知' : 'Inbox')),
        React.createElement(TxBadge, { dot: true, color: 'var(--tx-color-success)' }, React.createElement(TxButton, { variant: 'secondary' }, locale === 'zh' ? '在线' : 'Online')),
      )
    },
  },

  tag: {
    id: 'tag',
    wcTag: 'tx-tag',
    wcCode: locale => `<div class="tuff-demo-row">
  <tx-tag label="${locale === 'zh' ? '稳定版' : 'Stable'}" color="var(--tx-color-success)"></tx-tag>
  <tx-tag label="${locale === 'zh' ? '测试版' : 'Beta'}" color="var(--tx-color-warning)"></tx-tag>
  <tx-tag label="${locale === 'zh' ? '可关闭' : 'Closable'}" closable></tx-tag>
</div>`,
    reactCode: locale => `import { TxTag } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function TagDemo() {
  return (
    <div className="tuff-demo-row">
      <TxTag label="${locale === 'zh' ? '稳定版' : 'Stable'}" color="var(--tx-color-success)" />
      <TxTag label="${locale === 'zh' ? '测试版' : 'Beta'}" color="var(--tx-color-warning)" />
      <TxTag label="${locale === 'zh' ? '可关闭' : 'Closable'}" closable />
    </div>
  )
}`,
    mountWc: (container, locale) => {
      const row = createStageRow([
        createWcEl('tx-tag', { attrs: { label: locale === 'zh' ? '稳定版' : 'Stable', color: 'var(--tx-color-success)' } }),
        createWcEl('tx-tag', { attrs: { label: locale === 'zh' ? '测试版' : 'Beta', color: 'var(--tx-color-warning)' } }),
        createWcEl('tx-tag', { attrs: { label: locale === 'zh' ? '可关闭' : 'Closable', closable: true } }),
      ])
      container.replaceChildren(row)
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxTag = pickReactComponent(TuffexReact, 'TxTag')
      return React.createElement(
        'div',
        { className: 'tuff-fw-stage__row' },
        React.createElement(TxTag, { label: locale === 'zh' ? '稳定版' : 'Stable', color: 'var(--tx-color-success)' }),
        React.createElement(TxTag, { label: locale === 'zh' ? '测试版' : 'Beta', color: 'var(--tx-color-warning)' }),
        React.createElement(TxTag, { label: locale === 'zh' ? '可关闭' : 'Closable', closable: true }),
      )
    },
  },

  avatar: {
    id: 'avatar',
    wcTag: 'tx-avatar',
    wcCode: () => `<div class="tuff-demo-row">
  <tx-avatar name="Talex" shape="circle"></tx-avatar>
  <tx-avatar name="Kiri" shape="rounded"></tx-avatar>
  <tx-avatar name="Ame" shape="square"></tx-avatar>
</div>`,
    reactCode: () => `import { TxAvatar } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function AvatarDemo() {
  return (
    <div className="tuff-demo-row">
      <TxAvatar name="Talex" shape="circle" />
      <TxAvatar name="Kiri" shape="rounded" />
      <TxAvatar name="Ame" shape="square" />
    </div>
  )
}`,
    mountWc: (container) => {
      const row = createStageRow([
        createWcEl('tx-avatar', { attrs: { name: 'Talex', shape: 'circle' } }),
        createWcEl('tx-avatar', { attrs: { name: 'Kiri', shape: 'rounded' } }),
        createWcEl('tx-avatar', { attrs: { name: 'Ame', shape: 'square' } }),
      ])
      container.replaceChildren(row)
      return () => {}
    },
    renderReact: (React, TuffexReact) => {
      const TxAvatar = pickReactComponent(TuffexReact, 'TxAvatar')
      return React.createElement(
        'div',
        { className: 'tuff-fw-stage__row' },
        React.createElement(TxAvatar, { name: 'Talex', shape: 'circle' }),
        React.createElement(TxAvatar, { name: 'Kiri', shape: 'rounded' }),
        React.createElement(TxAvatar, { name: 'Ame', shape: 'square' }),
      )
    },
  },

  spinner: {
    id: 'spinner',
    wcTag: 'tx-spinner',
    wcCode: () => `<div class="tuff-demo-row">
  <tx-spinner size="16"></tx-spinner>
  <tx-spinner size="22"></tx-spinner>
  <tx-spinner size="28"></tx-spinner>
</div>`,
    reactCode: () => `import { TxSpinner } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function SpinnerDemo() {
  return (
    <div className="tuff-demo-row">
      <TxSpinner size={16} />
      <TxSpinner size={22} />
      <TxSpinner size={28} />
    </div>
  )
}`,
    mountWc: (container) => {
      const row = createStageRow([
        createWcEl('tx-spinner', { attrs: { size: 16 } }),
        createWcEl('tx-spinner', { attrs: { size: 22 } }),
        createWcEl('tx-spinner', { attrs: { size: 28 } }),
      ])
      container.replaceChildren(row)
      return () => {}
    },
    renderReact: (React, TuffexReact) => {
      const TxSpinner = pickReactComponent(TuffexReact, 'TxSpinner')
      return React.createElement(
        'div',
        { className: 'tuff-fw-stage__row' },
        React.createElement(TxSpinner, { size: 16 }),
        React.createElement(TxSpinner, { size: 22 }),
        React.createElement(TxSpinner, { size: 28 }),
      )
    },
  },

  divider: {
    id: 'divider',
    wcTag: 'tx-divider',
    wcCode: locale => `<div>
  <p>${locale === 'zh' ? '上方区块' : 'Upper section'}</p>
  <tx-divider>${locale === 'zh' ? '分组' : 'Section'}</tx-divider>
  <p>${locale === 'zh' ? '下方区块' : 'Lower section'}</p>
</div>`,
    reactCode: locale => `import { TxDivider } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function DividerDemo() {
  return (
    <div className="tuff-fw-stage__stack">
      <span>${locale === 'zh' ? '上方区块' : 'Upper section'}</span>
      <TxDivider>${locale === 'zh' ? '分组' : 'Section'}</TxDivider>
      <span>${locale === 'zh' ? '下方区块' : 'Lower section'}</span>
    </div>
  )
}`,
    mountWc: (container, locale) => {
      const top = document.createElement('span')
      top.textContent = locale === 'zh' ? '上方区块' : 'Upper section'
      const bottom = document.createElement('span')
      bottom.textContent = locale === 'zh' ? '下方区块' : 'Lower section'
      const stack = createStageRow([
        top,
        createWcEl('tx-divider', { text: locale === 'zh' ? '分组' : 'Section' }),
        bottom,
      ], true)
      container.replaceChildren(stack)
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxDivider = pickReactComponent(TuffexReact, 'TxDivider')
      return React.createElement(
        'div',
        { className: 'tuff-fw-stage__stack' },
        React.createElement('span', null, locale === 'zh' ? '上方区块' : 'Upper section'),
        React.createElement(TxDivider, null, locale === 'zh' ? '分组' : 'Section'),
        React.createElement('span', null, locale === 'zh' ? '下方区块' : 'Lower section'),
      )
    },
  },

  alert: {
    id: 'alert',
    wcTag: 'tx-alert',
    wcCode: locale => `<tx-alert
  type="info"
  title="${locale === 'zh' ? '同步已完成' : 'Sync completed'}"
  message="${locale === 'zh' ? '所有设计令牌已在多框架间保持一致。' : 'Design tokens stay unified across Vue, React, and Web Components.'}"
></tx-alert>`,
    reactCode: locale => `import { TxAlert } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function AlertDemo() {
  return (
    <TxAlert
      type="info"
      title="${locale === 'zh' ? '同步已完成' : 'Sync completed'}"
      message="${locale === 'zh' ? '所有设计令牌已在多框架间保持一致。' : 'Design tokens stay unified across Vue, React, and Web Components.'}"
    />
  )
}`,
    mountWc: (container, locale) => {
      const stack = createStageRow([
        createWcEl('tx-alert', {
          attrs: {
            type: 'info',
            title: locale === 'zh' ? '同步已完成' : 'Sync completed',
            message: locale === 'zh'
              ? '所有设计令牌已在多框架间保持一致。'
              : 'Design tokens stay unified across Vue, React, and Web Components.',
          },
        }),
      ], true)
      container.replaceChildren(stack)
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxAlert = pickReactComponent(TuffexReact, 'TxAlert')
      return React.createElement(TxAlert, {
        type: 'info',
        title: locale === 'zh' ? '同步已完成' : 'Sync completed',
        message: locale === 'zh'
          ? '所有设计令牌已在多框架间保持一致。'
          : 'Design tokens stay unified across Vue, React, and Web Components.',
      })
    },
  },

  card: {
    id: 'card',
    wcTag: 'tx-card',
    wcCode: locale => `<tx-card shadow="soft">
  <div slot="header">${locale === 'zh' ? '发布工作台' : 'Release Workspace'}</div>
  <p>${locale === 'zh' ? '跨框架共享同一套 --tx-* 令牌与表面材质。' : 'Shared --tx-* tokens and surface physics across frameworks.'}</p>
</tx-card>`,
    reactCode: locale => `import { TxCard } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function CardDemo() {
  return (
    <TxCard header="${locale === 'zh' ? '发布工作台' : 'Release Workspace'}" shadow="soft">
      ${locale === 'zh' ? '跨框架共享同一套 --tx-* 令牌与表面材质。' : 'Shared --tx-* tokens and surface physics across frameworks.'}
    </TxCard>
  )
}`,
    mountWc: (container, locale) => {
      const body = document.createElement('div')
      body.textContent = locale === 'zh'
        ? '跨框架共享同一套 --tx-* 令牌与表面材质。'
        : 'Shared --tx-* tokens and surface physics across frameworks.'
      const header = document.createElement('span')
      header.setAttribute('slot', 'header')
      header.textContent = locale === 'zh' ? '发布工作台' : 'Release Workspace'
      const card = createWcEl('tx-card', { attrs: { shadow: 'soft' }, children: [header, body] })
      container.replaceChildren(createStageRow([card], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxCard = pickReactComponent(TuffexReact, 'TxCard')
      return React.createElement(
        TxCard,
        { header: locale === 'zh' ? '发布工作台' : 'Release Workspace', shadow: 'soft' },
        locale === 'zh'
          ? '跨框架共享同一套 --tx-* 令牌与表面材质。'
          : 'Shared --tx-* tokens and surface physics across frameworks.',
      )
    },
  },

  kbd: {
    id: 'kbd',
    wcTag: 'tx-kbd',
    wcCode: () => `<div class="tuff-demo-row">
  <tx-kbd>⌘</tx-kbd>
  <tx-kbd>K</tx-kbd>
  <tx-kbd>⇧</tx-kbd>
  <tx-kbd>Enter</tx-kbd>
</div>`,
    reactCode: () => `import { TxKbd } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function KbdDemo() {
  return (
    <div className="tuff-demo-row">
      <TxKbd>⌘</TxKbd>
      <TxKbd>K</TxKbd>
      <TxKbd>⇧</TxKbd>
      <TxKbd>Enter</TxKbd>
    </div>
  )
}`,
    mountWc: (container) => {
      const row = createStageRow([
        createWcEl('tx-kbd', { text: '⌘' }),
        createWcEl('tx-kbd', { text: 'K' }),
        createWcEl('tx-kbd', { text: '⇧' }),
        createWcEl('tx-kbd', { text: 'Enter' }),
      ])
      container.replaceChildren(row)
      return () => {}
    },
    renderReact: (React, TuffexReact) => {
      const TxKbd = pickReactComponent(TuffexReact, 'TxKbd')
      return React.createElement(
        'div',
        { className: 'tuff-fw-stage__row' },
        React.createElement(TxKbd, null, '⌘'),
        React.createElement(TxKbd, null, 'K'),
        React.createElement(TxKbd, null, '⇧'),
        React.createElement(TxKbd, null, 'Enter'),
      )
    },
  },

  progress: {
    id: 'progress',
    wcTag: 'tx-progress',
    wcCode: () => `<div class="tuff-demo-row">
  <tx-progress percentage="68"></tx-progress>
  <tx-progress percentage="100" status="success"></tx-progress>
</div>`,
    reactCode: () => `import { TxProgress } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ProgressDemo() {
  return (
    <div className="tuff-fw-stage__stack">
      <TxProgress percentage={68} />
      <TxProgress percentage={100} status="success" />
    </div>
  )
}`,
    mountWc: (container) => {
      const stack = createStageRow([
        createWcEl('tx-progress', { attrs: { percentage: 68 } }),
        createWcEl('tx-progress', { attrs: { percentage: 100, status: 'success' } }),
      ], true)
      container.replaceChildren(stack)
      return () => {}
    },
    renderReact: (React, TuffexReact) => {
      const TxProgress = pickReactComponent(TuffexReact, 'TxProgress')
      return React.createElement(
        'div',
        { className: 'tuff-fw-stage__stack' },
        React.createElement(TxProgress, { percentage: 68 }),
        React.createElement(TxProgress, { percentage: 100, status: 'success' }),
      )
    },
  },

  'progress-bar': {
    id: 'progress-bar',
    wcTag: 'tx-progress-bar',
    wcCode: () => `<tx-progress-bar percentage="76" show-text></tx-progress-bar>
<tx-progress-bar percentage="100" status="success" show-text></tx-progress-bar>`,
    reactCode: () => `import { TxProgressBar } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ProgressBarDemo() {
  return (
    <div className="tuff-fw-stage__stack">
      <TxProgressBar percentage={76} showText />
      <TxProgressBar percentage={100} status="success" showText />
    </div>
  )
}`,
    mountWc: (container) => {
      const stack = createStageRow([
        createWcEl('tx-progress-bar', { attrs: { percentage: 76, 'show-text': true } }),
        createWcEl('tx-progress-bar', { attrs: { percentage: 100, status: 'success', 'show-text': true } }),
      ], true)
      container.replaceChildren(stack)
      return () => {}
    },
    renderReact: (React, TuffexReact) => {
      const TxProgressBar = pickReactComponent(TuffexReact, 'TxProgressBar')
      return React.createElement(
        'div',
        { className: 'tuff-fw-stage__stack' },
        React.createElement(TxProgressBar, { percentage: 76, showText: true }),
        React.createElement(TxProgressBar, { percentage: 100, status: 'success', showText: true }),
      )
    },
  },

  skeleton: {
    id: 'skeleton',
    wcTag: 'tx-skeleton',
    wcCode: () => `<tx-skeleton lines="3" height="14" radius="7"></tx-skeleton>`,
    reactCode: () => `import { TxSkeleton } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function SkeletonDemo() {
  return (
    <div className="tuff-fw-stage__stack">
      <TxSkeleton width="45%" height={18} radius={8} />
      <TxSkeleton lines={3} height={13} radius={6} />
    </div>
  )
}`,
    mountWc: (container) => {
      const stack = createStageRow([
        createWcEl('tx-skeleton', { attrs: { width: '45%', height: 18, radius: 8 } }),
        createWcEl('tx-skeleton', { attrs: { lines: 3, height: 13, radius: 6 } }),
      ], true)
      container.replaceChildren(stack)
      return () => {}
    },
    renderReact: (React, TuffexReact) => {
      const TxSkeleton = pickReactComponent(TuffexReact, 'TxSkeleton')
      return React.createElement(
        'div',
        { className: 'tuff-fw-stage__stack' },
        React.createElement(TxSkeleton, { width: '45%', height: 18, radius: 8 }),
        React.createElement(TxSkeleton, { lines: 3, height: 13, radius: 6 }),
      )
    },
  },

  switch: {
    id: 'switch',
    wcTag: 'tx-switch',
    wcCode: () => `<tx-switch model-value="true"></tx-switch>
<tx-switch model-value="false"></tx-switch>`,
    reactCode: locale => `import { useState } from 'react'
import { TxSwitch } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function SwitchDemo() {
  const [checked, setChecked] = useState(true)
  return (
    <div className="tuff-demo-row">
      <TxSwitch checked={checked} onChange={setChecked} />
      <span>{checked ? '${locale === 'zh' ? '已开启' : 'Enabled'}' : '${locale === 'zh' ? '已关闭' : 'Disabled'}'}</span>
    </div>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      let checked = true
      const readout = createStatusReadout(locale === 'zh' ? '已开启' : 'Enabled')
      const sw = createWcEl('tx-switch', {
        attrs: { 'model-value': 'true' },
        props: { modelValue: true },
        events: {
          'update:model-value': (event: Event) => {
            const detail = (event as CustomEvent).detail
            checked = Array.isArray(detail) ? Boolean(detail[0]) : Boolean(detail)
            readout.textContent = checked ? (locale === 'zh' ? '已开启' : 'Enabled') : (locale === 'zh' ? '已关闭' : 'Disabled')
          },
          change: (event: Event) => {
            const detail = (event as CustomEvent).detail
            checked = Array.isArray(detail) ? Boolean(detail[0]) : Boolean(detail ?? !checked)
            readout.textContent = checked ? (locale === 'zh' ? '已开启' : 'Enabled') : (locale === 'zh' ? '已关闭' : 'Disabled')
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([sw, readout]))
      return () => {
        for (const dispose of disposers)
          dispose()
      }
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxSwitch = pickReactComponent(TuffexReact, 'TxSwitch')
      function Demo() {
        const [checked, setChecked] = React.useState(true)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__row' },
          React.createElement(TxSwitch, { checked, onChange: (val: boolean) => setChecked(Boolean(val)) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, checked ? (locale === 'zh' ? '已开启' : 'Enabled') : (locale === 'zh' ? '已关闭' : 'Disabled')),
        )
      }
      return React.createElement(Demo)
    },
  },

  'status-badge': {
    id: 'status-badge',
    wcTag: 'tx-status-badge',
    wcCode: locale => `<div class="tuff-demo-row">
  <tx-status-badge text="${locale === 'zh' ? '运行正常' : 'Operational'}" status="success"></tx-status-badge>
  <tx-status-badge text="${locale === 'zh' ? '审阅中' : 'Reviewing'}" status="warning"></tx-status-badge>
  <tx-status-badge text="${locale === 'zh' ? '异常' : 'Degraded'}" status="danger"></tx-status-badge>
</div>`,
    reactCode: locale => `import { TxStatusBadge } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function StatusBadgeDemo() {
  return (
    <div className="tuff-demo-row">
      <TxStatusBadge text="${locale === 'zh' ? '运行正常' : 'Operational'}" status="success" />
      <TxStatusBadge text="${locale === 'zh' ? '审阅中' : 'Reviewing'}" status="warning" />
      <TxStatusBadge text="${locale === 'zh' ? '异常' : 'Degraded'}" status="danger" />
    </div>
  )
}`,
    mountWc: (container, locale) => {
      const row = createStageRow([
        createWcEl('tx-status-badge', { attrs: { text: locale === 'zh' ? '运行正常' : 'Operational', status: 'success' } }),
        createWcEl('tx-status-badge', { attrs: { text: locale === 'zh' ? '审阅中' : 'Reviewing', status: 'warning' } }),
        createWcEl('tx-status-badge', { attrs: { text: locale === 'zh' ? '异常' : 'Degraded', status: 'danger' } }),
      ])
      container.replaceChildren(row)
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxStatusBadge = pickReactComponent(TuffexReact, 'TxStatusBadge')
      return React.createElement(
        'div',
        { className: 'tuff-fw-stage__row' },
        React.createElement(TxStatusBadge, { text: locale === 'zh' ? '运行正常' : 'Operational', status: 'success' }),
        React.createElement(TxStatusBadge, { text: locale === 'zh' ? '审阅中' : 'Reviewing', status: 'warning' }),
        React.createElement(TxStatusBadge, { text: locale === 'zh' ? '异常' : 'Degraded', status: 'danger' }),
      )
    },
  },

  'status-hint': {
    id: 'status-hint',
    wcTag: 'tx-status-hint',
    wcCode: locale => `<tx-status-hint text="${locale === 'zh' ? '已复制到剪贴板' : 'Copied to clipboard'}" tone="success"></tx-status-hint>`,
    reactCode: locale => `import { TxStatusHint } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function StatusHintDemo() {
  return (
    <TxStatusHint text="${locale === 'zh' ? '已复制到剪贴板' : 'Copied to clipboard'}" tone="success" />
  )
}`,
    mountWc: (container, locale) => {
      const row = createStageRow([
        createWcEl('tx-status-hint', { attrs: { text: locale === 'zh' ? '已复制到剪贴板' : 'Copied to clipboard', tone: 'success' } }),
      ])
      container.replaceChildren(row)
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxStatusHint = pickReactComponent(TuffexReact, 'TxStatusHint')
      return React.createElement(TxStatusHint, {
        text: locale === 'zh' ? '已复制到剪贴板' : 'Copied to clipboard',
        tone: 'success',
      })
    },
  },

  'dot-indicator': {
    id: 'dot-indicator',
    wcTag: 'tx-dot-indicator',
    wcCode: locale => `<div class="tuff-demo-row">
  <tx-dot-indicator color="var(--tx-color-success)" label="${locale === 'zh' ? '已连接' : 'Connected'}"></tx-dot-indicator>
  <tx-dot-indicator color="var(--tx-color-warning)" label="${locale === 'zh' ? '同步中' : 'Syncing'}"></tx-dot-indicator>
  <tx-dot-indicator color="var(--tx-color-danger)" label="${locale === 'zh' ? '离线' : 'Offline'}"></tx-dot-indicator>
</div>`,
    reactCode: locale => `import { TxDotIndicator } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function DotIndicatorDemo() {
  return (
    <div className="tuff-demo-row">
      <TxDotIndicator color="var(--tx-color-success)" label="${locale === 'zh' ? '已连接' : 'Connected'}" />
      <TxDotIndicator color="var(--tx-color-warning)" label="${locale === 'zh' ? '同步中' : 'Syncing'}" />
      <TxDotIndicator color="var(--tx-color-danger)" label="${locale === 'zh' ? '离线' : 'Offline'}" />
    </div>
  )
}`,
    mountWc: (container, locale) => {
      const row = createStageRow([
        createWcEl('tx-dot-indicator', { attrs: { color: 'var(--tx-color-success)', label: locale === 'zh' ? '已连接' : 'Connected' } }),
        createWcEl('tx-dot-indicator', { attrs: { color: 'var(--tx-color-warning)', label: locale === 'zh' ? '同步中' : 'Syncing' } }),
        createWcEl('tx-dot-indicator', { attrs: { color: 'var(--tx-color-danger)', label: locale === 'zh' ? '离线' : 'Offline' } }),
      ])
      container.replaceChildren(row)
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxDotIndicator = pickReactComponent(TuffexReact, 'TxDotIndicator')
      return React.createElement(
        'div',
        { className: 'tuff-fw-stage__row' },
        React.createElement(TxDotIndicator, { color: 'var(--tx-color-success)', label: locale === 'zh' ? '已连接' : 'Connected' }),
        React.createElement(TxDotIndicator, { color: 'var(--tx-color-warning)', label: locale === 'zh' ? '同步中' : 'Syncing' }),
        React.createElement(TxDotIndicator, { color: 'var(--tx-color-danger)', label: locale === 'zh' ? '离线' : 'Offline' }),
      )
    },
  },

  empty: {
    id: 'empty',
    wcTag: 'tx-empty',
    wcCode: locale => `<tx-empty title="${locale === 'zh' ? '暂无匹配记录' : 'No matching items'}" description="${locale === 'zh' ? '尝试调整筛选条件后再试。' : 'Try adjusting your filters.'}"></tx-empty>`,
    reactCode: locale => `import { TxEmpty } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function EmptyDemo() {
  return (
    <TxEmpty
      title="${locale === 'zh' ? '暂无匹配记录' : 'No matching items'}"
      description="${locale === 'zh' ? '尝试调整筛选条件后再试。' : 'Try adjusting your filters.'}"
    />
  )
}`,
    mountWc: (container, locale) => {
      container.replaceChildren(createWcEl('tx-empty', {
        attrs: {
          title: locale === 'zh' ? '暂无匹配记录' : 'No matching items',
          description: locale === 'zh' ? '尝试调整筛选条件后再试。' : 'Try adjusting your filters.',
        },
      }))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxEmpty = pickReactComponent(TuffexReact, 'TxEmpty')
      return React.createElement(TxEmpty, {
        title: locale === 'zh' ? '暂无匹配记录' : 'No matching items',
        description: locale === 'zh' ? '尝试调整筛选条件后再试。' : 'Try adjusting your filters.',
      })
    },
  },

  'stat-card': {
    id: 'stat-card',
    wcTag: 'tx-stat-card',
    wcCode: locale => `<tx-stat-card
  label="${locale === 'zh' ? '活跃插件' : 'Active plugins'}"
  value="1284"
  meta="+14.2%"
></tx-stat-card>`,
    reactCode: locale => `import { TxStatCard } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function StatCardDemo() {
  return (
    <TxStatCard
      label="${locale === 'zh' ? '活跃插件' : 'Active plugins'}"
      value={1284}
      insight={{ from: 1124, to: 1284 }}
    />
  )
}`,
    mountWc: (container, locale) => {
      container.replaceChildren(createStageRow([
        createWcEl('tx-stat-card', {
          attrs: {
            label: locale === 'zh' ? '活跃插件' : 'Active plugins',
            value: 1284,
            meta: '+14.2%',
          },
        }),
      ], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxStatCard = pickReactComponent(TuffexReact, 'TxStatCard')
      return React.createElement(TxStatCard, {
        label: locale === 'zh' ? '活跃插件' : 'Active plugins',
        value: 1284,
        insight: { from: 1124, to: 1284 },
      })
    },
  },

  input: {
    id: 'input',
    wcTag: 'tx-input',
    wcCode: locale => `<tx-input placeholder="${locale === 'zh' ? '输入插件名称…' : 'Enter plugin name...'}" clearable></tx-input>`,
    reactCode: locale => `import { useState } from 'react'
import { TxInput } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function InputDemo() {
  const [value, setValue] = useState('')
  return (
    <TxInput
      value={value}
      onChange={setValue}
      placeholder="${locale === 'zh' ? '输入插件名称…' : 'Enter plugin name...'}"
      clearable
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '当前值: (空)' : 'Value: (empty)')
      const input = createWcEl('tx-input', {
        attrs: {
          placeholder: locale === 'zh' ? '输入插件名称…' : 'Enter plugin name...',
          clearable: true,
        },
        events: {
          'update:model-value': (event: Event) => {
            const detail = (event as CustomEvent).detail
            const next = String(Array.isArray(detail) ? detail[0] ?? '' : detail ?? '')
            readout.textContent = next
              ? (locale === 'zh' ? `当前值: ${next}` : `Value: ${next}`)
              : (locale === 'zh' ? '当前值: (空)' : 'Value: (empty)')
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([input, readout], true))
      return () => {
        for (const dispose of disposers)
          dispose()
      }
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxInput = pickReactComponent(TuffexReact, 'TxInput')
      function Demo() {
        const [value, setValue] = React.useState('')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxInput, {
            value,
            onChange: (next: string) => setValue(typeof next === 'string' ? next : ''),
            placeholder: locale === 'zh' ? '输入插件名称…' : 'Enter plugin name...',
            clearable: true,
          }),
          React.createElement(
            'span',
            { className: 'tuff-fw-stage__readout' },
            value ? (locale === 'zh' ? `当前值: ${value}` : `Value: ${value}`) : (locale === 'zh' ? '当前值: (空)' : 'Value: (empty)'),
          ),
        )
      }
      return React.createElement(Demo)
    },
  },

  textarea: {
    id: 'textarea',
    wcTag: 'tx-textarea',
    wcCode: locale => `<tx-textarea rows="3" placeholder="${locale === 'zh' ? '填写发布说明…' : 'Write release notes...'}"></tx-textarea>`,
    reactCode: locale => `import { useState } from 'react'
import { TxTextarea } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function TextareaDemo() {
  const [notes, setNotes] = useState('')
  return (
    <TxTextarea
      rows={3}
      value={notes}
      onChange={setNotes}
      placeholder="${locale === 'zh' ? '填写发布说明…' : 'Write release notes...'}"
    />
  )
}`,
    mountWc: (container, locale) => {
      container.replaceChildren(createStageRow([
        createWcEl('tx-textarea', {
          attrs: {
            rows: 3,
            placeholder: locale === 'zh' ? '填写发布说明…' : 'Write release notes...',
          },
        }),
      ], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxTextarea = pickReactComponent(TuffexReact, 'TxTextarea')
      function Demo() {
        const [notes, setNotes] = React.useState('')
        return React.createElement(TxTextarea, {
          rows: 3,
          value: notes,
          onChange: (next: string) => setNotes(typeof next === 'string' ? next : ''),
          placeholder: locale === 'zh' ? '填写发布说明…' : 'Write release notes...',
        })
      }
      return React.createElement(Demo)
    },
  },

  checkbox: {
    id: 'checkbox',
    wcTag: 'tx-checkbox',
    wcCode: locale => `<tx-checkbox model-value="true">${locale === 'zh' ? '自动同步设置' : 'Auto-sync settings'}</tx-checkbox>`,
    reactCode: locale => `import { useState } from 'react'
import { TxCheckbox } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function CheckboxDemo() {
  const [checked, setChecked] = useState(true)
  return (
    <TxCheckbox checked={checked} onChange={setChecked}>
      ${locale === 'zh' ? '自动同步设置' : 'Auto-sync settings'}
    </TxCheckbox>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '状态: 已勾选' : 'Checked: true')
      const checkbox = createWcEl('tx-checkbox', {
        attrs: { 'model-value': 'true' },
        props: { modelValue: true },
        text: locale === 'zh' ? '自动同步设置' : 'Auto-sync settings',
        events: {
          'update:model-value': (event: Event) => {
            const detail = (event as CustomEvent).detail
            const next = Array.isArray(detail) ? Boolean(detail[0]) : Boolean(detail)
            readout.textContent = locale === 'zh' ? `状态: ${next ? '已勾选' : '未勾选'}` : `Checked: ${String(next)}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([checkbox, readout]))
      return () => {
        for (const dispose of disposers)
          dispose()
      }
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxCheckbox = pickReactComponent(TuffexReact, 'TxCheckbox')
      function Demo() {
        const [checked, setChecked] = React.useState(true)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__row' },
          React.createElement(TxCheckbox, { checked, onChange: (v: boolean) => setChecked(Boolean(v)) }, locale === 'zh' ? '自动同步设置' : 'Auto-sync settings'),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `状态: ${checked ? '已勾选' : '未勾选'}` : `Checked: ${String(checked)}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  radio: {
    id: 'radio',
    wcTag: 'tx-radio-group',
    wcCode: locale => `<tx-radio-group model-value="stable">
  <tx-radio value="stable">${locale === 'zh' ? '稳定版' : 'Stable'}</tx-radio>
  <tx-radio value="beta">${locale === 'zh' ? '测试版' : 'Beta'}</tx-radio>
  <tx-radio value="canary">${locale === 'zh' ? '金丝雀' : 'Canary'}</tx-radio>
</tx-radio-group>`,
    reactCode: locale => `import { useState } from 'react'
import { TxRadio, TxRadioGroup } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function RadioDemo() {
  const [channel, setChannel] = useState('stable')
  return (
    <TxRadioGroup value={channel} onChange={setChannel}>
      <TxRadio value="stable">${locale === 'zh' ? '稳定版' : 'Stable'}</TxRadio>
      <TxRadio value="beta">${locale === 'zh' ? '测试版' : 'Beta'}</TxRadio>
      <TxRadio value="canary">${locale === 'zh' ? '金丝雀' : 'Canary'}</TxRadio>
    </TxRadioGroup>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '通道: stable' : 'Channel: stable')
      const group = createWcEl('tx-radio-group', {
        attrs: { 'model-value': 'stable' },
        props: { modelValue: 'stable' },
        children: [
          createWcEl('tx-radio', { attrs: { value: 'stable' }, text: locale === 'zh' ? '稳定版' : 'Stable' }),
          createWcEl('tx-radio', { attrs: { value: 'beta' }, text: locale === 'zh' ? '测试版' : 'Beta' }),
          createWcEl('tx-radio', { attrs: { value: 'canary' }, text: locale === 'zh' ? '金丝雀' : 'Canary' }),
        ],
        events: {
          'update:model-value': (event: Event) => {
            const detail = (event as CustomEvent).detail
            const next = String(Array.isArray(detail) ? detail[0] ?? '' : detail ?? '')
            readout.textContent = locale === 'zh' ? `通道: ${next}` : `Channel: ${next}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([group, readout], true))
      return () => {
        for (const dispose of disposers)
          dispose()
      }
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxRadioGroup = pickReactComponent(TuffexReact, 'TxRadioGroup')
      const TxRadio = pickReactComponent(TuffexReact, 'TxRadio')
      function Demo() {
        const [channel, setChannel] = React.useState('stable')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(
            TxRadioGroup,
            { value: channel, onChange: (val: string) => setChannel(String(val)) },
            React.createElement(TxRadio, { value: 'stable' }, locale === 'zh' ? '稳定版' : 'Stable'),
            React.createElement(TxRadio, { value: 'beta' }, locale === 'zh' ? '测试版' : 'Beta'),
            React.createElement(TxRadio, { value: 'canary' }, locale === 'zh' ? '金丝雀' : 'Canary'),
          ),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `通道: ${channel}` : `Channel: ${channel}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  slider: {
    id: 'slider',
    wcTag: 'tx-slider',
    wcCode: () => `<tx-slider model-value="62" min="0" max="100"></tx-slider>`,
    reactCode: () => `import { useState } from 'react'
import { TxSlider } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function SliderDemo() {
  const [value, setValue] = useState(62)
  return (
    <div className="tuff-fw-stage__stack">
      <TxSlider value={value} min={0} max={100} onChange={setValue} />
      <span>{value}%</span>
    </div>
  )
}`,
    mountWc: (container) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout('62%')
      const slider = createWcEl('tx-slider', {
        attrs: { 'model-value': 62, min: 0, max: 100 },
        props: { modelValue: 62 },
        events: {
          'update:model-value': (event: Event) => {
            const detail = (event as CustomEvent).detail
            const next = Array.isArray(detail) ? detail[0] : detail
            readout.textContent = `${next ?? 62}%`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([slider, readout], true))
      return () => {
        for (const dispose of disposers)
          dispose()
      }
    },
    renderReact: (React, TuffexReact) => {
      const TxSlider = pickReactComponent(TuffexReact, 'TxSlider')
      function Demo() {
        const [value, setValue] = React.useState(62)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxSlider, { value, min: 0, max: 100, onChange: (val: number) => setValue(Number(val)) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, `${value}%`),
        )
      }
      return React.createElement(Demo)
    },
  },

  tabs: {
    id: 'tabs',
    wcTag: 'tx-tabs',
    wcCode: locale => `<tx-tabs model-value="overview">
  <tx-tab-item name="overview" label="${locale === 'zh' ? '概览' : 'Overview'}">${locale === 'zh' ? '概览面板内容' : 'Overview panel content'}</tx-tab-item>
  <tx-tab-item name="tokens" label="${locale === 'zh' ? '设计令牌' : 'Tokens'}">${locale === 'zh' ? '共享 --tx-* 设计令牌' : 'Shared --tx-* design tokens'}</tx-tab-item>
</tx-tabs>`,
    reactCode: locale => `import { useState } from 'react'
import { TxTabItem, TxTabs } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function TabsDemo() {
  const [active, setActive] = useState('overview')
  return (
    <TxTabs value={active} onChange={setActive}>
      <TxTabItem name="overview" label="${locale === 'zh' ? '概览' : 'Overview'}">
        ${locale === 'zh' ? '概览面板内容' : 'Overview panel content'}
      </TxTabItem>
      <TxTabItem name="tokens" label="${locale === 'zh' ? '设计令牌' : 'Tokens'}">
        ${locale === 'zh' ? '共享 --tx-* 设计令牌' : 'Shared --tx-* design tokens'}
      </TxTabItem>
    </TxTabs>
  )
}`,
    mountWc: (container, locale) => {
      const tabs = createWcEl('tx-tabs', {
        attrs: { 'model-value': 'overview' },
        props: { modelValue: 'overview' },
        children: [
          createWcEl('tx-tab-item', { attrs: { name: 'overview', label: locale === 'zh' ? '概览' : 'Overview' }, text: locale === 'zh' ? '概览面板内容' : 'Overview panel content' }),
          createWcEl('tx-tab-item', { attrs: { name: 'tokens', label: locale === 'zh' ? '设计令牌' : 'Tokens' }, text: locale === 'zh' ? '共享 --tx-* 设计令牌' : 'Shared --tx-* design tokens' }),
        ],
      })
      container.replaceChildren(createStageRow([tabs], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxTabs = pickReactComponent(TuffexReact, 'TxTabs')
      const TxTabItem = pickReactComponent(TuffexReact, 'TxTabItem')
      function Demo() {
        const [active, setActive] = React.useState('overview')
        return React.createElement(
          TxTabs,
          { value: active, onChange: (val: string) => setActive(String(val)) },
          React.createElement(TxTabItem, { name: 'overview', label: locale === 'zh' ? '概览' : 'Overview' }, locale === 'zh' ? '概览面板内容' : 'Overview panel content'),
          React.createElement(TxTabItem, { name: 'tokens', label: locale === 'zh' ? '设计令牌' : 'Tokens' }, locale === 'zh' ? '共享 --tx-* 设计令牌' : 'Shared --tx-* design tokens'),
        )
      }
      return React.createElement(Demo)
    },
  },

  collapse: {
    id: 'collapse',
    wcTag: 'tx-collapse',
    wcCode: locale => `<tx-collapse>
  <tx-collapse-item name="about" title="${locale === 'zh' ? '什么是 TuffEx？' : 'What is TuffEx?'}">
    ${locale === 'zh' ? '服务 Talex Touch 生态的跨框架设计系统。' : 'Multi-framework design system for the Talex Touch ecosystem.'}
  </tx-collapse-item>
</tx-collapse>`,
    reactCode: locale => `import { TxCollapse, TxCollapseItem } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function CollapseDemo() {
  return (
    <TxCollapse defaultValue={['about']}>
      <TxCollapseItem name="about" title="${locale === 'zh' ? '什么是 TuffEx？' : 'What is TuffEx?'}">
        ${locale === 'zh' ? '服务 Talex Touch 生态的跨框架设计系统。' : 'Multi-framework design system for the Talex Touch ecosystem.'}
      </TxCollapseItem>
    </TxCollapse>
  )
}`,
    mountWc: (container, locale) => {
      const collapse = createWcEl('tx-collapse', {
        children: [
          createWcEl('tx-collapse-item', {
            attrs: { name: 'about', title: locale === 'zh' ? '什么是 TuffEx？' : 'What is TuffEx?' },
            text: locale === 'zh'
              ? '服务 Talex Touch 生态的跨框架设计系统。'
              : 'Multi-framework design system for the Talex Touch ecosystem.',
          }),
        ],
      })
      container.replaceChildren(createStageRow([collapse], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxCollapse = pickReactComponent(TuffexReact, 'TxCollapse')
      const TxCollapseItem = pickReactComponent(TuffexReact, 'TxCollapseItem')
      return React.createElement(
        TxCollapse,
        { defaultValue: ['about'] },
        React.createElement(
          TxCollapseItem,
          { name: 'about', title: locale === 'zh' ? '什么是 TuffEx？' : 'What is TuffEx?' },
          locale === 'zh'
            ? '服务 Talex Touch 生态的跨框架设计系统。'
            : 'Multi-framework design system for the Talex Touch ecosystem.',
        ),
      )
    },
  },

  tooltip: {
    id: 'tooltip',
    wcTag: 'tx-tooltip',
    wcCode: locale => `<tx-tooltip content="${locale === 'zh' ? '按 ⌘K 唤起指令中心' : 'Press ⌘K to open CoreBox'}">
  <tx-button variant="secondary">${locale === 'zh' ? '悬停查看提示' : 'Hover for tooltip'}</tx-button>
</tx-tooltip>`,
    reactCode: locale => `import { TxButton, TxTooltip } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function TooltipDemo() {
  return (
    <TxTooltip content="${locale === 'zh' ? '按 ⌘K 唤起指令中心' : 'Press ⌘K to open CoreBox'}">
      <TxButton variant="secondary">${locale === 'zh' ? '悬停查看提示' : 'Hover for tooltip'}</TxButton>
    </TxTooltip>
  )
}`,
    mountWc: (container, locale) => {
      const tip = createWcEl('tx-tooltip', {
        attrs: { content: locale === 'zh' ? '按 ⌘K 唤起指令中心' : 'Press ⌘K to open CoreBox' },
        children: [createWcEl('tx-button', { attrs: { variant: 'secondary' }, text: locale === 'zh' ? '悬停查看提示' : 'Hover for tooltip' })],
      })
      container.replaceChildren(createStageRow([tip]))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxTooltip = pickReactComponent(TuffexReact, 'TxTooltip')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      return React.createElement(
        TxTooltip,
        { content: locale === 'zh' ? '按 ⌘K 唤起指令中心' : 'Press ⌘K to open CoreBox' },
        React.createElement(TxButton, { variant: 'secondary' }, locale === 'zh' ? '悬停查看提示' : 'Hover for tooltip'),
      )
    },
  },

  popover: {
    id: 'popover',
    wcTag: 'tx-popover',
    wcCode: locale => `<tx-popover placement="bottom-start">
  <tx-button slot="reference" variant="secondary">${locale === 'zh' ? '打开弹出层' : 'Open popover'}</tx-button>
  <div>${locale === 'zh' ? '支持 Floating UI 智能定位与键盘关闭。' : 'Powered by Floating UI positioning and Escape dismiss.'}</div>
</tx-popover>`,
    reactCode: locale => `import { TxButton, TxPopover } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function PopoverDemo() {
  return (
    <TxPopover content="${locale === 'zh' ? '支持 Floating UI 智能定位与键盘关闭。' : 'Powered by Floating UI positioning and Escape dismiss.'}">
      <TxButton variant="secondary">${locale === 'zh' ? '打开弹出层' : 'Open popover'}</TxButton>
    </TxPopover>
  )
}`,
    mountWc: (container, locale) => {
      const trigger = createWcEl('tx-button', { attrs: { slot: 'reference', variant: 'secondary' }, text: locale === 'zh' ? '打开弹出层' : 'Open popover' })
      const body = document.createElement('div')
      body.textContent = locale === 'zh'
        ? '支持 Floating UI 智能定位与键盘关闭。'
        : 'Powered by Floating UI positioning and Escape dismiss.'
      const pop = createWcEl('tx-popover', { attrs: { placement: 'bottom-start' }, children: [trigger, body] })
      container.replaceChildren(createStageRow([pop]))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxPopover = pickReactComponent(TuffexReact, 'TxPopover')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      return React.createElement(
        TxPopover,
        {
          content: locale === 'zh'
            ? '支持 Floating UI 智能定位与键盘关闭。'
            : 'Powered by Floating UI positioning and Escape dismiss.',
        },
        React.createElement(TxButton, { variant: 'secondary' }, locale === 'zh' ? '打开弹出层' : 'Open popover'),
      )
    },
  },

  dialog: {
    id: 'dialog',
    wcTag: 'tx-dialog',
    wcCode: locale => `<tx-button id="open-dialog" variant="primary">${locale === 'zh' ? '打开对话框' : 'Open dialog'}</tx-button>
<tx-dialog title="${locale === 'zh' ? '确认发布' : 'Confirm release'}">
  ${locale === 'zh' ? '此操作将向所有订阅通道推送更新。' : 'This publishes the update to all subscribed channels.'}
</tx-dialog>`,
    reactCode: locale => `import { useState } from 'react'
import { TxButton, TxDialog } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function DialogDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TxButton variant="primary" onClick={() => setOpen(true)}>
        ${locale === 'zh' ? '打开对话框' : 'Open dialog'}
      </TxButton>
      <TxDialog
        open={open}
        title="${locale === 'zh' ? '确认发布' : 'Confirm release'}"
        onOpenChange={setOpen}
        onClose={() => setOpen(false)}
      >
        ${locale === 'zh' ? '此操作将向所有订阅通道推送更新。' : 'This publishes the update to all subscribed channels.'}
      </TxDialog>
    </>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const dialog = createWcEl('tx-dialog', {
        attrs: { title: locale === 'zh' ? '确认发布' : 'Confirm release' },
        text: locale === 'zh'
          ? '此操作将向所有订阅通道推送更新。'
          : 'This publishes the update to all subscribed channels.',
        events: {
          close: () => {
            (dialog as unknown as Record<string, unknown>).open = false
            dialog.removeAttribute('open')
          },
        },
      }, disposers)
      const trigger = createWcEl('tx-button', {
        attrs: { variant: 'primary' },
        text: locale === 'zh' ? '打开对话框' : 'Open dialog',
        events: {
          click: () => {
            (dialog as unknown as Record<string, unknown>).open = true
            dialog.setAttribute('open', '')
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([trigger, dialog]))
      return () => {
        for (const dispose of disposers)
          dispose()
      }
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxDialog = pickReactComponent(TuffexReact, 'TxDialog')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      function Demo() {
        const [open, setOpen] = React.useState(false)
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(TxButton, { variant: 'primary', onClick: () => setOpen(true) }, locale === 'zh' ? '打开对话框' : 'Open dialog'),
          React.createElement(
            TxDialog,
            {
              open,
              title: locale === 'zh' ? '确认发布' : 'Confirm release',
              onOpenChange: (next: boolean) => setOpen(Boolean(next)),
              onClose: () => setOpen(false),
            },
            locale === 'zh' ? '此操作将向所有订阅通道推送更新。' : 'This publishes the update to all subscribed channels.',
          ),
        )
      }
      return React.createElement(Demo)
    },
  },

  drawer: {
    id: 'drawer',
    wcTag: 'tx-drawer',
    wcCode: locale => `<tx-button id="open-drawer" variant="secondary">${locale === 'zh' ? '打开抽屉' : 'Open drawer'}</tx-button>
<tx-drawer title="${locale === 'zh' ? '组件配置' : 'Component settings'}">
  ${locale === 'zh' ? '侧滑抽屉承载高密度配置项。' : 'Slide-over drawer for high-density configuration.'}
</tx-drawer>`,
    reactCode: locale => `import { useState } from 'react'
import { TxButton, TxDrawer } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function DrawerDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TxButton variant="secondary" onClick={() => setOpen(true)}>
        ${locale === 'zh' ? '打开抽屉' : 'Open drawer'}
      </TxButton>
      <TxDrawer
        open={open}
        title="${locale === 'zh' ? '组件配置' : 'Component settings'}"
        onOpenChange={setOpen}
        onClose={() => setOpen(false)}
      >
        ${locale === 'zh' ? '侧滑抽屉承载高密度配置项。' : 'Slide-over drawer for high-density configuration.'}
      </TxDrawer>
    </>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const closeDrawer = () => {
        const el = drawer as unknown as Record<string, unknown>
        el.open = false
        el.visible = false
        drawer.removeAttribute('open')
        drawer.removeAttribute('visible')
      }
      const drawer = createWcEl('tx-drawer', {
        attrs: { title: locale === 'zh' ? '组件配置' : 'Component settings', direction: 'right' },
        text: locale === 'zh'
          ? '侧滑抽屉承载高密度配置项。'
          : 'Slide-over drawer for high-density configuration.',
        events: {
          close: closeDrawer,
          'update:visible': (event: Event) => {
            const detail = (event as CustomEvent).detail
            const next = Array.isArray(detail) ? Boolean(detail[0]) : Boolean(detail)
            if (!next)
              closeDrawer()
          },
        },
      }, disposers)
      const trigger = createWcEl('tx-button', {
        attrs: { variant: 'secondary' },
        text: locale === 'zh' ? '打开抽屉' : 'Open drawer',
        events: {
          click: () => {
            const el = drawer as unknown as Record<string, unknown>
            el.open = true
            el.visible = true
            drawer.setAttribute('open', '')
            drawer.setAttribute('visible', '')
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([trigger, drawer]))
      return () => {
        for (const dispose of disposers)
          dispose()
      }
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxDrawer = pickReactComponent(TuffexReact, 'TxDrawer')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      function Demo() {
        const [open, setOpen] = React.useState(false)
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(TxButton, { variant: 'secondary', onClick: () => setOpen(true) }, locale === 'zh' ? '打开抽屉' : 'Open drawer'),
          React.createElement(
            TxDrawer,
            {
              open,
              title: locale === 'zh' ? '组件配置' : 'Component settings',
              onOpenChange: (next: boolean) => setOpen(Boolean(next)),
              onClose: () => setOpen(false),
            },
            locale === 'zh' ? '侧滑抽屉承载高密度配置项。' : 'Slide-over drawer for high-density configuration.',
          ),
        )
      }
      return React.createElement(Demo)
    },
  },

  select: {
    id: 'select',
    wcTag: 'tx-select',
    wcCode: locale => `<tx-select
  placeholder="${locale === 'zh' ? '选择发布通道' : 'Select release channel'}"
  options='[{"value":"stable","label":"${locale === 'zh' ? '稳定版' : 'Stable'}"},{"value":"beta","label":"${locale === 'zh' ? '测试版' : 'Beta'}"}]'
></tx-select>`,
    reactCode: locale => `import { useState } from 'react'
import { TxSelect, TxSelectItem } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function SelectDemo() {
  const [channel, setChannel] = useState('stable')
  return (
    <TxSelect value={channel} onChange={setChannel} placeholder="${locale === 'zh' ? '选择发布通道' : 'Select release channel'}">
      <TxSelectItem value="stable" label="${locale === 'zh' ? '稳定版' : 'Stable'}" />
      <TxSelectItem value="beta" label="${locale === 'zh' ? '测试版' : 'Beta'}" />
      <TxSelectItem value="snapshot" label="${locale === 'zh' ? '快照版' : 'Snapshot'}" />
    </TxSelect>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const options = [
        { value: 'stable', label: locale === 'zh' ? '稳定版' : 'Stable' },
        { value: 'beta', label: locale === 'zh' ? '测试版' : 'Beta' },
        { value: 'snapshot', label: locale === 'zh' ? '快照版' : 'Snapshot' },
      ]
      const readout = createStatusReadout(locale === 'zh' ? '已选: stable' : 'Selected: stable')
      const select = createWcEl('tx-select', {
        attrs: {
          placeholder: locale === 'zh' ? '选择发布通道' : 'Select release channel',
          'model-value': 'stable',
          options: JSON.stringify(options),
        },
        props: { modelValue: 'stable', options },
        events: {
          'update:model-value': (event: Event) => {
            const detail = (event as CustomEvent).detail
            const next = String(Array.isArray(detail) ? detail[0] ?? '' : detail ?? '')
            readout.textContent = locale === 'zh' ? `已选: ${next}` : `Selected: ${next}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([select, readout], true))
      return () => {
        for (const dispose of disposers)
          dispose()
      }
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxSelect = pickReactComponent(TuffexReact, 'TxSelect')
      const TxSelectItem = pickReactComponent(TuffexReact, 'TxSelectItem')
      function Demo() {
        const [channel, setChannel] = React.useState('stable')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(
            TxSelect,
            {
              value: channel,
              onChange: (val: string) => setChannel(String(val)),
              placeholder: locale === 'zh' ? '选择发布通道' : 'Select release channel',
            },
            React.createElement(TxSelectItem, { value: 'stable', label: locale === 'zh' ? '稳定版' : 'Stable' }),
            React.createElement(TxSelectItem, { value: 'beta', label: locale === 'zh' ? '测试版' : 'Beta' }),
            React.createElement(TxSelectItem, { value: 'snapshot', label: locale === 'zh' ? '快照版' : 'Snapshot' }),
          ),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `已选: ${channel}` : `Selected: ${channel}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'stream-text': {
    id: 'stream-text',
    wcTag: 'tx-stream-text',
    wcCode: locale => `<tx-stream-text
  content="${locale === 'zh' ? 'TuffEx 在 Vue、React 与 Web Components 之间共享同一套无抖动流式节拍器。' : 'TuffEx shares one anti-jitter streaming pacer across Vue, React, and Web Components.'}"
  reveal="aurora"
  appear
></tx-stream-text>`,
    reactCode: locale => `import { TxStreamText } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function StreamTextDemo() {
  return (
    <TxStreamText
      content="${locale === 'zh' ? 'TuffEx 在 Vue、React 与 Web Components 之间共享同一套无抖动流式节拍器。' : 'TuffEx shares one anti-jitter streaming pacer across Vue, React, and Web Components.'}"
      reveal="aurora"
      appear
    />
  )
}`,
    mountWc: (container, locale) => {
      const content = locale === 'zh'
        ? 'TuffEx 在 Vue、React 与 Web Components 之间共享同一套无抖动流式节拍器。'
        : 'TuffEx shares one anti-jitter streaming pacer across Vue, React, and Web Components.'
      const stream = createWcEl('tx-stream-text', {
        attrs: { content, reveal: 'aurora', appear: true },
        props: { content, reveal: 'aurora', appear: true },
      })
      container.replaceChildren(createStageRow([stream], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxStreamText = pickReactComponent(TuffexReact, 'TxStreamText')
      const content = locale === 'zh'
        ? 'TuffEx 在 Vue、React 与 Web Components 之间共享同一套无抖动流式节拍器。'
        : 'TuffEx shares one anti-jitter streaming pacer across Vue, React, and Web Components.'
      return React.createElement(TxStreamText, { content, reveal: 'aurora', appear: true })
    },
  },

  'markdown-view': {
    id: 'markdown-view',
    wcTag: 'tx-markdown-view',
    wcCode: locale => `<tx-markdown-view
  content="${locale === 'zh' ? '#### 快速开始\\n安装 **TuffEx**，跨框架共享一致的 Markdown 排版。' : '#### Getting Started\\nInstall **TuffEx** for consistent Markdown typography across frameworks.'}"
></tx-markdown-view>`,
    reactCode: locale => `import { TxMarkdownView } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

const doc = \`${locale === 'zh' ? '#### 快速开始\n\n安装 **TuffEx**，跨框架共享一致的 Markdown 排版。\n\n- 支持 `Vue 3` / `React` / `Web Components`' : '#### Getting Started\n\nInstall **TuffEx** for consistent Markdown typography across frameworks.\n\n- Works across `Vue 3`, `React`, and `Web Components`'}\`

export function MarkdownViewDemo() {
  return <TxMarkdownView content={doc} />
}`,
    mountWc: (container, locale) => {
      const content = locale === 'zh'
        ? '#### 快速开始\n\n安装 **TuffEx**，跨框架共享一致的 Markdown 排版。\n\n- 支持 `Vue 3` / `React` / `Web Components`'
        : '#### Getting Started\n\nInstall **TuffEx** for consistent Markdown typography across frameworks.\n\n- Works across `Vue 3`, `React`, and `Web Components`'
      const md = createWcEl('tx-markdown-view', {
        attrs: { content },
        props: { content },
      })
      container.replaceChildren(createStageRow([md], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxMarkdownView = pickReactComponent(TuffexReact, 'TxMarkdownView')
      const content = locale === 'zh'
        ? '#### 快速开始\n\n安装 **TuffEx**，跨框架共享一致的 Markdown 排版。\n\n- 支持 `Vue 3` / `React` / `Web Components`'
        : '#### Getting Started\n\nInstall **TuffEx** for consistent Markdown typography across frameworks.\n\n- Works across `Vue 3`, `React`, and `Web Components`'
      return React.createElement(TxMarkdownView, { content })
    },
  },
}

export function getFrameworkShowcase(slug: string | null | undefined): FrameworkShowcaseDefinition | null {
  if (!slug)
    return null
  const normalized = slug.trim().toLowerCase() as Phase1ReadyComponentId
  return TUFFEX_FRAMEWORK_SHOWCASES[normalized] ?? null
}
