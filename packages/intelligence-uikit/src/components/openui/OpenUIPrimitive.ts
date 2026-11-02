import type { PropType, VNodeChild } from 'vue'
import type { OpenUIRenderProps } from './context'
import { isReactiveAssign } from '@openuidev/lang-core'
import { TxBadge } from '@talex-touch/tuffex/badge'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCard } from '@talex-touch/tuffex/card'
import { TxCheckbox } from '@talex-touch/tuffex/checkbox'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxSlider } from '@talex-touch/tuffex/slider'
import { defineComponent, h, inject, provide, ref } from 'vue'
import TxAiMarkdown from '../content/TxAiMarkdown.vue'
import { OPENUI_CONTEXT, OPENUI_FORM } from './context'
import OpenUIChart from './OpenUIChart.vue'
import OpenUIImage from './OpenUIImage.vue'

const iconPaths: Record<string, string> = {
  'plus': 'M12 5v14M5 12h14',
  'minus': 'M5 12h14',
  'check': 'm5 12 4 4L19 6',
  'arrow-right': 'M4 12h16m-6-6 6 6-6 6',
  'arrow-left': 'M20 12H4m6-6-6 6 6 6',
  'heart': 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  'star': 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9Z',
  'search': 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  'copy': 'M9 9h12v12H9ZM15 5V3H3v12h2',
  'clock': 'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  'map-pin': 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  'info': 'M12 11v6m0-10v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  'circle': 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  'check-circle': 'm7 12 3 3 7-7M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
}
function icon(name: unknown, size: unknown = 'md') {
  const pixels = ({ sm: 14, md: 18, lg: 24, xl: 32 } as Record<string, number>)[String(size)] ?? 18
  const path = iconPaths[String(name)]
  return path
    ? h('svg', { viewBox: '0 0 24 24', width: pixels, height: pixels, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true }, [h('path', { d: path })])
    : h('span', { role: 'img', 'aria-label': String(name), class: 'tx-ai-openui__unknown-icon' }, String(name))
}
const alignments: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', stretch: 'stretch', between: 'space-between' }
const colors: Record<string, string> = { ink: '--tx-text-color-primary', muted: '--tx-text-color-secondary', faint: '--tx-text-color-placeholder', surface: '--tx-fill-color-light', info: '--tx-color-primary', success: '--tx-color-success', warning: '--tx-color-warning', danger: '--tx-color-danger', purple: '--tx-color-primary', pink: '--tx-color-danger' }
function color(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return colors[value] ? `var(${colors[value]})` : value
}
function length(value: unknown): string | undefined {
  return typeof value === 'number' ? `${value}px` : typeof value === 'string' ? value : undefined
}
function space(value: unknown): string | undefined {
  return typeof value === 'number' ? `${Math.max(0, value) * 4}px` : undefined
}
function radius(value: unknown): string | undefined {
  return ({ sm: '4px', md: '8px', lg: '12px', xl: '20px', full: '999px' } as Record<string, string>)[String(value)] ?? length(value)
}

export default defineComponent({
  name: 'OpenUIPrimitive',
  props: {
    typeName: { type: String, required: true },
    props: { type: Object as PropType<OpenUIRenderProps['props']>, required: true },
    renderNode: { type: Function as PropType<OpenUIRenderProps['renderNode']>, required: true },
    statementId: String,
  },
  setup(view) {
    const ctx = inject(OPENUI_CONTEXT)!
    const parentForm = inject(OPENUI_FORM, '')
    const form = view.typeName === 'Form' ? (view.statementId ?? `form-${view.typeName}`) : parentForm
    if (view.typeName === 'Form') provide(OPENUI_FORM, form)
    const local = ref<unknown>(undefined)
    return () => {
      void ctx.version.value
      const p = view.props
      const name = view.typeName
      const render = view.renderNode
      const text = String(p.text ?? '')
      const disabled = ctx.streaming.value || !!p.disabled
      const field = name === 'Checkbox' ? p.checked : p.value
      const value = isReactiveAssign(field) ? ctx.store.get(field.target) : local.value === undefined ? field : local.value
      const label = String(p.label ?? p.placeholder ?? view.statementId ?? name)
      const update = (next: unknown) => {
        if (disabled) return
        if (isReactiveAssign(field)) ctx.store.set(field.target, ctx.evaluate(field.expr, { $value: next }))
        else local.value = next
        if (form) {
          const previous = ctx.store.get(form)
          ctx.store.set(form, { ...(previous && typeof previous === 'object' ? previous : {}), [label]: next })
        }
      }
      const wrapField = (control: VNodeChild) => h('label', { class: 'tx-ai-openui__field' }, [p.label ? h('span', { class: 'tx-ai-openui__label' }, String(p.label)) : null, control])
      const choices = (Array.isArray(p.options) ? p.options : []).flatMap((item: unknown) => {
        if (typeof item === 'string') return [{ value: item, label: item }]
        if (item && typeof item === 'object' && 'value' in item) return [{ value: String(item.value), label: String('label' in item ? item.label : item.value) }]
        return []
      })
      if (['Col', 'Row', 'Box', 'Grid', 'Card', 'Carousel', 'Form'].includes(name)) {
        const style = {
          gap: space(p.gap), padding: space(p.padding), alignItems: alignments[String(p.align)], justifyContent: alignments[String(p.justify)],
          flexWrap: p.wrap ? 'wrap' : undefined, width: length(p.width), height: length(p.height), flex: typeof p.flex === 'number' ? `${p.flex} 1 0%` : undefined,
          background: color(p.background), borderRadius: radius(p.radius), boxShadow: p.border ? 'inset 0 0 0 1px var(--tx-border-color-light)' : undefined,
          flexDirection: name === 'Box' && p.direction === 'row' ? 'row' : undefined,
          gridTemplateColumns: name === 'Grid' ? `repeat(${p.minChildWidth ? 'auto-fit' : Math.min(12, Math.max(1, Number(p.columns ?? 2)))}, minmax(${p.minChildWidth ? `min(100%, ${Number(p.minChildWidth)}px)` : '0'}, 1fr))` : undefined,
          '--openui-item-width': length(p.itemWidth ?? 260),
        }
        const attrs = { class: [`tx-ai-openui__${name.toLowerCase()}`, p.variant === 'soft' && 'is-soft'], style }
        if (name === 'Card') return h(TxCard, { ...attrs, padding: 0 }, { default: () => render(p.children, 'children') })
        if (name === 'Form') return h('form', { ...attrs, onSubmit: (event: Event) => event.preventDefault() }, [render(p.children, 'children')])
        return h('div', { ...attrs, ...(name === 'Carousel' ? { tabindex: 0, role: 'region', 'aria-label': ctx.labels.value.carousel ?? 'Carousel' } : {}) }, [render(p.children, 'children')])
      }
      if (name === 'Divider') return h('hr', { class: 'tx-ai-openui__divider' })
      if (name === 'Spacer') return h('span', { class: 'tx-ai-openui__spacer', 'aria-hidden': true })
      if (name === 'Title') return h('div', { class: ['tx-ai-openui__title', `size-${p.size ?? 'md'}`], role: 'heading', 'aria-level': ['xl', '2xl', '3xl'].includes(String(p.size)) ? 2 : 3, style: { color: color(p.color) } }, text)
      if (name === 'Text' || name === 'Caption' || name === 'Label') return h(name === 'Label' ? 'span' : 'p', { class: [`tx-ai-openui__${name.toLowerCase()}`, `size-${p.size ?? 'md'}`], style: { color: color(p.color), fontWeight: p.weight === 'semibold' ? 600 : p.weight === 'medium' ? 500 : undefined, fontStyle: p.italic ? 'italic' : undefined, textDecoration: p.lineThrough ? 'line-through' : undefined, fontVariantNumeric: p.tabularNums ? 'tabular-nums' : undefined, ...(p.maxLines ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: Number(p.maxLines), overflow: 'hidden' } : {}) } }, [render(p.text, 'text')])
      if (name === 'Badge') return h(TxBadge, { variant: ({ info: 'primary', danger: 'error', success: 'success', warning: 'warning' } as const)[String(p.color) as 'info'] ?? 'default' }, { default: () => [p.icon ? icon(p.icon, 'sm') : null, text] })
      if (name === 'Link') {
        const url = /^https?:\/\//i.test(String(p.url)) ? String(p.url) : undefined
        return h('a', { class: 'tx-ai-openui__link', href: url, 'aria-disabled': disabled, onClick: (event: Event) => { event.preventDefault(); if (!disabled && url) ctx.trigger({ type: 'open_url', params: { url } }) } }, text)
      }
      if (name === 'Markdown') return h(TxAiMarkdown, { content: text, streaming: ctx.streaming.value, reveal: false })
      if (name === 'Quote') return h('blockquote', { class: 'tx-ai-openui__quote' }, [h('p', text), p.attribution ? h('cite', String(p.attribution)) : null])
      if (name === 'Code') return h('pre', { class: 'tx-ai-openui__code' }, [h('code', { 'data-language': p.language }, String(p.code ?? ''))])
      if (name === 'List') return h(p.marker === 'number' ? 'ol' : 'ul', { class: ['tx-ai-openui__list', p.marker === 'none' && 'is-unmarked', p.timeline && 'is-timeline'] }, (Array.isArray(p.items) ? p.items : []).map((item, i) => h('li', { key: i }, [render(item, `items.${i}`)])))
      if (name === 'ListItem') return h('div', { class: 'tx-ai-openui__list-item' }, [p.marker ? h('span', { class: 'tx-ai-openui__marker' }, String(p.marker)) : null, h('strong', String(p.title ?? '')), p.description ? h('p', String(p.description)) : null, render(p.children, 'children')])
      if (name === 'Button' || name === 'IconButton') return h(TxButton, { disabled, variant: p.variant === 'solid' || !p.variant ? 'flat' : p.variant === 'ghost' ? 'ghost' : 'secondary', border: p.variant === 'outline', size: p.size === 'sm' ? 'sm' : p.size === 'lg' ? 'lg' : 'md', block: !!p.block, type: p.color === 'danger' ? 'danger' : p.color === 'success' ? 'success' : 'primary', 'aria-label': label, onClick: () => { if (!disabled) ctx.trigger(p.action, label, form) } }, { default: () => [p.icon ? icon(p.icon, 'sm') : null, name === 'Button' ? String(p.label ?? '') : null] })
      if (name === 'Input') return wrapField(h(TxInput, { modelValue: String(value ?? ''), placeholder: String(p.placeholder ?? ''), disabled, 'aria-label': label, inputmode: p.type === 'number' ? 'decimal' : undefined, 'onUpdate:modelValue': (next: string | number) => update(p.type === 'number' ? (String(next).trim() === '' ? null : Number.isFinite(Number(next)) ? Number(next) : value) : String(next)) }))
      if (name === 'TextArea') return wrapField(h('textarea', { class: 'tx-ai-openui__textarea', rows: Math.min(20, Math.max(2, Number(p.rows ?? 3))), value: String(value ?? ''), placeholder: p.placeholder, disabled, 'aria-label': label, onInput: (event: Event) => update((event.target as HTMLTextAreaElement).value) }))
      if (name === 'Select') return wrapField(h(TxSelect, { modelValue: String(value ?? ''), options: choices, placeholder: String(p.placeholder ?? ctx.labels.value.choose ?? 'Choose…'), disabled, 'aria-label': label, 'onUpdate:modelValue': update }))
      if (name === 'Checkbox') return h(TxCheckbox, { modelValue: !!value, disabled, 'aria-label': label, 'onUpdate:modelValue': update }, { default: () => String(p.label ?? '') })
      if (name === 'Slider') return wrapField(h(TxSlider, { modelValue: Number(value ?? 0), min: Number(p.min ?? 0), max: Number(p.max ?? 100), step: Number(p.step ?? 1), disabled, ariaLabel: label, showValue: p.showValue !== false, thumbSurface: false, tooltipMotion: 'none', 'onUpdate:modelValue': update }))
      if (name === 'SegmentedControl' || name === 'RadioGroup') return wrapField(h('div', { class: ['tx-ai-openui__choices', name === 'SegmentedControl' && 'is-segmented'], role: 'radiogroup', 'aria-label': label }, choices.map(choice => h('label', { key: choice.value, class: ['tx-ai-openui__choice', value === choice.value && 'is-selected'] }, [h('input', { type: 'radio', name: view.statementId ?? label, value: choice.value, checked: value === choice.value, disabled, onChange: () => update(choice.value) }), choice.label]))))
      if (name === 'Image' || name === 'SearchImage') return h(OpenUIImage, { ...p, search: name === 'SearchImage' })
      if (name === 'Icon') return h('span', { class: 'tx-ai-openui__icon', style: { color: color(p.color) } }, [icon(p.name, p.size)])
      if (name === 'Chart') return h(OpenUIChart, { spec: p })
      if (name === 'Table') {
        const columns = Array.isArray(p.columns) ? p.columns : []
        const rows = (Array.isArray(p.rows) ? p.rows : []).filter(Array.isArray) as unknown[][]
        return h('div', { class: 'tx-ai-openui__table-scroll', tabindex: 0 }, [h('table', { class: 'tx-ai-openui__table' }, [h('thead', [h('tr', columns.map((column, i) => h('th', { key: i, scope: 'col' }, String(column))))]), h('tbody', rows.map((row, i) => h('tr', { key: i }, columns.map((_, j) => h('td', { key: j, class: typeof row[j] === 'number' ? 'is-numeric' : undefined }, [render(row[j], `rows.${i}.${j}`)])))))])])
      }
      return null
    }
  },
})
