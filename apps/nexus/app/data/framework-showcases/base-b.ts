import type { FrameworkShowcaseDefinition } from './types'
import {
  createStageRow,
  createStatusReadout,
  createWcEl,
  DEMO_BOX_STYLE,
  disposeAll,
  pickReactComponent,
  unpackDetail,
} from './types'

export type BaseBShowcaseId
  = | 'number-input'
    | 'search-input'
    | 'sensitive-input'
    | 'tag-input'
    | 'scrub-field'
    | 'segmented-slider'
    | 'rating'
    | 'filter-chips'
    | 'flat-radio'
    | 'flat-select'
    | 'search-select'
    | 'cascader'
    | 'tree'
    | 'tree-select'
    | 'date-picker'
    | 'picker'
    | 'form'
    | 'modal-form'
    | 'drawer-form'
    | 'steps-form'
    | 'context-menu'
    | 'dropdown-menu'
    | 'flat-dropdown'
    | 'selection-actions'
    | 'data-table'
    | 'descriptions'
    | 'sortable-list'
    | 'transfer'
    | 'file-uploader'
    | 'image-uploader'
    | 'image-gallery'
    | 'image-preview'
    | 'icon-picker'

function makeInlineSvgDataUri(title: string, colorA: string, colorB: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${colorA}"/><stop offset="100%" stop-color="${colorB}"/></linearGradient></defs><rect width="320" height="180" rx="16" fill="url(#g)"/><text x="24" y="100" fill="#ffffff" font-family="system-ui,sans-serif" font-size="20" font-weight="600">${title}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const GALLERY_IMG_A = makeInlineSvgDataUri('TuffEx Surface', '#3b82f6', '#6366f1')
const GALLERY_IMG_B = makeInlineSvgDataUri('Token Palette', '#10b981', '#0ea5e9')
const GALLERY_IMG_C = makeInlineSvgDataUri('Motion Curve', '#f59e0b', '#ec4899')

export const BASE_B_FRAMEWORK_SHOWCASES: Readonly<Record<BaseBShowcaseId, FrameworkShowcaseDefinition>> = {
  'number-input': {
    id: 'number-input',
    wcTag: 'tx-number-input',
    wcCode: () => `<tx-number-input model-value="42" min="0" max="100" step="2" controls></tx-number-input>`,
    reactCode: () => `import { useState } from 'react'
import { TxNumberInput } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function NumberInputDemo() {
  const [val, setVal] = useState<number | null>(42)
  return <TxNumberInput value={val} min={0} max={100} step={2} controls onChange={setVal} />
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '数值: 42' : 'Value: 42')
      const el = createWcEl('tx-number-input', {
        attrs: { 'model-value': 42, min: 0, max: 100, step: 2, controls: true },
        props: { modelValue: 42, min: 0, max: 100, step: 2, controls: true },
        events: {
          'update:model-value': (event: Event) => {
            const next = unpackDetail(event)
            readout.textContent = locale === 'zh' ? `数值: ${next ?? '—'}` : `Value: ${next ?? '—'}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout]))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxNumberInput = pickReactComponent(TuffexReact, 'TxNumberInput')
      function Demo() {
        const [val, setVal] = React.useState<number | null>(42)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__row' },
          React.createElement(TxNumberInput, { value: val, min: 0, max: 100, step: 2, controls: true, onChange: (v: number | null) => setVal(v) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `数值: ${val ?? '—'}` : `Value: ${val ?? '—'}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'search-input': {
    id: 'search-input',
    wcTag: 'tx-search-input',
    wcCode: locale => `<tx-search-input placeholder="${locale === 'zh' ? '搜索组件或令牌…' : 'Search components or tokens...'}" clearable></tx-search-input>`,
    reactCode: locale => `import { useState } from 'react'
import { TxSearchInput } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function SearchInputDemo() {
  const [query, setQuery] = useState('')
  return <TxSearchInput value={query} onChange={setQuery} placeholder="${locale === 'zh' ? '搜索组件或令牌…' : 'Search components or tokens...'}" clearable />
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '搜索词: (空)' : 'Query: (empty)')
      const el = createWcEl('tx-search-input', {
        attrs: { placeholder: locale === 'zh' ? '搜索组件或令牌…' : 'Search components or tokens...', clearable: true },
        events: {
          'update:model-value': (event: Event) => {
            const q = String(unpackDetail(event) ?? '')
            readout.textContent = q ? (locale === 'zh' ? `搜索词: ${q}` : `Query: ${q}`) : (locale === 'zh' ? '搜索词: (空)' : 'Query: (empty)')
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxSearchInput = pickReactComponent(TuffexReact, 'TxSearchInput')
      function Demo() {
        const [query, setQuery] = React.useState('')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxSearchInput, { value: query, onChange: (v: string) => setQuery(String(v ?? '')), placeholder: locale === 'zh' ? '搜索组件或令牌…' : 'Search components or tokens...', clearable: true }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, query ? (locale === 'zh' ? `搜索词: ${query}` : `Query: ${query}`) : (locale === 'zh' ? '搜索词: (空)' : 'Query: (empty)')),
        )
      }
      return React.createElement(Demo)
    },
  },

  'sensitive-input': {
    id: 'sensitive-input',
    wcTag: 'tx-sensitive-input',
    wcCode: locale => `<tx-sensitive-input model-value="tuff_live_9x8k2m4p" label="${locale === 'zh' ? 'API 密钥' : 'API Key'}" copyable></tx-sensitive-input>`,
    reactCode: locale => `import { useState } from 'react'
import { TxSensitiveInput } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function SensitiveInputDemo() {
  const [secret, setSecret] = useState('tuff_live_9x8k2m4p')
  return <TxSensitiveInput value={secret} onChange={setSecret} label="${locale === 'zh' ? 'API 密钥' : 'API Key'}" copyable />
}`,
    mountWc: (container, locale) => {
      const el = createWcEl('tx-sensitive-input', {
        attrs: { 'model-value': 'tuff_live_9x8k2m4p', label: locale === 'zh' ? 'API 密钥' : 'API Key', copyable: true },
        props: { modelValue: 'tuff_live_9x8k2m4p', copyable: true },
      })
      container.replaceChildren(createStageRow([el], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxSensitiveInput = pickReactComponent(TuffexReact, 'TxSensitiveInput')
      function Demo() {
        const [secret, setSecret] = React.useState('tuff_live_9x8k2m4p')
        return React.createElement(TxSensitiveInput, { value: secret, onChange: (v: string) => setSecret(String(v ?? '')), label: locale === 'zh' ? 'API 密钥' : 'API Key', copyable: true })
      }
      return React.createElement(Demo)
    },
  },

  'tag-input': {
    id: 'tag-input',
    wcTag: 'tx-tag-input',
    wcCode: locale => `<tx-tag-input model-value='["vue","react","wc"]' placeholder="${locale === 'zh' ? '回车添加标签…' : 'Press Enter to add tag...'}" max="6"></tx-tag-input>`,
    reactCode: locale => `import { useState } from 'react'
import { TxTagInput } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function TagInputDemo() {
  const [tags, setTags] = useState(['vue', 'react', 'wc'])
  return <TxTagInput value={tags} onChange={setTags} placeholder="${locale === 'zh' ? '回车添加标签…' : 'Press Enter to add tag...'}" max={6} />
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const initial = ['vue', 'react', 'wc']
      const readout = createStatusReadout(locale === 'zh' ? '标签数: 3' : 'Tags: 3')
      const el = createWcEl('tx-tag-input', {
        attrs: { 'model-value': JSON.stringify(initial), placeholder: locale === 'zh' ? '回车添加标签…' : 'Press Enter to add tag...', max: 6 },
        props: { modelValue: initial, max: 6 },
        events: {
          'update:model-value': (event: Event) => {
            const list = unpackDetail<string[]>(event) ?? []
            readout.textContent = locale === 'zh' ? `标签数: ${list.length}` : `Tags: ${list.length}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxTagInput = pickReactComponent(TuffexReact, 'TxTagInput')
      function Demo() {
        const [tags, setTags] = React.useState(['vue', 'react', 'wc'])
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxTagInput, { value: tags, onChange: (v: string[]) => setTags(Array.isArray(v) ? v : []), placeholder: locale === 'zh' ? '回车添加标签…' : 'Press Enter to add tag...', max: 6 }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `标签数: ${tags.length}` : `Tags: ${tags.length}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'scrub-field': {
    id: 'scrub-field',
    wcTag: 'tx-scrub-field',
    wcCode: () => `<tx-scrub-field label="W" model-value="320" min="120" max="640" step="4" suffix="px"></tx-scrub-field>`,
    reactCode: () => `import { useState } from 'react'
import { TxScrubField } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ScrubFieldDemo() {
  const [width, setWidth] = useState(320)
  return <TxScrubField label="W" value={width} min={120} max={640} step={4} suffix="px" onChange={setWidth} />
}`,
    mountWc: (container) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout('320px')
      const el = createWcEl('tx-scrub-field', {
        attrs: { label: 'W', 'model-value': 320, min: 120, max: 640, step: 4, suffix: 'px' },
        props: { label: 'W', modelValue: 320, min: 120, max: 640, step: 4, suffix: 'px' },
        events: {
          'update:model-value': (event: Event) => {
            readout.textContent = `${unpackDetail(event) ?? 320}px`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout]))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact) => {
      const TxScrubField = pickReactComponent(TuffexReact, 'TxScrubField')
      function Demo() {
        const [width, setWidth] = React.useState(320)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__row' },
          React.createElement(TxScrubField, { label: 'W', value: width, min: 120, max: 640, step: 4, suffix: 'px', onChange: (v: number) => setWidth(Number(v)) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, `${width}px`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'segmented-slider': {
    id: 'segmented-slider',
    wcTag: 'tx-segmented-slider',
    wcCode: locale => `<tx-segmented-slider
  model-value="balanced"
  show-labels
  segments='${JSON.stringify([
    { value: 'low', label: locale === 'zh' ? '节能' : 'Low' },
    { value: 'balanced', label: locale === 'zh' ? '均衡' : 'Balanced' },
    { value: 'max', label: locale === 'zh' ? '性能' : 'Max' },
  ])}'
></tx-segmented-slider>`,
    reactCode: locale => `import { useState } from 'react'
import { TxSegmentedSlider } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function SegmentedSliderDemo() {
  const [mode, setMode] = useState<string | number>('balanced')
  return (
    <TxSegmentedSlider
      value={mode}
      showLabels
      onChange={setMode}
      segments={[
        { value: 'low', label: '${locale === 'zh' ? '节能' : 'Low'}' },
        { value: 'balanced', label: '${locale === 'zh' ? '均衡' : 'Balanced'}' },
        { value: 'max', label: '${locale === 'zh' ? '性能' : 'Max'}' },
      ]}
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const segments = [
        { value: 'low', label: locale === 'zh' ? '节能' : 'Low' },
        { value: 'balanced', label: locale === 'zh' ? '均衡' : 'Balanced' },
        { value: 'max', label: locale === 'zh' ? '性能' : 'Max' },
      ]
      const readout = createStatusReadout(locale === 'zh' ? '模式: balanced' : 'Mode: balanced')
      const el = createWcEl('tx-segmented-slider', {
        attrs: { 'model-value': 'balanced', 'show-labels': true, segments: JSON.stringify(segments) },
        props: { modelValue: 'balanced', showLabels: true, segments },
        events: {
          'update:model-value': (event: Event) => {
            const next = String(unpackDetail(event) ?? 'balanced')
            readout.textContent = locale === 'zh' ? `模式: ${next}` : `Mode: ${next}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxSegmentedSlider = pickReactComponent(TuffexReact, 'TxSegmentedSlider')
      const segments = [
        { value: 'low', label: locale === 'zh' ? '节能' : 'Low' },
        { value: 'balanced', label: locale === 'zh' ? '均衡' : 'Balanced' },
        { value: 'max', label: locale === 'zh' ? '性能' : 'Max' },
      ]
      function Demo() {
        const [mode, setMode] = React.useState<string | number>('balanced')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxSegmentedSlider, { value: mode, showLabels: true, segments, onChange: (v: string | number) => setMode(v) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `模式: ${mode}` : `Mode: ${mode}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  rating: {
    id: 'rating',
    wcTag: 'tx-rating',
    wcCode: () => `<tx-rating model-value="4" max-stars="5" show-text></tx-rating>`,
    reactCode: () => `import { useState } from 'react'
import { TxRating } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function RatingDemo() {
  const [score, setScore] = useState(4)
  return <TxRating value={score} maxStars={5} showText onChange={setScore} />
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '评分: 4 / 5' : 'Rating: 4 / 5')
      const el = createWcEl('tx-rating', {
        attrs: { 'model-value': 4, 'max-stars': 5, 'show-text': true },
        props: { modelValue: 4, maxStars: 5, showText: true },
        events: {
          'update:model-value': (event: Event) => {
            const next = Number(unpackDetail(event) ?? 4)
            readout.textContent = locale === 'zh' ? `评分: ${next} / 5` : `Rating: ${next} / 5`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout]))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxRating = pickReactComponent(TuffexReact, 'TxRating')
      function Demo() {
        const [score, setScore] = React.useState(4)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__row' },
          React.createElement(TxRating, { value: score, maxStars: 5, showText: true, onChange: (v: number) => setScore(Number(v)) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `评分: ${score} / 5` : `Rating: ${score} / 5`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'filter-chips': {
    id: 'filter-chips',
    wcTag: 'tx-filter-chips',
    wcCode: locale => `<tx-filter-chips
  model-value="base"
  items='${JSON.stringify([
    { value: 'all', label: locale === 'zh' ? '全部' : 'All', count: 193 },
    { value: 'base', label: locale === 'zh' ? '基础套件' : 'Basics', count: 99 },
    { value: 'ai', label: 'AI', count: 36 },
  ])}'
></tx-filter-chips>`,
    reactCode: locale => `import { useState } from 'react'
import { TxFilterChips } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function FilterChipsDemo() {
  const [filter, setFilter] = useState('base')
  return (
    <TxFilterChips
      value={filter}
      onChange={v => setFilter(String(v))}
      items={[
        { value: 'all', label: '${locale === 'zh' ? '全部' : 'All'}', count: 193 },
        { value: 'base', label: '${locale === 'zh' ? '基础套件' : 'Basics'}', count: 99 },
        { value: 'ai', label: 'AI', count: 36 },
      ]}
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const items = [
        { value: 'all', label: locale === 'zh' ? '全部' : 'All', count: 193 },
        { value: 'base', label: locale === 'zh' ? '基础套件' : 'Basics', count: 99 },
        { value: 'ai', label: 'AI', count: 36 },
      ]
      const readout = createStatusReadout(locale === 'zh' ? '筛选: base' : 'Filter: base')
      const el = createWcEl('tx-filter-chips', {
        attrs: { 'model-value': 'base', items: JSON.stringify(items) },
        props: { modelValue: 'base', items },
        events: {
          'update:model-value': (event: Event) => {
            const next = String(unpackDetail(event) ?? 'base')
            readout.textContent = locale === 'zh' ? `筛选: ${next}` : `Filter: ${next}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxFilterChips = pickReactComponent(TuffexReact, 'TxFilterChips')
      const items = [
        { value: 'all', label: locale === 'zh' ? '全部' : 'All', count: 193 },
        { value: 'base', label: locale === 'zh' ? '基础套件' : 'Basics', count: 99 },
        { value: 'ai', label: 'AI', count: 36 },
      ]
      function Demo() {
        const [filter, setFilter] = React.useState('base')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxFilterChips, { value: filter, items, onChange: (v: string | number) => setFilter(String(v)) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `筛选: ${filter}` : `Filter: ${filter}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'flat-radio': {
    id: 'flat-radio',
    wcTag: 'tx-flat-radio',
    wcCode: locale => `<tx-flat-radio model-value="system">
  <tx-flat-radio-item value="light" label="${locale === 'zh' ? '浅色' : 'Light'}"></tx-flat-radio-item>
  <tx-flat-radio-item value="system" label="${locale === 'zh' ? '跟随系统' : 'System'}"></tx-flat-radio-item>
  <tx-flat-radio-item value="dark" label="${locale === 'zh' ? '深色' : 'Dark'}"></tx-flat-radio-item>
</tx-flat-radio>`,
    reactCode: locale => `import { useState } from 'react'
import { TxFlatRadio, TxFlatRadioItem } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function FlatRadioDemo() {
  const [theme, setTheme] = useState('system')
  return (
    <TxFlatRadio value={theme} onChange={v => setTheme(String(v))}>
      <TxFlatRadioItem value="light" label="${locale === 'zh' ? '浅色' : 'Light'}" />
      <TxFlatRadioItem value="system" label="${locale === 'zh' ? '跟随系统' : 'System'}" />
      <TxFlatRadioItem value="dark" label="${locale === 'zh' ? '深色' : 'Dark'}" />
    </TxFlatRadio>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '主题: system' : 'Theme: system')
      const el = createWcEl('tx-flat-radio', {
        attrs: { 'model-value': 'system' },
        props: { modelValue: 'system' },
        children: [
          createWcEl('tx-flat-radio-item', { attrs: { value: 'light', label: locale === 'zh' ? '浅色' : 'Light' }, text: locale === 'zh' ? '浅色' : 'Light' }),
          createWcEl('tx-flat-radio-item', { attrs: { value: 'system', label: locale === 'zh' ? '跟随系统' : 'System' }, text: locale === 'zh' ? '跟随系统' : 'System' }),
          createWcEl('tx-flat-radio-item', { attrs: { value: 'dark', label: locale === 'zh' ? '深色' : 'Dark' }, text: locale === 'zh' ? '深色' : 'Dark' }),
        ],
        events: {
          'update:model-value': (event: Event) => {
            const next = String(unpackDetail(event) ?? 'system')
            readout.textContent = locale === 'zh' ? `主题: ${next}` : `Theme: ${next}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxFlatRadio = pickReactComponent(TuffexReact, 'TxFlatRadio')
      const TxFlatRadioItem = pickReactComponent(TuffexReact, 'TxFlatRadioItem')
      function Demo() {
        const [theme, setTheme] = React.useState('system')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(
            TxFlatRadio,
            { value: theme, onChange: (v: string | number) => setTheme(String(v)) },
            React.createElement(TxFlatRadioItem, { value: 'light', label: locale === 'zh' ? '浅色' : 'Light' }),
            React.createElement(TxFlatRadioItem, { value: 'system', label: locale === 'zh' ? '跟随系统' : 'System' }),
            React.createElement(TxFlatRadioItem, { value: 'dark', label: locale === 'zh' ? '深色' : 'Dark' }),
          ),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `主题: ${theme}` : `Theme: ${theme}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'flat-select': {
    id: 'flat-select',
    wcTag: 'tx-flat-select',
    wcCode: locale => `<tx-flat-select model-value="react" placeholder="${locale === 'zh' ? '选择运行时' : 'Select runtime'}">
  <tx-flat-select-item value="vue" label="Vue 3"></tx-flat-select-item>
  <tx-flat-select-item value="react" label="React 19"></tx-flat-select-item>
  <tx-flat-select-item value="wc" label="Web Components"></tx-flat-select-item>
</tx-flat-select>`,
    reactCode: locale => `import { useState } from 'react'
import { TxFlatSelect, TxFlatSelectItem } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function FlatSelectDemo() {
  const [runtime, setRuntime] = useState('react')
  return (
    <TxFlatSelect value={runtime} onChange={v => setRuntime(String(v))} placeholder="${locale === 'zh' ? '选择运行时' : 'Select runtime'}">
      <TxFlatSelectItem value="vue" label="Vue 3" />
      <TxFlatSelectItem value="react" label="React 19" />
      <TxFlatSelectItem value="wc" label="Web Components" />
    </TxFlatSelect>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '运行时: react' : 'Runtime: react')
      const el = createWcEl('tx-flat-select', {
        attrs: { 'model-value': 'react', placeholder: locale === 'zh' ? '选择运行时' : 'Select runtime' },
        props: { modelValue: 'react' },
        children: [
          createWcEl('tx-flat-select-item', { attrs: { value: 'vue', label: 'Vue 3' } }),
          createWcEl('tx-flat-select-item', { attrs: { value: 'react', label: 'React 19' } }),
          createWcEl('tx-flat-select-item', { attrs: { value: 'wc', label: 'Web Components' } }),
        ],
        events: {
          'update:model-value': (event: Event) => {
            const next = String(unpackDetail(event) ?? 'react')
            readout.textContent = locale === 'zh' ? `运行时: ${next}` : `Runtime: ${next}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxFlatSelect = pickReactComponent(TuffexReact, 'TxFlatSelect')
      const TxFlatSelectItem = pickReactComponent(TuffexReact, 'TxFlatSelectItem')
      function Demo() {
        const [runtime, setRuntime] = React.useState('react')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(
            TxFlatSelect,
            { value: runtime, onChange: (v: string | number) => setRuntime(String(v)), placeholder: locale === 'zh' ? '选择运行时' : 'Select runtime' },
            React.createElement(TxFlatSelectItem, { value: 'vue', label: 'Vue 3' }),
            React.createElement(TxFlatSelectItem, { value: 'react', label: 'React 19' }),
            React.createElement(TxFlatSelectItem, { value: 'wc', label: 'Web Components' }),
          ),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `运行时: ${runtime}` : `Runtime: ${runtime}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'search-select': {
    id: 'search-select',
    wcTag: 'tx-search-select',
    wcCode: locale => `<tx-search-select
  model-value="tuffex-react"
  placeholder="${locale === 'zh' ? '搜索适配包…' : 'Search package...'}"
  clearable
  options='[{"value":"tuffex-core","label":"@talex-touch/tuffex-core"},{"value":"tuffex-react","label":"@talex-touch/tuffex-react"},{"value":"tuffex-wc","label":"@talex-touch/tuffex-wc"}]'
></tx-search-select>`,
    reactCode: locale => `import { useState } from 'react'
import { TxSearchSelect } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function SearchSelectDemo() {
  const [pkg, setPkg] = useState<string | number>('tuffex-react')
  return (
    <TxSearchSelect
      value={pkg}
      onChange={setPkg}
      placeholder="${locale === 'zh' ? '搜索适配包…' : 'Search package...'}"
      clearable
      options={[
        { value: 'tuffex-core', label: '@talex-touch/tuffex-core' },
        { value: 'tuffex-react', label: '@talex-touch/tuffex-react' },
        { value: 'tuffex-wc', label: '@talex-touch/tuffex-wc' },
      ]}
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const options = [
        { value: 'tuffex-core', label: '@talex-touch/tuffex-core' },
        { value: 'tuffex-react', label: '@talex-touch/tuffex-react' },
        { value: 'tuffex-wc', label: '@talex-touch/tuffex-wc' },
      ]
      const readout = createStatusReadout(locale === 'zh' ? '已选: tuffex-react' : 'Selected: tuffex-react')
      const el = createWcEl('tx-search-select', {
        attrs: { 'model-value': 'tuffex-react', placeholder: locale === 'zh' ? '搜索适配包…' : 'Search package...', clearable: true, options: JSON.stringify(options) },
        props: { modelValue: 'tuffex-react', clearable: true, options },
        events: {
          'update:model-value': (event: Event) => {
            const next = String(unpackDetail(event) ?? '')
            readout.textContent = locale === 'zh' ? `已选: ${next || '—'}` : `Selected: ${next || '—'}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxSearchSelect = pickReactComponent(TuffexReact, 'TxSearchSelect')
      const options = [
        { value: 'tuffex-core', label: '@talex-touch/tuffex-core' },
        { value: 'tuffex-react', label: '@talex-touch/tuffex-react' },
        { value: 'tuffex-wc', label: '@talex-touch/tuffex-wc' },
      ]
      function Demo() {
        const [pkg, setPkg] = React.useState<string | number>('tuffex-react')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxSearchSelect, { value: pkg, options, clearable: true, placeholder: locale === 'zh' ? '搜索适配包…' : 'Search package...', onChange: (v: string | number) => setPkg(v) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `已选: ${pkg || '—'}` : `Selected: ${pkg || '—'}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  cascader: {
    id: 'cascader',
    wcTag: 'tx-cascader',
    wcCode: locale => `<tx-cascader
  placeholder="${locale === 'zh' ? '选择包路径' : 'Select package path'}"
  clearable
  options='[{"value":"packages","label":"packages","children":[{"value":"tuffex-react","label":"tuffex-react"},{"value":"tuffex-wc","label":"tuffex-wc"}]},{"value":"apps","label":"apps","children":[{"value":"nexus","label":"nexus"}]}]'
></tx-cascader>`,
    reactCode: locale => `import { useState } from 'react'
import { TxCascader } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function CascaderDemo() {
  const [path, setPath] = useState<Array<string | number>>(['packages', 'tuffex-react'])
  return (
    <TxCascader
      value={path}
      onChange={v => setPath(Array.isArray(v) ? (v as Array<string | number>) : [])}
      placeholder="${locale === 'zh' ? '选择包路径' : 'Select package path'}"
      clearable
      options={[
        { value: 'packages', label: 'packages', children: [{ value: 'tuffex-react', label: 'tuffex-react' }, { value: 'tuffex-wc', label: 'tuffex-wc' }] },
        { value: 'apps', label: 'apps', children: [{ value: 'nexus', label: 'nexus' }] },
      ]}
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const options = [
        { value: 'packages', label: 'packages', children: [{ value: 'tuffex-react', label: 'tuffex-react' }, { value: 'tuffex-wc', label: 'tuffex-wc' }] },
        { value: 'apps', label: 'apps', children: [{ value: 'nexus', label: 'nexus' }] },
      ]
      const initial = ['packages', 'tuffex-react']
      const readout = createStatusReadout('packages / tuffex-react')
      const el = createWcEl('tx-cascader', {
        attrs: { placeholder: locale === 'zh' ? '选择包路径' : 'Select package path', clearable: true, 'model-value': JSON.stringify(initial), options: JSON.stringify(options) },
        props: { modelValue: initial, options, clearable: true },
        events: {
          'update:model-value': (event: Event) => {
            const val = unpackDetail<Array<string | number>>(event)
            readout.textContent = Array.isArray(val) && val.length ? val.join(' / ') : '—'
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxCascader = pickReactComponent(TuffexReact, 'TxCascader')
      const options = [
        { value: 'packages', label: 'packages', children: [{ value: 'tuffex-react', label: 'tuffex-react' }, { value: 'tuffex-wc', label: 'tuffex-wc' }] },
        { value: 'apps', label: 'apps', children: [{ value: 'nexus', label: 'nexus' }] },
      ]
      function Demo() {
        const [path, setPath] = React.useState<Array<string | number>>(['packages', 'tuffex-react'])
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxCascader, { value: path, options, clearable: true, placeholder: locale === 'zh' ? '选择包路径' : 'Select package path', onChange: (v: unknown) => setPath(Array.isArray(v) ? (v as Array<string | number>) : []) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, path.length ? path.join(' / ') : '—'),
        )
      }
      return React.createElement(Demo)
    },
  },

  tree: {
    id: 'tree',
    wcTag: 'tx-tree',
    wcCode: () => `<tx-tree
  selectable
  default-expanded-keys='["packages"]'
  nodes='[{"key":"packages","label":"packages","children":[{"key":"tuffex-core","label":"tuffex-core"},{"key":"tuffex-react","label":"tuffex-react"},{"key":"tuffex-wc","label":"tuffex-wc"}]}]'
></tx-tree>`,
    reactCode: () => `import { useState } from 'react'
import { TxTree } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function TreeDemo() {
  const [selected, setSelected] = useState<string | number>('tuffex-react')
  return (
    <TxTree
      value={selected}
      onChange={v => setSelected(Array.isArray(v) ? v[0] ?? '' : v)}
      selectable
      defaultExpandedKeys={['packages']}
      nodes={[
        {
          key: 'packages',
          label: 'packages',
          children: [
            { key: 'tuffex-core', label: 'tuffex-core' },
            { key: 'tuffex-react', label: 'tuffex-react' },
            { key: 'tuffex-wc', label: 'tuffex-wc' },
          ],
        },
      ]}
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const nodes = [
        {
          key: 'packages',
          label: 'packages',
          children: [
            { key: 'tuffex-core', label: 'tuffex-core' },
            { key: 'tuffex-react', label: 'tuffex-react' },
            { key: 'tuffex-wc', label: 'tuffex-wc' },
          ],
        },
      ]
      const readout = createStatusReadout(locale === 'zh' ? '选中节点: tuffex-react' : 'Selected: tuffex-react')
      const el = createWcEl('tx-tree', {
        attrs: { selectable: true, 'model-value': 'tuffex-react', 'default-expanded-keys': JSON.stringify(['packages']), nodes: JSON.stringify(nodes) },
        props: { selectable: true, modelValue: 'tuffex-react', defaultExpandedKeys: ['packages'], nodes },
        events: {
          'update:model-value': (event: Event) => {
            const next = unpackDetail(event)
            readout.textContent = locale === 'zh' ? `选中节点: ${String(next ?? '—')}` : `Selected: ${String(next ?? '—')}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxTree = pickReactComponent(TuffexReact, 'TxTree')
      const nodes = [
        {
          key: 'packages',
          label: 'packages',
          children: [
            { key: 'tuffex-core', label: 'tuffex-core' },
            { key: 'tuffex-react', label: 'tuffex-react' },
            { key: 'tuffex-wc', label: 'tuffex-wc' },
          ],
        },
      ]
      function Demo() {
        const [selected, setSelected] = React.useState<string | number>('tuffex-react')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxTree, { value: selected, selectable: true, defaultExpandedKeys: ['packages'], nodes, onChange: (v: unknown) => setSelected(Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `选中节点: ${selected}` : `Selected: ${selected}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'tree-select': {
    id: 'tree-select',
    wcTag: 'tx-tree-select',
    wcCode: locale => `<tx-tree-select
  model-value="tuffex-wc"
  placeholder="${locale === 'zh' ? '选择工作区节点' : 'Select workspace node'}"
  clearable
  default-expanded-keys='["packages"]'
  nodes='[{"key":"packages","label":"packages","children":[{"key":"tuffex-react","label":"tuffex-react"},{"key":"tuffex-wc","label":"tuffex-wc"}]}]'
></tx-tree-select>`,
    reactCode: locale => `import { useState } from 'react'
import { TxTreeSelect } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function TreeSelectDemo() {
  const [node, setNode] = useState<string | number | undefined>('tuffex-wc')
  return (
    <TxTreeSelect
      value={node}
      onChange={v => setNode(Array.isArray(v) ? v[0] : v)}
      placeholder="${locale === 'zh' ? '选择工作区节点' : 'Select workspace node'}"
      clearable
      defaultExpandedKeys={['packages']}
      nodes={[{ key: 'packages', label: 'packages', children: [{ key: 'tuffex-react', label: 'tuffex-react' }, { key: 'tuffex-wc', label: 'tuffex-wc' }] }]}
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const nodes = [{ key: 'packages', label: 'packages', children: [{ key: 'tuffex-react', label: 'tuffex-react' }, { key: 'tuffex-wc', label: 'tuffex-wc' }] }]
      const readout = createStatusReadout(locale === 'zh' ? '已选: tuffex-wc' : 'Selected: tuffex-wc')
      const el = createWcEl('tx-tree-select', {
        attrs: { 'model-value': 'tuffex-wc', placeholder: locale === 'zh' ? '选择工作区节点' : 'Select workspace node', clearable: true, 'default-expanded-keys': JSON.stringify(['packages']), nodes: JSON.stringify(nodes) },
        props: { modelValue: 'tuffex-wc', clearable: true, defaultExpandedKeys: ['packages'], nodes },
        events: {
          'update:model-value': (event: Event) => {
            readout.textContent = locale === 'zh' ? `已选: ${String(unpackDetail(event) ?? '—')}` : `Selected: ${String(unpackDetail(event) ?? '—')}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxTreeSelect = pickReactComponent(TuffexReact, 'TxTreeSelect')
      const nodes = [{ key: 'packages', label: 'packages', children: [{ key: 'tuffex-react', label: 'tuffex-react' }, { key: 'tuffex-wc', label: 'tuffex-wc' }] }]
      function Demo() {
        const [node, setNode] = React.useState<string | number | undefined>('tuffex-wc')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxTreeSelect, { value: node, nodes, clearable: true, defaultExpandedKeys: ['packages'], placeholder: locale === 'zh' ? '选择工作区节点' : 'Select workspace node', onChange: (v: unknown) => setNode(Array.isArray(v) ? v[0] : (v as string | number | undefined)) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `已选: ${node ?? '—'}` : `Selected: ${node ?? '—'}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'date-picker': {
    id: 'date-picker',
    wcTag: 'tx-date-picker',
    wcCode: locale => `<tx-date-picker model-value="2026-11-27" variant="field" placeholder="${locale === 'zh' ? '选择发布日期' : 'Select release date'}"></tx-date-picker>`,
    reactCode: locale => `import { useState } from 'react'
import { TxDatePicker } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function DatePickerDemo() {
  const [date, setDate] = useState('2026-11-27')
  return <TxDatePicker value={date} variant="field" placeholder="${locale === 'zh' ? '选择发布日期' : 'Select release date'}" onChange={v => setDate(String(v))} />
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '日期: 2026-11-27' : 'Date: 2026-11-27')
      const el = createWcEl('tx-date-picker', {
        attrs: { 'model-value': '2026-11-27', variant: 'field', placeholder: locale === 'zh' ? '选择发布日期' : 'Select release date' },
        props: { modelValue: '2026-11-27', variant: 'field' },
        events: {
          'update:model-value': (event: Event) => {
            readout.textContent = locale === 'zh' ? `日期: ${String(unpackDetail(event) ?? '')}` : `Date: ${String(unpackDetail(event) ?? '')}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxDatePicker = pickReactComponent(TuffexReact, 'TxDatePicker')
      function Demo() {
        const [date, setDate] = React.useState('2026-11-27')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxDatePicker, { value: date, variant: 'field', placeholder: locale === 'zh' ? '选择发布日期' : 'Select release date', onChange: (v: unknown) => setDate(String(v ?? '')) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `日期: ${date}` : `Date: ${date}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  picker: {
    id: 'picker',
    wcTag: 'tx-picker',
    wcCode: () => `<tx-picker
  model-value='["stable","arm64"]'
  columns='[{"key":"channel","options":[{"value":"stable","label":"Stable"},{"value":"beta","label":"Beta"}]},{"key":"arch","options":[{"value":"arm64","label":"ARM64"},{"value":"x64","label":"x64"}]}]'
></tx-picker>`,
    reactCode: () => `import { useState } from 'react'
import { TxPicker } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function PickerDemo() {
  const [val, setVal] = useState<Array<string | number>>(['stable', 'arm64'])
  return (
    <TxPicker
      value={val}
      popup={false}
      onChange={setVal}
      columns={[
        { key: 'channel', options: [{ value: 'stable', label: 'Stable' }, { value: 'beta', label: 'Beta' }] },
        { key: 'arch', options: [{ value: 'arm64', label: 'ARM64' }, { value: 'x64', label: 'x64' }] },
      ]}
    />
  )
}`,
    mountWc: (container) => {
      const disposers: Array<() => void> = []
      const columns = [
        { key: 'channel', options: [{ value: 'stable', label: 'Stable' }, { value: 'beta', label: 'Beta' }] },
        { key: 'arch', options: [{ value: 'arm64', label: 'ARM64' }, { value: 'x64', label: 'x64' }] },
      ]
      const initial = ['stable', 'arm64']
      const readout = createStatusReadout('stable · arm64')
      const el = createWcEl('tx-picker', {
        attrs: { 'model-value': JSON.stringify(initial), columns: JSON.stringify(columns) },
        props: { modelValue: initial, columns, popup: false },
        events: {
          'update:model-value': (event: Event) => {
            const val = unpackDetail<Array<string | number>>(event)
            readout.textContent = Array.isArray(val) ? val.join(' · ') : '—'
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact) => {
      const TxPicker = pickReactComponent(TuffexReact, 'TxPicker')
      const columns = [
        { key: 'channel', options: [{ value: 'stable', label: 'Stable' }, { value: 'beta', label: 'Beta' }] },
        { key: 'arch', options: [{ value: 'arm64', label: 'ARM64' }, { value: 'x64', label: 'x64' }] },
      ]
      function Demo() {
        const [val, setVal] = React.useState<Array<string | number>>(['stable', 'arm64'])
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxPicker, { value: val, popup: false, columns, onChange: (v: Array<string | number>) => setVal(Array.isArray(v) ? v : []) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, val.join(' · ')),
        )
      }
      return React.createElement(Demo)
    },
  },

  form: {
    id: 'form',
    wcTag: 'tx-form',
    wcCode: locale => `<tx-form layout="stacked">
  <tx-form-item label="${locale === 'zh' ? '插件名称' : 'Plugin name'}" prop="name" required>
    <tx-input placeholder="tuffex-demo"></tx-input>
  </tx-form-item>
  <tx-button variant="primary" native-type="submit">${locale === 'zh' ? '提交' : 'Submit'}</tx-button>
</tx-form>`,
    reactCode: locale => `import { useState } from 'react'
import { TxButton, TxForm, TxFormItem, TxInput } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function FormDemo() {
  const [name, setName] = useState('tuffex-demo')
  return (
    <TxForm layout="stacked" initialValues={{ name }} onSubmit={() => {}}>
      <TxFormItem label="${locale === 'zh' ? '插件名称' : 'Plugin name'}" name="name" required>
        <TxInput value={name} onChange={setName} />
      </TxFormItem>
      <TxButton variant="primary" type="submit">${locale === 'zh' ? '提交' : 'Submit'}</TxButton>
    </TxForm>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      let submits = 0
      const readout = createStatusReadout(locale === 'zh' ? '提交次数: 0' : 'Submits: 0')
      const form = createWcEl('tx-form', {
        attrs: { layout: 'stacked' },
        children: [
          createWcEl('tx-form-item', {
            attrs: { label: locale === 'zh' ? '插件名称' : 'Plugin name', prop: 'name', required: true },
            children: [createWcEl('tx-input', { attrs: { placeholder: 'tuffex-demo' } })],
          }),
          createWcEl('tx-button', {
            attrs: { variant: 'primary' },
            text: locale === 'zh' ? '提交表单' : 'Submit form',
            events: {
              click: () => {
                submits += 1
                readout.textContent = locale === 'zh' ? `提交次数: ${submits}` : `Submits: ${submits}`
              },
            },
          }, disposers),
        ],
      })
      container.replaceChildren(createStageRow([form, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxForm = pickReactComponent(TuffexReact, 'TxForm')
      const TxFormItem = pickReactComponent(TuffexReact, 'TxFormItem')
      const TxInput = pickReactComponent(TuffexReact, 'TxInput')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      function Demo() {
        const [name, setName] = React.useState('tuffex-demo')
        const [submits, setSubmits] = React.useState(0)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(
            TxForm,
            { layout: 'stacked', initialValues: { name }, onSubmit: () => setSubmits(prev => prev + 1) },
            React.createElement(TxFormItem, { label: locale === 'zh' ? '插件名称' : 'Plugin name', name: 'name', required: true }, React.createElement(TxInput, { value: name, onChange: (v: string) => setName(String(v ?? '')) })),
            React.createElement(TxButton, { variant: 'primary', type: 'submit', onClick: () => setSubmits(prev => prev + 1) }, locale === 'zh' ? '提交表单' : 'Submit form'),
          ),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `提交次数: ${submits}` : `Submits: ${submits}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'modal-form': {
    id: 'modal-form',
    wcTag: 'tx-modal-form',
    wcCode: locale => `<tx-button variant="primary">${locale === 'zh' ? '打开弹窗表单' : 'Open modal form'}</tx-button>
<tx-modal-form title="${locale === 'zh' ? '创建工作区' : 'Create workspace'}">
  <tx-form-item label="${locale === 'zh' ? '名称' : 'Name'}" prop="name" required>
    <tx-input placeholder="Nexus"></tx-input>
  </tx-form-item>
</tx-modal-form>`,
    reactCode: locale => `import { useState } from 'react'
import { TxButton, TxFormItem, TxInput, TxModalForm } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ModalFormDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TxButton variant="primary" onClick={() => setOpen(true)}>${locale === 'zh' ? '打开弹窗表单' : 'Open modal form'}</TxButton>
      <TxModalForm open={open} onOpenChange={setOpen} title="${locale === 'zh' ? '创建工作区' : 'Create workspace'}" initialValues={{ name: 'Nexus' }}>
        <TxFormItem label="${locale === 'zh' ? '名称' : 'Name'}" name="name" required>
          <TxInput placeholder="Nexus" />
        </TxFormItem>
      </TxModalForm>
    </>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const setOpen = (next: boolean) => {
        const el = modalForm as unknown as Record<string, unknown>
        el.modelValue = next
        el.open = next
        if (next)
          modalForm.setAttribute('model-value', '')
        else
          modalForm.removeAttribute('model-value')
      }
      const modalForm = createWcEl('tx-modal-form', {
        attrs: { title: locale === 'zh' ? '创建工作区' : 'Create workspace' },
        props: { initialValues: { name: 'Nexus' } },
        children: [
          createWcEl('tx-form-item', {
            attrs: { label: locale === 'zh' ? '名称' : 'Name', prop: 'name', required: true },
            children: [createWcEl('tx-input', { attrs: { placeholder: 'Nexus' } })],
          }),
        ],
        events: {
          'update:model-value': (event: Event) => {
            if (!unpackDetail(event))
              setOpen(false)
          },
          'submit-success': () => setOpen(false),
        },
      }, disposers)
      const btn = createWcEl('tx-button', { attrs: { variant: 'primary' }, text: locale === 'zh' ? '打开弹窗表单' : 'Open modal form', events: { click: () => setOpen(true) } }, disposers)
      container.replaceChildren(createStageRow([btn, modalForm]))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxModalForm = pickReactComponent(TuffexReact, 'TxModalForm')
      const TxFormItem = pickReactComponent(TuffexReact, 'TxFormItem')
      const TxInput = pickReactComponent(TuffexReact, 'TxInput')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      function Demo() {
        const [open, setOpen] = React.useState(false)
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(TxButton, { variant: 'primary', onClick: () => setOpen(true) }, locale === 'zh' ? '打开弹窗表单' : 'Open modal form'),
          React.createElement(
            TxModalForm,
            { open, onOpenChange: (v: boolean) => setOpen(Boolean(v)), title: locale === 'zh' ? '创建工作区' : 'Create workspace', initialValues: { name: 'Nexus' } },
            React.createElement(TxFormItem, { label: locale === 'zh' ? '名称' : 'Name', name: 'name', required: true }, React.createElement(TxInput, { placeholder: 'Nexus' })),
          ),
        )
      }
      return React.createElement(Demo)
    },
  },

  'drawer-form': {
    id: 'drawer-form',
    wcTag: 'tx-drawer-form',
    wcCode: locale => `<tx-button variant="secondary">${locale === 'zh' ? '打开抽屉表单' : 'Open drawer form'}</tx-button>
<tx-drawer-form title="${locale === 'zh' ? '编辑配置' : 'Edit settings'}">
  <tx-form-item label="${locale === 'zh' ? '环境' : 'Environment'}" prop="env">
    <tx-input placeholder="production"></tx-input>
  </tx-form-item>
</tx-drawer-form>`,
    reactCode: locale => `import { useState } from 'react'
import { TxButton, TxDrawerForm, TxFormItem, TxInput } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function DrawerFormDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TxButton variant="secondary" onClick={() => setOpen(true)}>${locale === 'zh' ? '打开抽屉表单' : 'Open drawer form'}</TxButton>
      <TxDrawerForm open={open} onOpenChange={setOpen} title="${locale === 'zh' ? '编辑配置' : 'Edit settings'}" initialValues={{ env: 'production' }}>
        <TxFormItem label="${locale === 'zh' ? '环境' : 'Environment'}" name="env">
          <TxInput placeholder="production" />
        </TxFormItem>
      </TxDrawerForm>
    </>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const setOpen = (next: boolean) => {
        const el = drawerForm as unknown as Record<string, unknown>
        el.visible = next
        el.open = next
        if (next)
          drawerForm.setAttribute('visible', '')
        else
          drawerForm.removeAttribute('visible')
      }
      const drawerForm = createWcEl('tx-drawer-form', {
        attrs: { title: locale === 'zh' ? '编辑配置' : 'Edit settings' },
        props: { initialValues: { env: 'production' } },
        children: [
          createWcEl('tx-form-item', {
            attrs: { label: locale === 'zh' ? '环境' : 'Environment', prop: 'env' },
            children: [createWcEl('tx-input', { attrs: { placeholder: 'production' } })],
          }),
        ],
        events: {
          'update:visible': (event: Event) => {
            if (!unpackDetail(event))
              setOpen(false)
          },
          'submit-success': () => setOpen(false),
        },
      }, disposers)
      const btn = createWcEl('tx-button', { attrs: { variant: 'secondary' }, text: locale === 'zh' ? '打开抽屉表单' : 'Open drawer form', events: { click: () => setOpen(true) } }, disposers)
      container.replaceChildren(createStageRow([btn, drawerForm]))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxDrawerForm = pickReactComponent(TuffexReact, 'TxDrawerForm')
      const TxFormItem = pickReactComponent(TuffexReact, 'TxFormItem')
      const TxInput = pickReactComponent(TuffexReact, 'TxInput')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      function Demo() {
        const [open, setOpen] = React.useState(false)
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(TxButton, { variant: 'secondary', onClick: () => setOpen(true) }, locale === 'zh' ? '打开抽屉表单' : 'Open drawer form'),
          React.createElement(
            TxDrawerForm,
            { open, onOpenChange: (v: boolean) => setOpen(Boolean(v)), title: locale === 'zh' ? '编辑配置' : 'Edit settings', initialValues: { env: 'production' } },
            React.createElement(TxFormItem, { label: locale === 'zh' ? '环境' : 'Environment', name: 'env' }, React.createElement(TxInput, { placeholder: 'production' })),
          ),
        )
      }
      return React.createElement(Demo)
    },
  },

  'steps-form': {
    id: 'steps-form',
    wcTag: 'tx-steps-form',
    wcCode: locale => `<tx-steps-form active="0" prev-text="${locale === 'zh' ? '上一步' : 'Back'}" next-text="${locale === 'zh' ? '下一步' : 'Next'}" submit-text="${locale === 'zh' ? '完成' : 'Submit'}"></tx-steps-form>`,
    reactCode: locale => `import { useState } from 'react'
import { TxStepsForm } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function StepsFormDemo() {
  const [step, setStep] = useState(0)
  return (
    <TxStepsForm
      active={step}
      onActiveChange={setStep}
      steps={[
        { title: '${locale === 'zh' ? '基本信息' : 'Basics'}', content: '${locale === 'zh' ? '填写项目名称与标识' : 'Enter project name and slug'}' },
        { title: '${locale === 'zh' ? '框架目标' : 'Targets'}', content: 'Vue · React · Web Components' },
      ]}
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '步骤: 1' : 'Step: 1')
      const el = createWcEl('tx-steps-form', {
        attrs: { active: 0, 'prev-text': locale === 'zh' ? '上一步' : 'Back', 'next-text': locale === 'zh' ? '下一步' : 'Next', 'submit-text': locale === 'zh' ? '完成' : 'Submit' },
        props: { active: 0 },
        events: {
          'update:active': (event: Event) => {
            readout.textContent = locale === 'zh' ? `步骤: ${Number(unpackDetail(event) ?? 0) + 1}` : `Step: ${Number(unpackDetail(event) ?? 0) + 1}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxStepsForm = pickReactComponent(TuffexReact, 'TxStepsForm')
      function Demo() {
        const [step, setStep] = React.useState(0)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxStepsForm, {
            active: step,
            onActiveChange: (next: number) => setStep(Number(next)),
            steps: [
              { title: locale === 'zh' ? '基本信息' : 'Basics', content: locale === 'zh' ? '填写项目名称与标识' : 'Enter project name and slug' },
              { title: locale === 'zh' ? '框架目标' : 'Targets', content: 'Vue · React · Web Components' },
            ],
          }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `步骤: ${step + 1}` : `Step: ${step + 1}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'context-menu': {
    id: 'context-menu',
    wcTag: 'tx-context-menu',
    wcCode: locale => `<tx-context-menu trigger="both">
  <div class="tuff-context-target">${locale === 'zh' ? '右键或点击此处打开菜单' : 'Right-click or click here'}</div>
  <tx-context-menu-item slot="menu">${locale === 'zh' ? '复制令牌' : 'Copy token'}</tx-context-menu-item>
  <tx-context-menu-item slot="menu" danger>${locale === 'zh' ? '移除' : 'Delete'}</tx-context-menu-item>
</tx-context-menu>`,
    reactCode: locale => `import { TxContextMenu, TxContextMenuItem } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ContextMenuDemo() {
  return (
    <TxContextMenu
      trigger="both"
      menu={(
        <>
          <TxContextMenuItem>${locale === 'zh' ? '复制令牌' : 'Copy token'}</TxContextMenuItem>
          <TxContextMenuItem danger>${locale === 'zh' ? '移除' : 'Delete'}</TxContextMenuItem>
        </>
      )}
    >
      <div>${locale === 'zh' ? '右键或点击此处打开菜单' : 'Right-click or click here'}</div>
    </TxContextMenu>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '最后操作: 无' : 'Last action: none')
      const target = createWcEl('div', { style: { ...DEMO_BOX_STYLE, cursor: 'context-menu' }, text: locale === 'zh' ? '右键或点击此处打开菜单' : 'Right-click or click here' })
      const itemA = createWcEl('tx-context-menu-item', { attrs: { slot: 'menu' }, text: locale === 'zh' ? '复制令牌' : 'Copy token', events: { click: () => { readout.textContent = locale === 'zh' ? '最后操作: 复制令牌' : 'Last action: Copy token' } } }, disposers)
      const itemB = createWcEl('tx-context-menu-item', { attrs: { slot: 'menu', danger: true }, text: locale === 'zh' ? '移除' : 'Delete', events: { click: () => { readout.textContent = locale === 'zh' ? '最后操作: 移除' : 'Last action: Delete' } } }, disposers)
      const menu = createWcEl('tx-context-menu', { attrs: { trigger: 'both' }, children: [target, itemA, itemB] })
      container.replaceChildren(createStageRow([menu, readout]))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxContextMenu = pickReactComponent(TuffexReact, 'TxContextMenu')
      const TxContextMenuItem = pickReactComponent(TuffexReact, 'TxContextMenuItem')
      function Demo() {
        const [last, setLast] = React.useState(locale === 'zh' ? '无' : 'none')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__row' },
          React.createElement(
            TxContextMenu,
            {
              trigger: 'both',
              menu: React.createElement(
                React.Fragment,
                null,
                React.createElement(TxContextMenuItem, { onSelect: () => setLast(locale === 'zh' ? '复制令牌' : 'Copy token'), onClick: () => setLast(locale === 'zh' ? '复制令牌' : 'Copy token') }, locale === 'zh' ? '复制令牌' : 'Copy token'),
                React.createElement(TxContextMenuItem, { danger: true, onSelect: () => setLast(locale === 'zh' ? '移除' : 'Delete'), onClick: () => setLast(locale === 'zh' ? '移除' : 'Delete') }, locale === 'zh' ? '移除' : 'Delete'),
              ),
            },
            React.createElement('div', { style: { ...DEMO_BOX_STYLE, cursor: 'context-menu' } }, locale === 'zh' ? '右键或点击此处打开菜单' : 'Right-click or click here'),
          ),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `最后操作: ${last}` : `Last action: ${last}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'dropdown-menu': {
    id: 'dropdown-menu',
    wcTag: 'tx-dropdown-menu',
    wcCode: locale => `<tx-dropdown-menu placement="bottom-start">
  <tx-button slot="trigger" variant="secondary">${locale === 'zh' ? '更多操作' : 'Actions'}</tx-button>
  <tx-dropdown-item>${locale === 'zh' ? '重命名' : 'Rename'}</tx-dropdown-item>
  <tx-dropdown-item danger>${locale === 'zh' ? '归档' : 'Archive'}</tx-dropdown-item>
</tx-dropdown-menu>`,
    reactCode: locale => `import { TxButton, TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function DropdownMenuDemo() {
  return (
    <TxDropdownMenu trigger={<TxButton variant="secondary">${locale === 'zh' ? '更多操作' : 'Actions'}</TxButton>}>
      <TxDropdownItem>${locale === 'zh' ? '重命名' : 'Rename'}</TxDropdownItem>
      <TxDropdownItem danger>${locale === 'zh' ? '归档' : 'Archive'}</TxDropdownItem>
    </TxDropdownMenu>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '选择: 无' : 'Action: none')
      const trigger = createWcEl('tx-button', { attrs: { slot: 'trigger', variant: 'secondary' }, text: locale === 'zh' ? '更多操作' : 'Actions' })
      const itemA = createWcEl('tx-dropdown-item', { text: locale === 'zh' ? '重命名' : 'Rename', events: { click: () => { readout.textContent = locale === 'zh' ? '选择: 重命名' : 'Action: Rename' } } }, disposers)
      const itemB = createWcEl('tx-dropdown-item', { attrs: { danger: true }, text: locale === 'zh' ? '归档' : 'Archive', events: { click: () => { readout.textContent = locale === 'zh' ? '选择: 归档' : 'Action: Archive' } } }, disposers)
      const menu = createWcEl('tx-dropdown-menu', { attrs: { placement: 'bottom-start' }, children: [trigger, itemA, itemB] })
      container.replaceChildren(createStageRow([menu, readout]))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxDropdownMenu = pickReactComponent(TuffexReact, 'TxDropdownMenu')
      const TxDropdownItem = pickReactComponent(TuffexReact, 'TxDropdownItem')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      function Demo() {
        const [action, setAction] = React.useState(locale === 'zh' ? '无' : 'none')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__row' },
          React.createElement(
            TxDropdownMenu,
            { trigger: React.createElement(TxButton, { variant: 'secondary' }, locale === 'zh' ? '更多操作' : 'Actions') },
            React.createElement(TxDropdownItem, { onSelect: () => setAction(locale === 'zh' ? '重命名' : 'Rename'), onClick: () => setAction(locale === 'zh' ? '重命名' : 'Rename') }, locale === 'zh' ? '重命名' : 'Rename'),
            React.createElement(TxDropdownItem, { danger: true, onSelect: () => setAction(locale === 'zh' ? '归档' : 'Archive'), onClick: () => setAction(locale === 'zh' ? '归档' : 'Archive') }, locale === 'zh' ? '归档' : 'Archive'),
          ),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `选择: ${action}` : `Action: ${action}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'flat-dropdown': {
    id: 'flat-dropdown',
    wcTag: 'tx-flat-dropdown',
    wcCode: locale => `<tx-flat-dropdown trigger="click" placement="bottom-start">
  <tx-button slot="trigger" variant="secondary">${locale === 'zh' ? '快速菜单' : 'Quick menu'}</tx-button>
  <div>${locale === 'zh' ? '扁平化悬浮菜单面板' : 'Flat floating dropdown surface'}</div>
</tx-flat-dropdown>`,
    reactCode: locale => `import { TxButton, TxFlatDropdown } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function FlatDropdownDemo() {
  return (
    <TxFlatDropdown trigger="click" content={<div>${locale === 'zh' ? '扁平化悬浮菜单面板' : 'Flat floating dropdown surface'}</div>}>
      <TxButton variant="secondary">${locale === 'zh' ? '快速菜单' : 'Quick menu'}</TxButton>
    </TxFlatDropdown>
  )
}`,
    mountWc: (container, locale) => {
      const trigger = createWcEl('tx-button', { attrs: { slot: 'trigger', variant: 'secondary' }, text: locale === 'zh' ? '快速菜单' : 'Quick menu' })
      const body = createWcEl('div', { style: DEMO_BOX_STYLE, text: locale === 'zh' ? '扁平化悬浮菜单面板' : 'Flat floating dropdown surface' })
      const dd = createWcEl('tx-flat-dropdown', { attrs: { trigger: 'click', placement: 'bottom-start' }, children: [trigger, body] })
      container.replaceChildren(createStageRow([dd]))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxFlatDropdown = pickReactComponent(TuffexReact, 'TxFlatDropdown')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      return React.createElement(
        TxFlatDropdown,
        { trigger: 'click', content: React.createElement('div', { style: DEMO_BOX_STYLE }, locale === 'zh' ? '扁平化悬浮菜单面板' : 'Flat floating dropdown surface') },
        React.createElement(TxButton, { variant: 'secondary' }, locale === 'zh' ? '快速菜单' : 'Quick menu'),
      )
    },
  },

  'selection-actions': {
    id: 'selection-actions',
    wcTag: 'tx-selection-actions',
    wcCode: locale => `<tx-selection-actions
  state="idle"
  actions='[{"id":"explain","label":"${locale === 'zh' ? '解释' : 'Explain'}"},{"id":"improve","label":"${locale === 'zh' ? '润色' : 'Improve'}"}]'
></tx-selection-actions>`,
    reactCode: locale => `import { useState } from 'react'
import { TxButton, TxSelectionActions } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function SelectionActionsDemo() {
  const [active, setActive] = useState(false)
  return (
    <>
      <TxButton size="sm" variant="secondary" onClick={() => setActive(v => !v)}>
        ${locale === 'zh' ? '模拟划词选区' : 'Toggle mock selection'}
      </TxButton>
      <TxSelectionActions
        selection={active ? { text: 'TuffEx tokens', rects: [] } : null}
        actions={[{ id: 'explain', label: '${locale === 'zh' ? '解释' : 'Explain'}' }, { id: 'improve', label: '${locale === 'zh' ? '润色' : 'Improve'}' }]}
      />
    </>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      let active = false
      const actions = [
        { id: 'explain', label: locale === 'zh' ? '解释' : 'Explain' },
        { id: 'improve', label: locale === 'zh' ? '润色' : 'Improve' },
      ]
      const readout = createStatusReadout(locale === 'zh' ? '选区: 未激活' : 'Selection: idle')
      const bar = createWcEl('tx-selection-actions', {
        attrs: { state: 'idle', actions: JSON.stringify(actions) },
        props: { state: 'idle', actions, selection: null },
      })
      const btn = createWcEl('tx-button', {
        attrs: { size: 'sm', variant: 'secondary' },
        text: locale === 'zh' ? '切换划词工具条' : 'Toggle selection bar',
        events: {
          click: () => {
            active = !active
            ;(bar as unknown as Record<string, unknown>).selection = active ? { text: 'TuffEx tokens', rects: [] } : null
            readout.textContent = active ? (locale === 'zh' ? '选区: 已激活' : 'Selection: active') : (locale === 'zh' ? '选区: 未激活' : 'Selection: idle')
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([btn, readout, bar]))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxSelectionActions = pickReactComponent(TuffexReact, 'TxSelectionActions')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      const actions = [
        { id: 'explain', label: locale === 'zh' ? '解释' : 'Explain' },
        { id: 'improve', label: locale === 'zh' ? '润色' : 'Improve' },
      ]
      function Demo() {
        const [active, setActive] = React.useState(false)
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__row' },
          React.createElement(TxButton, { size: 'sm', variant: 'secondary', onClick: () => setActive(prev => !prev) }, locale === 'zh' ? '切换划词工具条' : 'Toggle selection bar'),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, active ? (locale === 'zh' ? '选区: 已激活' : 'Selection: active') : (locale === 'zh' ? '选区: 未激活' : 'Selection: idle')),
          React.createElement(TxSelectionActions, { selection: active ? { text: 'TuffEx tokens', rects: [] } : null, state: 'idle', actions }),
        )
      }
      return React.createElement(Demo)
    },
  },

  'data-table': {
    id: 'data-table',
    wcTag: 'tx-data-table',
    wcCode: locale => `<tx-data-table
  row-key="id"
  selectable
  bordered
  columns='${JSON.stringify([
    { key: 'pkg', title: locale === 'zh' ? '包名' : 'Package', sortable: true },
    { key: 'runtime', title: locale === 'zh' ? '运行时' : 'Runtime' },
    { key: 'ready', title: locale === 'zh' ? '已适配' : 'Ready', sortable: true },
  ])}'
  data='${JSON.stringify([
    { id: 'vue', pkg: '@talex-touch/tuffex', runtime: 'Vue 3.5', ready: '193 / 193' },
    { id: 'react', pkg: '@talex-touch/tuffex-react', runtime: 'React 18/19', ready: '100 / 193' },
    { id: 'wc', pkg: '@talex-touch/tuffex-wc', runtime: 'Custom Elements', ready: '100 / 193' },
  ])}'
></tx-data-table>`,
    reactCode: locale => `import { TxDataTable } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function DataTableDemo() {
  return (
    <TxDataTable
      rowKey="id"
      selectable
      bordered
      columns={[
        { key: 'pkg', title: '${locale === 'zh' ? '包名' : 'Package'}', sortable: true },
        { key: 'runtime', title: '${locale === 'zh' ? '运行时' : 'Runtime'}' },
        { key: 'ready', title: '${locale === 'zh' ? '已适配' : 'Ready'}', sortable: true },
      ]}
      data={[
        { id: 'vue', pkg: '@talex-touch/tuffex', runtime: 'Vue 3.5', ready: '193 / 193' },
        { id: 'react', pkg: '@talex-touch/tuffex-react', runtime: 'React 18/19', ready: '100 / 193' },
        { id: 'wc', pkg: '@talex-touch/tuffex-wc', runtime: 'Custom Elements', ready: '100 / 193' },
      ]}
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const columns = [
        { key: 'pkg', title: locale === 'zh' ? '包名' : 'Package', sortable: true },
        { key: 'runtime', title: locale === 'zh' ? '运行时' : 'Runtime' },
        { key: 'ready', title: locale === 'zh' ? '已适配' : 'Ready', sortable: true },
      ]
      const data = [
        { id: 'vue', pkg: '@talex-touch/tuffex', runtime: 'Vue 3.5', ready: '193 / 193' },
        { id: 'react', pkg: '@talex-touch/tuffex-react', runtime: 'React 18/19', ready: '100 / 193' },
        { id: 'wc', pkg: '@talex-touch/tuffex-wc', runtime: 'Custom Elements', ready: '100 / 193' },
      ]
      const readout = createStatusReadout(locale === 'zh' ? '已选行: 0' : 'Selected rows: 0')
      const table = createWcEl('tx-data-table', {
        attrs: { 'row-key': 'id', selectable: true, bordered: true, columns: JSON.stringify(columns), data: JSON.stringify(data) },
        props: { rowKey: 'id', selectable: true, bordered: true, columns, data },
        events: {
          'update:selected-keys': (event: Event) => {
            const keys = unpackDetail<unknown[]>(event) ?? []
            readout.textContent = locale === 'zh' ? `已选行: ${keys.length}` : `Selected rows: ${keys.length}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([table, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxDataTable = pickReactComponent(TuffexReact, 'TxDataTable')
      const columns = [
        { key: 'pkg', title: locale === 'zh' ? '包名' : 'Package', sortable: true },
        { key: 'runtime', title: locale === 'zh' ? '运行时' : 'Runtime' },
        { key: 'ready', title: locale === 'zh' ? '已适配' : 'Ready', sortable: true },
      ]
      const data = [
        { id: 'vue', pkg: '@talex-touch/tuffex', runtime: 'Vue 3.5', ready: '193 / 193' },
        { id: 'react', pkg: '@talex-touch/tuffex-react', runtime: 'React 18/19', ready: '100 / 193' },
        { id: 'wc', pkg: '@talex-touch/tuffex-wc', runtime: 'Custom Elements', ready: '100 / 193' },
      ]
      function Demo() {
        const [keys, setKeys] = React.useState<Array<string | number>>([])
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxDataTable, { rowKey: 'id', selectable: true, bordered: true, columns, data, selectedKeys: keys, onSelectedKeysChange: (next: Array<string | number>) => setKeys(Array.isArray(next) ? next : []) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `已选行: ${keys.length}` : `Selected rows: ${keys.length}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  descriptions: {
    id: 'descriptions',
    wcTag: 'tx-descriptions',
    wcCode: locale => `<tx-descriptions columns="2" size="sm">
  <tx-descriptions-item label="${locale === 'zh' ? '套件' : 'Suite'}">Basics (99/99)</tx-descriptions-item>
  <tx-descriptions-item label="${locale === 'zh' ? '协议' : 'License'}">MIT</tx-descriptions-item>
</tx-descriptions>`,
    reactCode: locale => `import { TxDescriptions, TxDescriptionsItem } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function DescriptionsDemo() {
  return (
    <TxDescriptions columns={2} size="sm">
      <TxDescriptionsItem label="${locale === 'zh' ? '套件' : 'Suite'}">Basics (99/99)</TxDescriptionsItem>
      <TxDescriptionsItem label="${locale === 'zh' ? '协议' : 'License'}">MIT</TxDescriptionsItem>
    </TxDescriptions>
  )
}`,
    mountWc: (container, locale) => {
      const desc = createWcEl('tx-descriptions', {
        attrs: { columns: 2, size: 'sm' },
        props: { columns: 2, size: 'sm' },
        children: [
          createWcEl('tx-descriptions-item', { attrs: { label: locale === 'zh' ? '套件' : 'Suite' }, text: 'Basics (99/99)' }),
          createWcEl('tx-descriptions-item', { attrs: { label: locale === 'zh' ? '协议' : 'License' }, text: 'MIT' }),
        ],
      })
      container.replaceChildren(createStageRow([desc], true))
      return () => {}
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxDescriptions = pickReactComponent(TuffexReact, 'TxDescriptions')
      const TxDescriptionsItem = pickReactComponent(TuffexReact, 'TxDescriptionsItem')
      return React.createElement(
        TxDescriptions,
        { columns: 2, size: 'sm' },
        React.createElement(TxDescriptionsItem, { label: locale === 'zh' ? '套件' : 'Suite' }, 'Basics (99/99)'),
        React.createElement(TxDescriptionsItem, { label: locale === 'zh' ? '协议' : 'License' }, 'MIT'),
      )
    },
  },

  'sortable-list': {
    id: 'sortable-list',
    wcTag: 'tx-sortable-list',
    wcCode: () => `<tx-sortable-list
  handle
  model-value='[{"id":"tokens","label":"Design Tokens"},{"id":"react","label":"React Adapter"},{"id":"wc","label":"Web Components"}]'
></tx-sortable-list>`,
    reactCode: () => `import { useState } from 'react'
import { TxSortableList } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function SortableListDemo() {
  const [items, setItems] = useState([
    { id: 'tokens', label: 'Design Tokens' },
    { id: 'react', label: 'React Adapter' },
    { id: 'wc', label: 'Web Components' },
  ])
  return <TxSortableList value={items} handle onChange={setItems} />
}`,
    mountWc: (container) => {
      const disposers: Array<() => void> = []
      const initial = [
        { id: 'tokens', label: 'Design Tokens' },
        { id: 'react', label: 'React Adapter' },
        { id: 'wc', label: 'Web Components' },
      ]
      const readout = createStatusReadout('tokens → react → wc')
      const el = createWcEl('tx-sortable-list', {
        attrs: { handle: true, 'model-value': JSON.stringify(initial) },
        props: { handle: true, modelValue: initial },
        events: {
          'update:model-value': (event: Event) => {
            const next = unpackDetail<Array<{ id: string }>>(event) ?? initial
            readout.textContent = next.map(item => item.id).join(' → ')
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact) => {
      const TxSortableList = pickReactComponent(TuffexReact, 'TxSortableList')
      function Demo() {
        const [items, setItems] = React.useState([
          { id: 'tokens', label: 'Design Tokens' },
          { id: 'react', label: 'React Adapter' },
          { id: 'wc', label: 'Web Components' },
        ])
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxSortableList, { value: items, handle: true, onChange: (next: typeof items) => setItems(Array.isArray(next) ? next : items) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, items.map(item => item.id).join(' → ')),
        )
      }
      return React.createElement(Demo)
    },
  },

  transfer: {
    id: 'transfer',
    wcTag: 'tx-transfer',
    wcCode: locale => `<tx-transfer
  filterable
  titles='${JSON.stringify(locale === 'zh' ? ['可用模块', '已启用'] : ['Available', 'Enabled'])}'
  model-value='["react","wc"]'
  data='[{"key":"vue","label":"Vue 3"},{"key":"react","label":"React 19"},{"key":"wc","label":"Web Components"},{"key":"core","label":"TuffEx Core"}]'
></tx-transfer>`,
    reactCode: locale => `import { useState } from 'react'
import { TxTransfer } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function TransferDemo() {
  const [target, setTarget] = useState<Array<string | number>>(['react', 'wc'])
  return (
    <TxTransfer
      value={target}
      onChange={setTarget}
      filterable
      titles={['${locale === 'zh' ? '可用模块' : 'Available'}', '${locale === 'zh' ? '已启用' : 'Enabled'}']}
      data={[
        { key: 'vue', label: 'Vue 3' },
        { key: 'react', label: 'React 19' },
        { key: 'wc', label: 'Web Components' },
        { key: 'core', label: 'TuffEx Core' },
      ]}
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const data = [
        { key: 'vue', label: 'Vue 3' },
        { key: 'react', label: 'React 19' },
        { key: 'wc', label: 'Web Components' },
        { key: 'core', label: 'TuffEx Core' },
      ]
      const titles: [string, string] = locale === 'zh' ? ['可用模块', '已启用'] : ['Available', 'Enabled']
      const initial = ['react', 'wc']
      const readout = createStatusReadout(locale === 'zh' ? '已启用: 2' : 'Enabled: 2')
      const el = createWcEl('tx-transfer', {
        attrs: { filterable: true, titles: JSON.stringify(titles), 'model-value': JSON.stringify(initial), data: JSON.stringify(data) },
        props: { filterable: true, titles, modelValue: initial, data },
        events: {
          'update:model-value': (event: Event) => {
            const next = unpackDetail<unknown[]>(event) ?? []
            readout.textContent = locale === 'zh' ? `已启用: ${next.length}` : `Enabled: ${next.length}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxTransfer = pickReactComponent(TuffexReact, 'TxTransfer')
      const data = [
        { key: 'vue', label: 'Vue 3' },
        { key: 'react', label: 'React 19' },
        { key: 'wc', label: 'Web Components' },
        { key: 'core', label: 'TuffEx Core' },
      ]
      const titles: [string, string] = locale === 'zh' ? ['可用模块', '已启用'] : ['Available', 'Enabled']
      function Demo() {
        const [target, setTarget] = React.useState<Array<string | number>>(['react', 'wc'])
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxTransfer, { value: target, data, titles, filterable: true, onChange: (next: Array<string | number>) => setTarget(Array.isArray(next) ? next : []) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `已启用: ${target.length}` : `Enabled: ${target.length}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'file-uploader': {
    id: 'file-uploader',
    wcTag: 'tx-file-uploader',
    wcCode: locale => `<tx-file-uploader
  multiple
  allow-drop
  accept=".json,.md,.ts"
  button-text="${locale === 'zh' ? '选择文件' : 'Choose files'}"
  drop-text="${locale === 'zh' ? '拖拽配置文件至此' : 'Drop config files here'}"
></tx-file-uploader>`,
    reactCode: locale => `import { useState } from 'react'
import { TxFileUploader } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function FileUploaderDemo() {
  const [files, setFiles] = useState([])
  return (
    <TxFileUploader
      value={files}
      onChange={setFiles}
      multiple
      allowDrop
      accept=".json,.md,.ts"
      buttonText="${locale === 'zh' ? '选择文件' : 'Choose files'}"
      dropText="${locale === 'zh' ? '拖拽配置文件至此' : 'Drop config files here'}"
    />
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '文件数: 0' : 'Files: 0')
      const el = createWcEl('tx-file-uploader', {
        attrs: {
          multiple: true,
          'allow-drop': true,
          accept: '.json,.md,.ts',
          'button-text': locale === 'zh' ? '选择文件' : 'Choose files',
          'drop-text': locale === 'zh' ? '拖拽配置文件至此' : 'Drop config files here',
        },
        events: {
          'update:model-value': (event: Event) => {
            const list = unpackDetail<unknown[]>(event) ?? []
            readout.textContent = locale === 'zh' ? `文件数: ${list.length}` : `Files: ${list.length}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxFileUploader = pickReactComponent(TuffexReact, 'TxFileUploader')
      function Demo() {
        const [files, setFiles] = React.useState<unknown[]>([])
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxFileUploader, {
            value: files,
            onChange: (next: unknown[]) => setFiles(Array.isArray(next) ? next : []),
            multiple: true,
            allowDrop: true,
            accept: '.json,.md,.ts',
            buttonText: locale === 'zh' ? '选择文件' : 'Choose files',
            dropText: locale === 'zh' ? '拖拽配置文件至此' : 'Drop config files here',
          }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `文件数: ${files.length}` : `Files: ${files.length}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'image-uploader': {
    id: 'image-uploader',
    wcTag: 'tx-image-uploader',
    wcCode: locale => `<tx-image-uploader multiple max="4" upload-text="${locale === 'zh' ? '上传图片' : 'Upload image'}"></tx-image-uploader>`,
    reactCode: locale => `import { useState } from 'react'
import { TxImageUploader } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ImageUploaderDemo() {
  const [images, setImages] = useState([])
  return <TxImageUploader value={images} onChange={setImages} multiple max={4} uploadText="${locale === 'zh' ? '上传图片' : 'Upload image'}" />
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '已选图片: 0' : 'Images: 0')
      const el = createWcEl('tx-image-uploader', {
        attrs: { multiple: true, max: 4, 'upload-text': locale === 'zh' ? '上传图片' : 'Upload image' },
        props: { modelValue: [], multiple: true, max: 4 },
        events: {
          'update:model-value': (event: Event) => {
            const list = unpackDetail<unknown[]>(event) ?? []
            readout.textContent = locale === 'zh' ? `已选图片: ${list.length}` : `Images: ${list.length}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout], true))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxImageUploader = pickReactComponent(TuffexReact, 'TxImageUploader')
      function Demo() {
        const [images, setImages] = React.useState<unknown[]>([])
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__stack' },
          React.createElement(TxImageUploader, { value: images, onChange: (next: unknown[]) => setImages(Array.isArray(next) ? next : []), multiple: true, max: 4, uploadText: locale === 'zh' ? '上传图片' : 'Upload image' }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `已选图片: ${images.length}` : `Images: ${images.length}`),
        )
      }
      return React.createElement(Demo)
    },
  },

  'image-gallery': {
    id: 'image-gallery',
    wcTag: 'tx-image-gallery',
    wcCode: () => `<tx-image-gallery
  items='[{"id":"1","url":"/demo-surface.svg","name":"Surface"},{"id":"2","url":"/demo-tokens.svg","name":"Tokens"}]'
></tx-image-gallery>`,
    reactCode: () => `import { TxImageGallery } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ImageGalleryDemo() {
  return (
    <TxImageGallery
      items={[
        { id: '1', url: '/demo-surface.svg', name: 'Surface' },
        { id: '2', url: '/demo-tokens.svg', name: 'Tokens' },
      ]}
    />
  )
}`,
    mountWc: (container) => {
      const items = [
        { id: '1', url: GALLERY_IMG_A, name: 'Surface' },
        { id: '2', url: GALLERY_IMG_B, name: 'Tokens' },
        { id: '3', url: GALLERY_IMG_C, name: 'Motion' },
      ]
      const el = createWcEl('tx-image-gallery', {
        attrs: { items: JSON.stringify(items) },
        props: { items },
      })
      container.replaceChildren(createStageRow([el], true))
      return () => {}
    },
    renderReact: (React, TuffexReact) => {
      const TxImageGallery = pickReactComponent(TuffexReact, 'TxImageGallery')
      return React.createElement(TxImageGallery, {
        items: [
          { id: '1', url: GALLERY_IMG_A, name: 'Surface' },
          { id: '2', url: GALLERY_IMG_B, name: 'Tokens' },
          { id: '3', url: GALLERY_IMG_C, name: 'Motion' },
        ],
      })
    },
  },

  'image-preview': {
    id: 'image-preview',
    wcTag: 'tx-image-preview',
    wcCode: locale => `<tx-button variant="secondary">${locale === 'zh' ? '预览图片' : 'Preview image'}</tx-button>
<tx-image-preview images='["/demo-surface.svg","/demo-tokens.svg"]'></tx-image-preview>`,
    reactCode: locale => `import { useState } from 'react'
import { TxButton, TxImagePreview } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function ImagePreviewDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <TxButton variant="secondary" onClick={() => setOpen(true)}>${locale === 'zh' ? '预览图片' : 'Preview image'}</TxButton>
      <TxImagePreview open={open} onOpenChange={setOpen} images={['/demo-surface.svg', '/demo-tokens.svg']} />
    </>
  )
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const images = [GALLERY_IMG_A, GALLERY_IMG_B]
      const setOpen = (next: boolean) => {
        const el = preview as unknown as Record<string, unknown>
        el.open = next
        el.modelValue = next
        if (next)
          preview.setAttribute('open', '')
        else
          preview.removeAttribute('open')
      }
      const preview = createWcEl('tx-image-preview', {
        attrs: { images: JSON.stringify(images) },
        props: { images, open: false },
        events: {
          close: () => setOpen(false),
          'update:open': (event: Event) => {
            if (!unpackDetail(event))
              setOpen(false)
          },
        },
      }, disposers)
      const btn = createWcEl('tx-button', { attrs: { variant: 'secondary' }, text: locale === 'zh' ? '预览图片' : 'Preview image', events: { click: () => setOpen(true) } }, disposers)
      container.replaceChildren(createStageRow([btn, preview]))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxImagePreview = pickReactComponent(TuffexReact, 'TxImagePreview')
      const TxButton = pickReactComponent(TuffexReact, 'TxButton')
      function Demo() {
        const [open, setOpen] = React.useState(false)
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(TxButton, { variant: 'secondary', onClick: () => setOpen(true) }, locale === 'zh' ? '预览图片' : 'Preview image'),
          React.createElement(TxImagePreview, { open, onOpenChange: (v: boolean) => setOpen(Boolean(v)), onClose: () => setOpen(false), images: [GALLERY_IMG_A, GALLERY_IMG_B] }),
        )
      }
      return React.createElement(Demo)
    },
  },

  'icon-picker': {
    id: 'icon-picker',
    wcTag: 'tx-icon-picker',
    wcCode: () => `<tx-icon-picker model-value="emoji:🚀" shape="rounded" shape-selectable></tx-icon-picker>`,
    reactCode: () => `import { useState } from 'react'
import { TxIconPicker } from '@talex-touch/tuffex-react'
import '@talex-touch/tuffex-react/style.css'

export function IconPickerDemo() {
  const [icon, setIcon] = useState('emoji:🚀')
  return <TxIconPicker value={icon} shape="rounded" shapeSelectable onChange={setIcon} />
}`,
    mountWc: (container, locale) => {
      const disposers: Array<() => void> = []
      const readout = createStatusReadout(locale === 'zh' ? '图标: emoji:🚀' : 'Icon: emoji:🚀')
      const el = createWcEl('tx-icon-picker', {
        attrs: { 'model-value': 'emoji:🚀', shape: 'rounded', 'shape-selectable': true },
        props: { modelValue: 'emoji:🚀', shape: 'rounded', shapeSelectable: true },
        events: {
          'update:model-value': (event: Event) => {
            const next = String(unpackDetail(event) ?? 'emoji:🚀')
            readout.textContent = locale === 'zh' ? `图标: ${next}` : `Icon: ${next}`
          },
        },
      }, disposers)
      container.replaceChildren(createStageRow([el, readout]))
      return disposeAll(disposers)
    },
    renderReact: (React, TuffexReact, locale) => {
      const TxIconPicker = pickReactComponent(TuffexReact, 'TxIconPicker')
      function Demo() {
        const [icon, setIcon] = React.useState('emoji:🚀')
        return React.createElement(
          'div',
          { className: 'tuff-fw-stage__row' },
          React.createElement(TxIconPicker, { value: icon, shape: 'rounded', shapeSelectable: true, onChange: (v: string) => setIcon(String(v ?? '')) }),
          React.createElement('span', { className: 'tuff-fw-stage__readout' }, locale === 'zh' ? `图标: ${icon}` : `Icon: ${icon}`),
        )
      }
      return React.createElement(Demo)
    },
  },
}
