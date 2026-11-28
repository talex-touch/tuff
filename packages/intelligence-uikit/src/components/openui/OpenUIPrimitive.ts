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
import { icons } from '@lucide/vue'
import { computed, defineComponent, h, inject, onBeforeUnmount, provide, ref, useId } from 'vue'
import TxAiMarkdown from '../content/TxAiMarkdown.vue'
import { OPENUI_CONTEXT, OPENUI_FORM } from './context'
import OpenUIChart from './OpenUIChart.vue'
import OpenUIImage from './OpenUIImage.vue'
import '@talex-touch/tuffex/button/style.css'
import '@talex-touch/tuffex/input/style.css'
import '@talex-touch/tuffex/select/style.css'
import '@talex-touch/tuffex/checkbox/style.css'
import '@talex-touch/tuffex/slider/style.css'
import '@talex-touch/tuffex/card/style.css'
import '@talex-touch/tuffex/badge/style.css'
import '@talex-touch/tuffex/stream-markdown/style.css'
import '@talex-touch/tuffex/base-anchor/style.css'
import '@talex-touch/tuffex/base-surface/style.css'
import '@talex-touch/tuffex/card-item/style.css'
import '@talex-touch/tuffex/text-morph/style.css'

const FORM_FIELD_TYPES = new Set([
  'Input',
  'TextArea',
  'Select',
  'SegmentedControl',
  'Slider',
  'Checkbox',
  'RadioGroup',
])

const CONTAINER_TYPES = new Set(['Col', 'Row', 'Box', 'Grid', 'Card', 'Carousel', 'Form'])

function icon(name: unknown, size: unknown = 'md') {
  const pixels = ({ sm: 14, md: 18, lg: 24, xl: 32 } as Record<string, number>)[String(size)] ?? 18
  const normalized = String(name ?? '').trim().replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase()
  const key = normalized.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')
  const component = icons[key as keyof typeof icons]
  return component ? h(component, { size: pixels, strokeWidth: 1.8, 'aria-hidden': true }) : null
}

const alignments: Record<string, string> = {
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
  stretch: 'stretch',
  between: 'space-between',
}

const colors: Record<string, string> = {
  ink: '--openui-text-primary',
  regular: '--openui-text-regular',
  muted: '--openui-text-secondary',
  faint: '--openui-text-muted',
  surface: '--openui-surface-soft',
  info: '--openui-primary',
  success: '--openui-success',
  warning: '--openui-warning',
  danger: '--openui-danger',
  purple: '--openui-primary',
  pink: '--openui-danger',
}

const SAFE_HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const SAFE_FUNC_COLOR_RE = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[0-9.+%\s,/a-z-]+\)$/i
const SAFE_COLOR_KEYWORDS = new Set(['transparent', 'currentcolor'])
const SAFE_CSS_LENGTH_RE = /^(?:0|auto|inherit|initial|unset|fit-content|max-content|min-content|-?(?:\d+|\d*\.\d+)(?:px|%|em|rem|vh|vw|vmin|vmax|ch|ex))$/i

function color(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const trimmed = value.trim()
  if (!trimmed)
    return undefined
  if (Object.hasOwn(colors, trimmed))
    return `var(${colors[trimmed]})`
  const lowered = trimmed.toLowerCase()
  if (
    lowered.includes('url(')
    || lowered.includes('image-set(')
    || lowered.includes('var(')
    || lowered.includes(';')
    || lowered.includes('\\')
    || lowered.includes('{')
    || lowered.includes('}')
  ) {
    return undefined
  }
  if (SAFE_COLOR_KEYWORDS.has(lowered) || SAFE_HEX_COLOR_RE.test(trimmed) || SAFE_FUNC_COLOR_RE.test(trimmed))
    return trimmed
  return undefined
}

function length(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value))
    return `${value}px`
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (SAFE_CSS_LENGTH_RE.test(trimmed))
      return trimmed
  }
  return undefined
}

function space(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.max(0, value) * 4}px` : undefined
}

const radii: Record<string, string> = {
  sm: 'var(--openui-radius-sm)',
  md: 'var(--openui-radius-md)',
  lg: 'var(--openui-radius-lg)',
  xl: 'var(--openui-radius-xl)',
  full: 'var(--openui-radius-full)',
}

function radius(value: unknown): string | undefined {
  if (typeof value === 'string' && Object.hasOwn(radii, value))
    return radii[value]
  return length(value)
}

const badgeTones: Record<string, 'primary' | 'error' | 'success' | 'warning' | 'default'> = {
  info: 'primary',
  danger: 'error',
  success: 'success',
  warning: 'warning',
}

export default defineComponent({
  name: 'OpenUIPrimitive',
  props: {
    typeName: { type: String, required: true },
    props: { type: Object as PropType<OpenUIRenderProps['props']>, required: true },
    renderNode: { type: Function as PropType<OpenUIRenderProps['renderNode']>, default: undefined },
    nodePath: { type: String, default: undefined },
    statementId: { type: String, default: undefined },
  },
  setup(view) {
    const ctx = inject(OPENUI_CONTEXT)!
    const parentForm = inject(OPENUI_FORM, '')
    const form = view.typeName === 'Form' ? (view.statementId ?? `form-${view.typeName}`) : parentForm
    if (view.typeName === 'Form')
      provide(OPENUI_FORM, form)

    const local = ref<unknown>(undefined)
    const fieldUid = useId()

    /** Evaluates only this element's immediate props inside its own reactive scope. */
    const resolvedProps = computed(() => ctx.evaluateProps(view.typeName, view.props))

    const renderChild = (child: unknown, childPath = 'children'): VNodeChild => {
      if (view.renderNode)
        return view.renderNode(child, childPath)
      const base = view.nodePath ?? view.statementId ?? 'root'
      return ctx.renderNode(child, `${base}.${childPath}`)
    }

    if (form && FORM_FIELD_TYPES.has(view.typeName)) {
      const unregister = ctx.registerField(form, () => {
        const p = resolvedProps.value
        const field = view.typeName === 'Checkbox' ? p.checked : p.value
        return {
          label: String(p.label ?? view.statementId ?? view.typeName),
          value: isReactiveAssign(field)
            ? ctx.store.get(field.target)
            : local.value === undefined ? field : local.value,
        }
      })
      onBeforeUnmount(unregister)
    }

    return () => {
      const p = resolvedProps.value
      const name = view.typeName

      if (CONTAINER_TYPES.has(name)) {
        const columns = Math.min(12, Math.max(1, Math.round(Number(p.columns ?? 2))))
        const gap = space(p.gap) ?? '12px'
        const minimum = p.minChildWidth
          ? `min(100%, max(${Math.max(0, Number(p.minChildWidth))}px, calc((100% - ${columns - 1} * ${gap}) / ${columns})))`
          : '0'
        const style = {
          gap: space(p.gap),
          padding: space(p.padding),
          alignItems: typeof p.align === 'string' && Object.hasOwn(alignments, p.align) ? alignments[p.align] : undefined,
          justifyContent: typeof p.justify === 'string' && Object.hasOwn(alignments, p.justify) ? alignments[p.justify] : undefined,
          flexWrap: p.wrap ? 'wrap' : undefined,
          width: length(p.width),
          height: length(p.height),
          flex: typeof p.flex === 'number' ? `${p.flex} 1 0%` : undefined,
          backgroundColor: color(p.background),
          borderRadius: radius(p.radius),
          boxShadow: p.border ? 'inset 0 0 0 1px var(--openui-border-light)' : undefined,
          flexDirection: name === 'Box' && p.direction === 'row' ? 'row' : undefined,
          gridTemplateColumns: name === 'Grid'
            ? `repeat(${p.minChildWidth ? 'auto-fit' : columns}, minmax(${minimum}, 1fr))`
            : undefined,
          '--openui-item-width': name === 'Carousel' ? length(p.itemWidth ?? 260) : undefined,
        }
        const attrs = { class: [`tx-ai-openui__${name.toLowerCase()}`, p.variant === 'soft' && 'is-soft'], style }
        if (name === 'Card') {
          return h(TxCard, {
            ...attrs,
            padding: 0,
            radius: 14,
            variant: p.variant === 'soft' ? 'plain' : 'solid',
          }, { default: () => renderChild(p.children, 'children') })
        }
        if (name === 'Form') {
          return h('form', {
            ...attrs,
            novalidate: true,
            onSubmit: (event: Event) => event.preventDefault(),
          }, [renderChild(p.children, 'children')])
        }
        return h('div', {
          ...attrs,
          ...(name === 'Carousel'
            ? { tabindex: 0, role: 'region', 'aria-label': ctx.labels.value.carousel ?? 'Carousel' }
            : {}),
        }, [renderChild(p.children, 'children')])
      }

      if (name === 'Divider')
        return h('hr', { class: 'tx-ai-openui__divider' })

      if (name === 'Spacer')
        return h('span', { class: 'tx-ai-openui__spacer', 'aria-hidden': true })

      const text = String(p.text ?? '')

      if (name === 'Title') {
        return h('div', {
          class: ['tx-ai-openui__title', `size-${p.size ?? 'md'}`],
          role: 'heading',
          'aria-level': ['xl', '2xl', '3xl'].includes(String(p.size)) ? 2 : 3,
          style: { color: color(p.color) },
        }, text)
      }

      if (name === 'Text' || name === 'Caption' || name === 'Label') {
        return h(name === 'Label' ? 'span' : 'p', {
          class: [`tx-ai-openui__${name.toLowerCase()}`, `size-${p.size ?? 'md'}`],
          style: {
            color: color(p.color),
            fontWeight: p.weight === 'semibold'
              ? 'var(--tx-font-weight-semibold, 600)'
              : p.weight === 'medium'
                ? 'var(--tx-font-weight-medium, 500)'
                : undefined,
            fontStyle: p.italic ? 'italic' : undefined,
            textDecoration: p.lineThrough ? 'line-through' : undefined,
            fontVariantNumeric: p.tabularNums ? 'tabular-nums' : undefined,
            ...(p.maxLines
              ? {
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: Number(p.maxLines),
                  overflow: 'hidden',
                }
              : {}),
          },
        }, [renderChild(p.text, 'text')])
      }

      if (name === 'Badge') {
        const tone = badgeTones[String(p.color)] ?? 'default'
        return h(TxBadge, {
          class: ['tx-ai-openui__badge', `is-tone-${tone}`],
          variant: tone,
        }, { default: () => [p.icon ? icon(p.icon, 'sm') : null, text] })
      }

      if (name === 'Markdown')
        return h(TxAiMarkdown, { content: text, streaming: ctx.streaming.value, reveal: false })

      if (name === 'Quote') {
        return h('blockquote', { class: 'tx-ai-openui__quote' }, [
          h('p', text),
          p.attribution ? h('cite', String(p.attribution)) : null,
        ])
      }

      if (name === 'Code') {
        return h('pre', { class: 'tx-ai-openui__code' }, [
          h('code', { 'data-language': p.language }, String(p.code ?? '')),
        ])
      }

      if (name === 'List') {
        const items = Array.isArray(p.items) ? p.items : []
        return h(p.marker === 'number' ? 'ol' : 'ul', {
          class: ['tx-ai-openui__list', p.marker === 'none' && 'is-unmarked', p.timeline && 'is-timeline'],
        }, items.map((item, i) => h('li', { key: i }, [renderChild(item, `items.${i}`)])))
      }

      if (name === 'ListItem') {
        return h('div', { class: 'tx-ai-openui__list-item' }, [
          p.marker ? h('span', { class: 'tx-ai-openui__marker' }, String(p.marker)) : null,
          h('strong', { class: 'tx-ai-openui__list-title' }, String(p.title ?? '')),
          p.description ? h('p', { class: 'tx-ai-openui__list-desc' }, String(p.description)) : null,
          renderChild(p.children, 'children'),
        ])
      }

      if (name === 'Image' || name === 'SearchImage')
        return h(OpenUIImage, { ...p, search: name === 'SearchImage' })

      if (name === 'Icon')
        return h('span', { class: 'tx-ai-openui__icon', style: { color: color(p.color) } }, [icon(p.name, p.size)])

      if (name === 'Chart')
        return h(OpenUIChart, { spec: p })

      if (name === 'Table') {
        const columns = Array.isArray(p.columns) ? p.columns : []
        const rows = (Array.isArray(p.rows) ? p.rows : []).filter(Array.isArray) as unknown[][]
        return h('div', {
          class: 'tx-ai-openui__table-scroll',
          tabindex: 0,
          role: 'region',
          'aria-label': ctx.labels.value.table ?? 'Data table',
        }, [
          h('table', { class: 'tx-ai-openui__table' }, [
            h('thead', [
              h('tr', columns.map((column, i) => h('th', { key: i, scope: 'col' }, String(column)))),
            ]),
            h('tbody', rows.map((row, i) =>
              h('tr', { key: i }, columns.map((_, j) =>
                h('td', { key: j, class: typeof row[j] === 'number' ? 'is-numeric' : undefined }, [
                  renderChild(row[j], `rows.${i}.${j}`),
                ]),
              )),
            )),
          ]),
        ])
      }

      // Interactive controls read streaming state and bound state keys locally.
      const disabled = ctx.streaming.value || !!p.disabled
      const label = String(p.label ?? p.placeholder ?? ctx.labels.value[name] ?? name)

      if (name === 'Link') {
        const url = /^https?:\/\//i.test(String(p.url)) ? String(p.url) : undefined
        return h('a', {
          class: 'tx-ai-openui__link',
          href: url,
          'aria-disabled': disabled,
          tabindex: disabled ? -1 : undefined,
          onClick: (event: Event) => {
            event.preventDefault()
            if (!disabled && url)
              ctx.trigger({ type: 'open_url', params: { url } })
          },
        }, text)
      }

      if (name === 'Button' || name === 'IconButton') {
        const buttonType = p.color === 'danger'
          ? 'danger'
          : p.color === 'success'
            ? 'success'
            : p.color === 'warning'
              ? 'warning'
              : 'primary'
        return h(TxButton, {
          class: ['tx-ai-openui__button', name === 'IconButton' && 'is-icon-only'],
          disabled,
          variant: p.variant === 'solid' || !p.variant ? 'flat' : p.variant === 'ghost' ? 'ghost' : 'secondary',
          border: p.variant === 'outline',
          size: p.size === 'sm' ? 'sm' : p.size === 'lg' ? 'lg' : 'md',
          block: !!p.block,
          type: buttonType,
          'aria-label': label,
          onClick: () => {
            if (!disabled)
              ctx.trigger(p.action, label, form)
          },
        }, {
          default: () => [
            p.icon ? icon(p.icon, 'sm') : null,
            name === 'Button' ? String(p.label ?? '') : null,
          ],
        })
      }

      const field = name === 'Checkbox' ? p.checked : p.value
      const value = isReactiveAssign(field)
        ? ctx.readState(field.target)
        : local.value === undefined ? field : local.value
      const update = (next: unknown) => {
        if (disabled)
          return
        if (isReactiveAssign(field))
          ctx.writeState(field.target, ctx.evaluate(field.expr, { $value: next }))
        else
          local.value = next
      }

      const controlId = `${fieldUid}-ctrl`
      const labelId = `${fieldUid}-lbl`

      // Never wrap TxSelect / RadioGroup / SegmentedControl / Slider inside <label>:
      // wrapping TxSelect causes double-toggle click bubbling, and wrapping radiogroups
      // produces nested <label> elements.
      const wrapNativeField = (control: VNodeChild) => h('div', { class: 'tx-ai-openui__field' }, [
        p.label ? h('label', { class: 'tx-ai-openui__label', for: controlId }, String(p.label)) : null,
        control,
      ])
      const wrapNamedField = (control: VNodeChild) => h('div', { class: 'tx-ai-openui__field' }, [
        p.label ? h('span', { id: labelId, class: 'tx-ai-openui__label' }, String(p.label)) : null,
        control,
      ])

      const choices = (Array.isArray(p.options) ? p.options : []).flatMap((item: unknown) => {
        if (typeof item === 'string')
          return [{ value: item, label: item }]
        if (item && typeof item === 'object' && 'value' in item)
          return [{ value: String(item.value), label: String('label' in item ? item.label : item.value) }]
        return []
      })

      if (name === 'Input') {
        return wrapNativeField(h(TxInput, {
          id: controlId,
          modelValue: String(value ?? ''),
          placeholder: String(p.placeholder ?? ''),
          disabled,
          'aria-label': label,
          inputmode: p.type === 'number' ? 'decimal' : undefined,
          'onUpdate:modelValue': (next: string | number) =>
            update(p.type === 'number'
              ? (String(next).trim() === '' ? null : Number.isFinite(Number(next)) ? Number(next) : value)
              : String(next)),
        }))
      }

      if (name === 'TextArea') {
        return wrapNativeField(h('textarea', {
          id: controlId,
          class: 'tx-ai-openui__textarea',
          rows: Math.min(20, Math.max(2, Number(p.rows ?? 3))),
          value: String(value ?? ''),
          placeholder: p.placeholder,
          disabled,
          'aria-label': label,
          onInput: (event: Event) => update((event.target as HTMLTextAreaElement).value),
        }))
      }

      if (name === 'Select') {
        return wrapNamedField(h(TxSelect, {
          modelValue: String(value ?? ''),
          options: choices,
          placeholder: String(p.placeholder ?? ctx.labels.value.choose ?? 'Choose…'),
          disabled,
          'aria-label': label,
          'aria-labelledby': p.label ? labelId : undefined,
          'onUpdate:modelValue': update,
        }))
      }

      if (name === 'Checkbox') {
        return h(TxCheckbox, {
          modelValue: !!value,
          disabled,
          'aria-label': label,
          'onUpdate:modelValue': update,
        }, { default: () => String(p.label ?? '') })
      }

      if (name === 'Slider') {
        return wrapNamedField(h(TxSlider, {
          modelValue: Number(value ?? 0),
          min: Number(p.min ?? 0),
          max: Number(p.max ?? 100),
          step: Number(p.step ?? 1),
          disabled,
          ariaLabel: label,
          showValue: p.showValue !== false,
          thumbSurface: false,
          tooltipMotion: 'none',
          'onUpdate:modelValue': update,
        }))
      }

      if (name === 'SegmentedControl' || name === 'RadioGroup') {
        const isSegmented = name === 'SegmentedControl'
        return wrapNamedField(h('div', {
          class: [
            'tx-ai-openui__choices',
            isSegmented && 'is-segmented',
            isSegmented && p.block && 'is-block',
            disabled && 'is-disabled',
          ],
          role: 'radiogroup',
          'aria-label': label,
          'aria-labelledby': p.label ? labelId : undefined,
        }, choices.map(choice =>
          h('label', {
            key: choice.value,
            class: ['tx-ai-openui__choice', value === choice.value && 'is-selected', disabled && 'is-disabled'],
          }, [
            h('input', {
              type: 'radio',
              name: fieldUid,
              value: choice.value,
              checked: value === choice.value,
              disabled,
              onChange: () => update(choice.value),
            }),
            h('span', { class: 'tx-ai-openui__choice-label' }, choice.label),
          ]),
        )))
      }

      return null
    }
  },
})
