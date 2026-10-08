<script setup lang="ts">
// Source: Amicro css-animations UIkit. MIT — Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { TxSelectModelValue } from '../../select/src/types'
import type { MotionControlEmits, MotionControlItem, MotionControlProps, MotionControlValue } from './types'
import { computed, nextTick, ref, useSlots, watch } from 'vue'
import { useMotionActivity } from '../../../../utils/motion-activity'
import TxContextMenu from '../../context-menu/src/TxContextMenu.vue'
import TxDropdownMenu from '../../dropdown-menu/src/TxDropdownMenu.vue'
import { resolveTransition } from '../../liquid/src/spring'
import TxPagination from '../../pagination/src/TxPagination.vue'
import TxSelect from '../../select/src/TxSelect.vue'
import TxTabItem from '../../tabs/src/TxTabItem.vue'
import TxTabs from '../../tabs/src/TxTabs.vue'
import TxTextMorph from '../../text-morph/src/TxTextMorph.vue'
import TxTooltip from '../../tooltip/src/TxTooltip.vue'
import { useMotionControlTabList } from './motion-control-tab-list'
import MotionControlIcon from './MotionControlIcon.vue'
import MotionControlMenuItems from './MotionControlMenuItems.vue'
import { MOTION_CONTROL_DEFAULT_LABELS } from './types'

defineOptions({ name: 'TxMotionControl' })
const props = withDefaults(defineProps<MotionControlProps>(), {
  variant: 'yui-category-select', modelValue: undefined, options: () => [], items: () => [],
  count: undefined, min: 0, max: undefined, step: 1, disabled: false, size: 'md',
  status: 'idle', progress: 0, open: undefined, animated: true, label: '',
  tooltip: '', href: '', target: '_self', newItem: undefined, maxItems: undefined,
  minItems: 0, canBack: true, canForward: true, labels: () => ({}),
})
const emit = defineEmits<MotionControlEmits>()
const root = ref<HTMLElement | null>(null)
const internalValue = ref<MotionControlValue>()
const internalOpen = ref(false)
const dotsPulse = ref<0 | 1 | 2>(0)
const activity = useMotionActivity(root, () => props.animated)
const slots = useSlots()
const motion = computed(() => activity.active.value && !activity.reduced.value)
const labels = computed(() => ({ ...MOTION_CONTROL_DEFAULT_LABELS, ...props.labels }))
const spring = resolveTransition({ stiffness: 320, damping: 22, mass: 1 })
const springStyle = { '--tx-mc-duration': `${spring.duration}ms`, '--tx-mc-ease': spring.easing }
const choices = computed(() => props.options.length ? props.options : props.items)
const total = computed(() => {
  const fallback = ['yui-segmented-step-bar', 'yui-progress-stepper'].includes(props.variant) ? 3 : 4
  return Math.max(1, Math.trunc(Number.isFinite(props.count) ? props.count! : fallback))
})
const numeric = computed(() => typeof value.value === 'number' && Number.isFinite(value.value) ? value.value : props.min)
const value = computed<MotionControlValue>(() => {
  if (props.modelValue !== undefined)
    return props.modelValue
  if (internalValue.value !== undefined)
    return internalValue.value
  if (['yui-save-pill', 'follow-check-button', 'pip-mode-icons', 'yui-light-dark-toggle'].includes(props.variant))
    return false
  if (props.variant === 'yui-plus-minus-toggle')
    return 'plus'
  if (['yui-perspective-layout', 'list-column-toggle', 'compact-mode-switch'].includes(props.variant))
    return 'grid'
  if (choices.value.length)
    return choices.value.find(item => !item.disabled)?.value ?? ''
  return ['yui-stepper-dots', 'pagination-numbered-bubble', 'yui-progress-stepper'].includes(props.variant) ? 1 : props.min
})
const { closingTabs, displayedTabs, closeTab, closingTab, finishClosingTab, addTab } = useMotionControlTabList({ props, root, motion, value, setValue, emit })
const expanded = computed({ get: () => props.open ?? internalOpen.value, set: setOpen })
const selectedItem = computed(() => choices.value.find(item => item.value === value.value))
const selectedText = computed(() => selectedItem.value?.label ?? props.label ?? '')
const tabValue = computed(() => String(value.value))
const tabsVariant = computed(() => ['yui-filter-tag-pill', 'yui-ab-tabs', 'yui-date-position', 'tab-bar', 'compact-mode-switch'].includes(props.variant))
const tabChoices = computed<MotionControlItem[]>(() => {
  if (props.variant === 'yui-multi-tab-close') return props.items
  if (props.variant === 'compact-mode-switch' && !choices.value.length)
    return [{ value: 'grid', label: labels.value.grid, icon: 'grid' }, { value: 'list', label: labels.value.list, icon: 'list' }]
  return choices.value
})
const isCounter = computed(() => ['quantity-counter', 'simple-plus-minus-btn', 'yui-wheel-counter'].includes(props.variant))
const pages = computed(() => Math.min(total.value, Math.max(1, Math.trunc(numeric.value))))
const level = computed(() => Math.min(total.value, Math.max(0, Math.trunc(numeric.value))))
const percent = computed(() => Math.min(100, Math.max(0, numeric.value)))
const steps = computed<MotionControlItem[]>(() => choices.value.length ? choices.value : Array.from({ length: total.value }, (_, index) => ({ value: index + 1, label: String(index + 1) })))
const activeStep = computed(() => Math.max(0, steps.value.findIndex(item => item.value === value.value)))
const lineScale = computed(() => steps.value.length <= 1 ? 0 : activeStep.value / (steps.value.length - 1))
const layout = computed(() => String(value.value))
const layoutLabel = computed(() => layout.value === 'stack' ? labels.value.stack : layout.value === 'list' ? labels.value.list : labels.value.grid)
const toggleText = computed(() => props.variant === 'yui-save-pill' ? (value.value ? labels.value.saved : labels.value.save) : (value.value ? labels.value.following : labels.value.follow))
const downloadText = computed(() => ({ idle: labels.value.download, loading: labels.value.downloading, success: labels.value.downloaded, error: labels.value.downloadError })[props.status])
const anchorAnimation = computed(() => ({
  type: motion.value ? 'expand' as const : 'none' as const,
  duration: props.variant === 'question-tooltip' ? 350 : 200,
  scale: props.variant === 'yui-context-menu' ? 0.88 : props.variant === 'yui-glance-preview' ? 0.92 : ['question-tooltip', 'yui-hover-link'].includes(props.variant) ? 0.9 : 0.95,
  distance: 6, blur: 0,
}))
const tooltipAnchor = computed(() => ({ placement: 'top' as const, offset: 8, animation: anchorAnimation.value, panelBackground: 'pure' as const }))
const tabsAnimation = computed(() => ({
  size: motion.value, nav: motion.value,
  indicator: { enabled: motion.value, durationMs: props.variant === 'frequency-selector' ? 500 : ['yui-ab-tabs', 'yui-date-position'].includes(props.variant) ? 400 : 350, easing: spring.easing },
  content: false,
}))

watch(() => props.variant, () => { internalValue.value = undefined; internalOpen.value = false; closingTabs.value = []; dotsPulse.value = 0 })
watch(() => props.disabled, (disabled) => { if (disabled) setOpen(false) })
watch(activity.present, (present) => { if (!present && expanded.value) setOpen(false) })
watch(motion, (enabled) => { if (!enabled) { closingTabs.value = []; dotsPulse.value = 0 } })

function setOpen(open: boolean) {
  if (props.disabled && open)
    return
  if (expanded.value === open)
    return
  internalOpen.value = open
  emit('update:open', open)
}
function setValue(next: MotionControlValue) {
  if (props.disabled || value.value === next)
    return
  internalValue.value = next
  emit('update:modelValue', next)
  emit('change', next)
}
function select(item: MotionControlItem) {
  if (props.disabled || item.disabled)
    return
  setValue(item.value)
  emit('select', item)
}
function selectTab(name: string) {
  const item = tabChoices.value.find(item => String(item.value) === name)
  if (item) select(item)
}
function selectCategory(next: TxSelectModelValue) {
  if (Array.isArray(next)) return
  const item = choices.value.find(item => item.value === next)
  if (item) select(item)
}
function command(item: MotionControlItem) {
  if (props.disabled || item.disabled) return
  select(item)
  emit('action', { variant: props.variant, value: item.value, item })
}
function action(next = value.value) {
  if (!props.disabled) emit('action', { variant: props.variant, value: next })
}
function toggle() {
  if (props.disabled) return
  const next = !value.value
  setValue(next)
  action(next)
}
function changeLayout() {
  if (props.disabled) return
  const next = layout.value === 'grid' ? (props.variant === 'yui-perspective-layout' ? 'stack' : 'list') : 'grid'
  setValue(next)
  action(next)
}
function changeCount(direction: number) {
  const increment = Number.isFinite(props.step) && props.step > 0 ? props.step : 1
  const next = Math.min(props.max ?? Number.POSITIVE_INFINITY, Math.max(props.min, Number((numeric.value + direction * increment).toPrecision(12))))
  setValue(next)
}
function counterKey(event: KeyboardEvent) {
  if (!isCounter.value || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  if (event.key === 'Home') setValue(props.min)
  else if (event.key === 'End' && props.max !== undefined) setValue(props.max)
  else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') changeCount(event.key === 'ArrowUp' ? 1 : -1)
}
function nextLevel() { setValue(level.value >= total.value ? 1 : level.value + 1) }
function nextProgress() {
  const increment = Number.isFinite(props.step) && props.step > 0 ? props.step : 1
  setValue(percent.value >= 100 ? 0 : Math.min(100, percent.value + increment))
}
function navigate(direction: 'back' | 'forward') {
  if (props.disabled || (direction === 'back' ? !props.canBack : !props.canForward)) return
  emit('navigate', direction)
}
function download() { if (!props.disabled && props.status !== 'loading') emit('download') }
function replayDots() {
  if (!props.disabled && motion.value && props.variant === 'menu-dots-expand')
    dotsPulse.value = dotsPulse.value === 1 ? 2 : 1
}
function confirmFrequency() {
  setOpen(false)
  action()
  nextTick(() => root.value?.querySelector<HTMLElement>('.tx-motion-control__frequency-trigger')?.focus({ preventScroll: true }))
}
function focusFrequency() {
  const selector = expanded.value ? '[role="tab"][aria-selected="true"]' : '.tx-motion-control__frequency-trigger'
  root.value?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true })
}
</script>

<template>
  <div ref="root" class="tx-motion-control" :class="[`tx-motion-control--${variant}`, `tx-motion-control--${size}`, { 'is-motion': motion, 'is-disabled': disabled, 'is-selected': !!value, 'is-loading': status === 'loading', 'has-panels': !!slots.panel, 'is-dots-a': dotsPulse === 1, 'is-dots-b': dotsPulse === 2 }]" :style="springStyle" :data-variant="variant" @keydown="counterKey">
    <TxSelect v-if="variant === 'yui-category-select'" :model-value="typeof value === 'boolean' ? '' : value" :options="choices" :disabled="disabled" :placeholder="label || labels.choose" :aria-label="label || labels.choose" :empty-text="labels.choose" :animation="anchorAnimation" panel-background="pure" :panel-radius="16" @update:model-value="selectCategory" />

    <div v-else-if="variant === 'frequency-selector'" class="tx-motion-control__frequency" :class="{ 'is-expanded': expanded }" @keydown.esc.stop="setOpen(false)">
      <span class="tx-motion-control__frequency-label">{{ label || labels.frequency }}</span>
      <Transition name="tx-mc-frequency" mode="out-in" @after-enter="focusFrequency">
        <div v-if="expanded" key="expanded" class="tx-motion-control__frequency-options">
          <TxTabs :model-value="tabValue" placement="top" borderless :content-padding="0" indicator-variant="pill" indicator-motion="spring" :animation="tabsAnimation" @update:model-value="selectTab">
            <TxTabItem v-for="item in choices" :key="item.value" :name="String(item.value)" :disabled="disabled || item.disabled">
<template #name>
{{ item.label }}
</template>
</TxTabItem>
          </TxTabs>
          <button type="button" class="tx-motion-control__button tx-motion-control__icon-button" :disabled="disabled" :aria-label="labels.confirm" @click="confirmFrequency">
<MotionControlIcon name="check" />
</button>
        </div>
        <button v-else key="collapsed" type="button" class="tx-motion-control__button tx-motion-control__frequency-trigger" :disabled="disabled" :aria-expanded="expanded" :aria-label="`${label || labels.frequency}: ${selectedText}`" @click="setOpen(true)">
          <TxTextMorph :text="selectedText || labels.choose" :disabled="!motion" /><MotionControlIcon name="down" />
        </button>
      </Transition>
    </div>

    <TxTabs v-else-if="tabsVariant" :model-value="tabValue" placement="top" borderless :content-padding="0" :show-indicator="variant !== 'tab-bar'" indicator-variant="pill" indicator-motion="spring" :animation="tabsAnimation" @update:model-value="selectTab">
      <TxTabItem v-for="item in tabChoices" :key="item.value" :name="String(item.value)" :disabled="disabled || item.disabled" :aria-label="item.label">
        <template v-if="item.icon" #icon>
<slot name="icon" :item="item" :active="item.value === value">
<MotionControlIcon v-if="variant === 'compact-mode-switch'" :name="item.icon" /><span v-else aria-hidden="true">{{ item.icon }}</span>
</slot>
</template>
        <template #name>
<slot name="item" :item="item" :active="item.value === value">
<span class="tx-motion-control__tab-label" :class="{ 'is-current': item.value === value || !item.icon }">{{ item.label }}</span>
</slot>
</template>
        <slot name="panel" :item="item" :active="item.value === value" />
      </TxTabItem>
    </TxTabs>

    <div v-else-if="variant === 'yui-multi-tab-close'" class="tx-motion-control__close-tabs">
      <TxTabs :model-value="tabValue" placement="top" borderless :content-padding="0" indicator-variant="pill" indicator-motion="spring" :animation="tabsAnimation" @update:model-value="selectTab">
        <TxTabItem v-for="item in displayedTabs" :key="item.value" :name="String(item.value)" :data-motion-tab="String(item.value)" :class="{ 'is-closing': !!closingTab(item) }" :style="closingTab(item)?.style" :aria-hidden="closingTab(item) ? true : undefined" :disabled="disabled || item.disabled || !!closingTab(item)" @animationend="finishClosingTab($event, item)">
<template #name>
{{ item.label }}
</template><slot name="panel" :item="item" />
</TxTabItem>
      </TxTabs>
      <div class="tx-motion-control__tab-actions" :aria-label="labels.close">
        <TransitionGroup name="tx-mc-close" tag="div" class="tx-motion-control__close-list">
          <button v-for="item in items.filter(entry => entry.closable !== false)" :key="item.value" type="button" class="tx-motion-control__button tx-motion-control__close-button" :disabled="disabled || item.disabled || items.length <= minItems" :aria-label="`${labels.close} ${item.label}`" @click="closeTab(item)">
<span>{{ item.label }}</span><MotionControlIcon name="close" />
</button>
        </TransitionGroup>
        <button type="button" class="tx-motion-control__button tx-motion-control__icon-button" :disabled="disabled || (maxItems !== undefined && items.length >= maxItems) || (!!newItem && items.some(item => item.value === newItem?.value))" :aria-label="labels.add" @click="addTab">
<MotionControlIcon name="plus" />
</button>
      </div>
    </div>

    <TxContextMenu v-else-if="variant === 'yui-context-menu'" v-model="expanded" trigger="both" anchor-mode="reference" :disabled="disabled" :width="180" panel-background="pure" :panel-radius="16" :animation="anchorAnimation">
      <template #trigger>
<button type="button" class="tx-motion-control__button" :disabled="disabled">
{{ label || labels.actions }}<MotionControlIcon name="down" />
</button>
</template>
      <template #menu>
<slot name="menu" :items="items" :select="command">
<MotionControlMenuItems :items="items" context :disabled="disabled" @select="command" />
</slot>
</template>
    </TxContextMenu>

    <TxDropdownMenu v-else-if="variant === 'yui-submenu-flyout' || variant === 'menu-dots-expand'" v-model="expanded" :placement="variant === 'yui-submenu-flyout' ? 'right-start' : 'bottom-start'" :min-width="160" panel-background="pure" :panel-radius="16" :animation="anchorAnimation">
      <template #trigger>
<button type="button" class="tx-motion-control__button" :class="{ 'tx-motion-control__icon-button': variant === 'menu-dots-expand' }" :disabled="disabled" :aria-label="label || labels.actions" aria-haspopup="menu" :aria-expanded="expanded" @click="replayDots">
<span v-if="variant === 'yui-submenu-flyout'">{{ label || labels.details }}</span><MotionControlIcon :name="variant === 'menu-dots-expand' ? 'dots' : 'forward'" />
</button>
</template>
      <slot name="menu" :items="items" :select="command">
<MotionControlMenuItems :items="items" :disabled="disabled" @select="command" />
</slot>
    </TxDropdownMenu>

    <TxTooltip v-else-if="variant === 'yui-hover-link'" v-model="expanded" :content="tooltip || href" :disabled="disabled" :anchor="tooltipAnchor">
      <a v-if="href && !disabled" class="tx-motion-control__button tx-motion-control__link" :href="href" :target="target" :rel="target === '_blank' ? 'noopener noreferrer' : undefined" @click="action()"><slot>{{ label || labels.link }}</slot><MotionControlIcon name="external" /></a>
      <button v-else type="button" class="tx-motion-control__button tx-motion-control__link" :disabled="disabled" @click="action()">
<slot>{{ label || labels.link }}</slot><MotionControlIcon name="external" />
</button>
    </TxTooltip>

    <TxTooltip v-else-if="variant === 'question-tooltip' || variant === 'yui-glance-preview'" v-model="expanded" :disabled="disabled" :anchor="tooltipAnchor">
      <button type="button" class="tx-motion-control__button tx-motion-control__icon-button tx-motion-control__hint" :disabled="disabled" :aria-label="label || (variant === 'question-tooltip' ? labels.help : labels.preview)" @click="action()">
<MotionControlIcon :name="variant === 'question-tooltip' ? 'help' : 'info'" />
</button>
      <template #content>
<slot name="preview">
<span v-if="variant === 'yui-glance-preview'" class="tx-motion-control__status-dot" aria-hidden="true" />{{ tooltip || label || (variant === 'question-tooltip' ? labels.help : labels.preview) }}
</slot>
</template>
    </TxTooltip>

    <button v-else-if="variant === 'yui-magnetic-icon-btn'" type="button" class="tx-motion-control__button tx-motion-control__magnetic" :disabled="disabled" @click="action()">
<slot>{{ label || labels.action }}</slot><MotionControlIcon name="arrow" />
</button>
    <button v-else-if="variant === 'yui-morph-action-pill'" type="button" class="tx-motion-control__button tx-motion-control__morph-action" :disabled="disabled" @click="action()">
<slot>{{ label || labels.action }}</slot><span class="tx-motion-control__launch"><MotionControlIcon name="arrow" />{{ labels.launch }}</span>
</button>

    <div v-else-if="variant === 'yui-plus-minus-toggle'" class="tx-motion-control__plus-minus" role="group" :aria-label="label || labels.control">
      <button v-for="sign in ['plus', 'minus']" :key="sign" type="button" class="tx-motion-control__button tx-motion-control__square" :class="{ 'is-active': value === sign }" :disabled="disabled" :aria-label="sign === 'plus' ? labels.increase : labels.decrease" :aria-pressed="value === sign" @click="setValue(sign); action(sign)">
<MotionControlIcon :name="sign" />
</button>
    </div>
    <button v-else-if="variant === 'yui-light-dark-toggle'" type="button" class="tx-motion-control__button tx-motion-control__theme-toggle" :class="{ 'is-dark': !!value }" :disabled="disabled" :aria-pressed="!!value" :aria-label="value ? labels.dark : labels.light" @click="toggle">
<span class="tx-motion-control__theme-icon"><MotionControlIcon :name="value ? 'moon' : 'sun'" /></span>
</button>

    <div v-else-if="variant === 'yui-progress-stepper'" class="tx-motion-control__stepper">
      <div class="tx-motion-control__step-track" role="group" :aria-label="label || labels.progress">
<span class="tx-motion-control__step-fill" :style="{ scale: `${lineScale} 1` }" />
        <button v-for="(item, index) in steps" :key="item.value" type="button" class="tx-motion-control__step-node" :class="{ 'is-done': index <= activeStep, 'is-current': item.value === value }" :disabled="disabled || item.disabled" :aria-current="item.value === value ? 'step' : undefined" :aria-label="item.label" @click="select(item)">
<slot name="item" :item="item" :active="item.value === value">
{{ index + 1 }}
</slot>
</button>
      </div>
      <output class="tx-motion-control__readout"><TxTextMorph :text="`${labels.progress} ${activeStep + 1} / ${steps.length}`" :disabled="!motion" /></output>
    </div>

    <button v-else-if="variant === 'yui-segmented-arc-meter' || variant === 'yui-segmented-step-bar'" type="button" class="tx-motion-control__meter" :class="{ 'is-horizontal': variant === 'yui-segmented-step-bar' }" :disabled="disabled" :aria-label="`${label || labels.progress}: ${level} / ${total}`" @click="nextLevel">
      <span v-for="segment in total" :key="segment" class="tx-motion-control__segment" :class="{ 'is-filled': segment <= level }" />
      <output v-if="variant === 'yui-segmented-arc-meter'"><TxTextMorph :text="`${Math.round(level / total * 100)}%`" :disabled="!motion" /></output>
    </button>
    <button v-else-if="variant === 'radial-progress-ring'" type="button" class="tx-motion-control__radial" :disabled="disabled" :aria-label="`${label || labels.progress}: ${percent}%`" @click="nextProgress">
<svg viewBox="0 0 36 36" aria-hidden="true"><circle class="tx-motion-control__ring-track" cx="18" cy="18" r="14" /><circle class="tx-motion-control__ring-fill" cx="18" cy="18" r="14" pathLength="100" stroke-dasharray="100" :stroke-dashoffset="100 - percent" /></svg><TxTextMorph :text="`${percent}%`" :disabled="!motion" />
</button>

    <TxPagination v-else-if="variant === 'yui-stepper-dots' || variant === 'pagination-numbered-bubble'" class="tx-motion-control__pagination" :current-page="pages" :total-pages="total" :aria-label="label || labels.page" :prev-label="labels.back" :next-label="labels.forward" :inert="disabled ? true : undefined" @update:current-page="setValue" />
    <div v-else-if="variant === 'back-forward-nav'" class="tx-motion-control__navigation" role="group" :aria-label="label || labels.control">
<button type="button" class="tx-motion-control__button tx-motion-control__square" :disabled="disabled || !canBack" :aria-label="labels.back" @click="navigate('back')">
<MotionControlIcon name="back" />
</button><button type="button" class="tx-motion-control__button tx-motion-control__square" :disabled="disabled || !canForward" :aria-label="labels.forward" @click="navigate('forward')">
<MotionControlIcon name="forward" />
</button>
</div>

    <div v-else-if="isCounter" class="tx-motion-control__counter" :class="{ 'is-wheel': variant === 'yui-wheel-counter', 'is-simple': variant === 'simple-plus-minus-btn' }" role="group" :aria-label="label || labels.control">
      <button v-if="variant !== 'yui-wheel-counter'" type="button" class="tx-motion-control__button tx-motion-control__counter-button" :disabled="disabled || numeric <= min" :aria-label="labels.decrease" @click="changeCount(-1)">
<MotionControlIcon name="minus" />
</button>
      <output v-if="variant !== 'simple-plus-minus-btn'" class="tx-motion-control__number" aria-live="polite"><TxTextMorph :text="numeric" numbers :duration-ms="variant === 'yui-wheel-counter' ? 150 : 200" :disabled="!motion" :scale="variant !== 'yui-wheel-counter'" /></output>
      <div v-if="variant === 'yui-wheel-counter'" class="tx-motion-control__wheel-buttons">
<button type="button" class="tx-motion-control__button" :disabled="disabled || (max !== undefined && numeric >= max)" :aria-label="labels.increase" @click="changeCount(1)">
<MotionControlIcon name="up" />
</button><button type="button" class="tx-motion-control__button" :disabled="disabled || numeric <= min" :aria-label="labels.decrease" @click="changeCount(-1)">
<MotionControlIcon name="down" />
</button>
</div>
      <button v-else type="button" class="tx-motion-control__button tx-motion-control__counter-button" :disabled="disabled || (max !== undefined && numeric >= max)" :aria-label="labels.increase" @click="changeCount(1)">
<MotionControlIcon name="plus" />
</button>
    </div>

    <button v-else-if="variant === 'yui-perspective-layout' || variant === 'list-column-toggle'" type="button" class="tx-motion-control__button tx-motion-control__layout-toggle" :disabled="disabled" :aria-label="label || layoutLabel" @click="changeLayout">
<Transition :name="variant === 'yui-perspective-layout' ? 'tx-mc-perspective' : 'tx-mc-layout'" mode="out-in">
<MotionControlIcon :key="layout" :name="layout" />
</Transition><TxTextMorph :text="layoutLabel" :disabled="!motion" />
</button>
    <button v-else-if="variant === 'yui-save-pill' || variant === 'follow-check-button'" type="button" class="tx-motion-control__button tx-motion-control__state-pill" :class="{ 'is-active': !!value }" :disabled="disabled" :aria-pressed="!!value" @click="toggle">
<Transition name="tx-mc-icon" mode="out-in">
<MotionControlIcon :key="String(value)" :name="value ? 'check' : (variant === 'yui-save-pill' ? 'bookmark' : 'plus')" />
</Transition><TxTextMorph :text="toggleText" :disabled="!motion" />
</button>
    <button v-else-if="variant === 'pip-mode-icons'" type="button" class="tx-motion-control__button tx-motion-control__pip" :class="{ 'is-pip': !!value }" :disabled="disabled" :aria-label="label || (value ? labels.pipOff : labels.pip)" :aria-pressed="!!value" @click="toggle">
<MotionControlIcon name="stack" /><Transition name="tx-mc-pip">
<span v-if="value" class="tx-motion-control__pip-window" />
</Transition>
</button>
    <div v-else-if="variant === 'yui-download-icons'" class="tx-motion-control__downloads" :data-status="status">
<button type="button" class="tx-motion-control__button tx-motion-control__square" :disabled="disabled || status === 'loading'" :aria-label="downloadText" @click="download">
<span class="tx-motion-control__download-arrow"><MotionControlIcon name="download" /></span>
</button><button type="button" class="tx-motion-control__button tx-motion-control__square" :class="{ 'is-active': status === 'success' }" :disabled="disabled || status === 'loading'" :aria-label="downloadText" @click="download">
<Transition name="tx-mc-icon" mode="out-in">
<MotionControlIcon :key="status" :name="status === 'success' ? 'check' : 'download'" />
</Transition>
</button><span class="tx-motion-control__download-status" role="status" aria-live="polite">{{ downloadText }}<span v-if="status === 'loading'"> {{ Math.round(Math.max(0, Math.min(100, progress))) }}%</span></span>
</div>
    <slot name="value" :value="value" :item="selectedItem" />
  </div>
</template>

<style lang="scss" scoped>
.tx-motion-control {
  --tx-mc-height: 36px; --tx-mc-pad: 14px; --tx-mc-radius: 14px;
  display: inline-flex; align-items: center; gap: 8px; max-width: 100%;
  color: var(--tx-text-color-primary); font-size: 13px;
  &--xs { --tx-mc-height: 26px; --tx-mc-pad: 8px; --tx-mc-radius: 10px; }
  &--sm { --tx-mc-height: 30px; --tx-mc-pad: 10px; --tx-mc-radius: 12px; }
  &--lg { --tx-mc-height: 42px; --tx-mc-pad: 18px; --tx-mc-radius: 16px; }
  :deep(.tx-tabs) { flex-direction: column; gap: 0; background: transparent; min-width: 0; }
  :deep(.tx-tabs__nav) { width: auto; min-width: 0; max-width: 100%; padding: 3px; border-radius: var(--tx-mc-radius); background: var(--tx-fill-color-light); }
  :deep(.tx-tab-item) { margin: 0; min-height: var(--tx-mc-height); padding: 4px var(--tx-mc-pad); border-radius: calc(var(--tx-mc-radius) - 3px); }
  &:not(.has-panels) :deep(.tx-tabs__main) { display: none; }
  :deep(.tx-tab-item__name) { font-size: 13px; }
  :deep(.tx-tabs__pointer) { background: var(--tx-fill-color); }
  :deep(.tx-select) { min-width: 160px; }
}
.tx-motion-control__button, .tx-motion-control__meter, .tx-motion-control__radial, .tx-motion-control__step-node {
  appearance: none; border: 0; cursor: pointer; color: inherit; font: inherit;
  &:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 3px; }
  &:disabled { cursor: not-allowed; opacity: .5; }
}
.tx-motion-control__button {
  display: inline-flex; position: relative; align-items: center; justify-content: center; gap: 8px;
  min-height: var(--tx-mc-height); padding: 4px var(--tx-mc-pad); box-sizing: border-box;
  border-radius: var(--tx-mc-radius); background: var(--tx-bg-color);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-light); text-decoration: none; white-space: nowrap;
  &:hover:not(:disabled) { background: var(--tx-fill-color-light); }
  &:active:not(:disabled) { scale: .94; }
  &.is-active { background: var(--tx-color-primary-light-9); color: var(--tx-text-color-primary); box-shadow: inset 0 0 0 1px var(--tx-color-primary); }
}
.tx-motion-control__icon-button, .tx-motion-control__square { width: var(--tx-mc-height); padding: 0; flex: none; }
.tx-motion-control__plus-minus .tx-motion-control__button:active:not(:disabled), .tx-motion-control__navigation .tx-motion-control__button:active:not(:disabled), .tx-motion-control__counter-button:active:not(:disabled) { scale: .88; }
.tx-motion-control__counter.is-simple .tx-motion-control__button:active:not(:disabled), .tx-motion-control__pip:active:not(:disabled) { scale: .92; }
.tx-motion-control__theme-toggle:active:not(:disabled), .tx-motion-control__hint:active:not(:disabled), .tx-motion-control__step-node:active:not(:disabled) { scale: .9; }
.tx-motion-control__magnetic:active:not(:disabled) { scale: .95; }
.tx-motion-control__frequency { display: flex; align-items: center; gap: 12px; padding: 6px; border-radius: 22px; background: var(--tx-fill-color-light); }
.tx-motion-control__frequency-label { padding-left: 8px; color: var(--tx-text-color-regular); }
.tx-motion-control__frequency.is-expanded .tx-motion-control__frequency-label { opacity: .3; filter: blur(4px); }
.tx-motion-control__frequency-options { display: flex; align-items: center; gap: 6px; }
.tx-motion-control__frequency-options :deep(.tx-tab-item) { padding-inline: 8px; }
.tx-motion-control--tab-bar :deep(.tx-tabs__nav) { background: transparent; }
.tx-motion-control--tab-bar :deep(.tx-tab-item) { margin-inline: 3px; padding-inline: 12px; border-radius: 24px; background: var(--tx-fill-color-light); }
.tx-motion-control--tab-bar :deep(.tx-tab-item.is-active) { padding-inline: 16px; background: var(--tx-color-primary-light-9); box-shadow: inset 0 0 0 1px var(--tx-color-primary); }
.tx-motion-control--tab-bar .tx-motion-control__tab-label { display: inline-block; max-width: 0; opacity: 0; overflow: hidden; white-space: nowrap; }
.tx-motion-control--tab-bar .tx-motion-control__tab-label.is-current { max-width: 160px; opacity: 1; }
.tx-motion-control--tab-bar :deep(.tx-tab-item:not(.is-active)) { gap: 0; }
.tx-motion-control--compact-mode-switch :deep(.tx-tab-item__name) { position: absolute; width: 1px; height: 1px; clip: rect(0,0,0,0); overflow: hidden; }
.tx-motion-control--compact-mode-switch :deep(.tx-tab-item) { padding: 8px; gap: 0; }
.tx-motion-control--compact-mode-switch :deep(.tx-tab-item__icon) { color: inherit; }
.tx-motion-control--yui-date-position :deep(.tx-tabs__nav), .tx-motion-control--yui-date-position :deep(.tx-tab-item) { border-radius: 999px; }
.tx-motion-control--yui-ab-tabs :deep(.tx-tab-item) { padding-inline: 24px; }
.tx-motion-control--yui-ab-tabs :deep(.tx-tab-item.is-active) { box-shadow: inset 0 0 0 1px var(--tx-text-color-primary); }
.tx-motion-control--yui-date-position :deep(.tx-tab-item:active:not(:disabled)) { scale: .9; }
.tx-motion-control__close-tabs { min-width: 0; }
.tx-motion-control__tab-actions, .tx-motion-control__close-list { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.tx-motion-control__tab-actions { margin-top: 4px; }
.tx-motion-control__close-list { position: relative; }
.tx-motion-control__close-button { min-height: 26px; padding: 3px 8px; font-size: 12px; }
.tx-motion-control__close-button :deep(svg) { width: 12px; height: 12px; }
.tx-motion-control__link, .tx-motion-control__state-pill, .tx-motion-control__magnetic, .tx-motion-control__morph-action { border-radius: 999px; }
.tx-motion-control__hint { color: var(--tx-color-primary); }
.tx-motion-control--question-tooltip .tx-motion-control__hint { border-radius: 999px; }
.tx-motion-control__status-dot { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--tx-color-primary); }
.tx-motion-control__launch { display: inline-flex; align-items: center; gap: 5px; overflow: hidden; max-width: 0; opacity: 0; }
.tx-motion-control__morph-action { background: var(--tx-color-primary-light-9); }
.tx-motion-control__morph-action:is(:hover, :focus-visible):not(:disabled) .tx-motion-control__launch { max-width: 120px; opacity: 1; }
.tx-motion-control__plus-minus, .tx-motion-control__navigation, .tx-motion-control__downloads { display: flex; gap: 10px; align-items: center; }
.tx-motion-control__theme-toggle { width: calc(var(--tx-mc-height) + 10px); height: calc(var(--tx-mc-height) + 10px); padding: 0; background: var(--tx-color-warning-light-9); }
.tx-motion-control__theme-toggle.is-dark { background: var(--tx-fill-color-dark); }
.tx-motion-control__theme-icon { display: block; rotate: 0deg; }
.tx-motion-control__theme-toggle.is-dark .tx-motion-control__theme-icon { rotate: 180deg; }
.tx-motion-control__stepper { display: flex; flex-direction: column; gap: 8px; min-width: 180px; }
.tx-motion-control__step-track { display: flex; align-items: center; justify-content: space-between; position: relative; isolation: isolate; }
.tx-motion-control__step-track::before, .tx-motion-control__step-fill { content: ''; position: absolute; height: 4px; top: calc(50% - 2px); inset-inline: 14px; border-radius: 4px; background: var(--tx-fill-color); z-index: -1; }
.tx-motion-control__step-fill { background: var(--tx-color-primary); transform-origin: left; }
.tx-motion-control__step-node { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--tx-bg-color); box-shadow: inset 0 0 0 1px var(--tx-border-color); }
.tx-motion-control__step-node.is-done { background: var(--tx-color-primary-light-9); box-shadow: inset 0 0 0 1px var(--tx-color-primary); }
.tx-motion-control__step-node.is-current { scale: 1.2; }
.tx-motion-control__readout { text-align: center; font-size: 12px; color: var(--tx-text-color-regular); }
.tx-motion-control__meter { display: flex; align-items: center; gap: 6px; padding: 6px; background: transparent; }
.tx-motion-control__segment { width: 12px; height: 32px; border-radius: 8px; background: var(--tx-fill-color); scale: 1 .75; }
.tx-motion-control__segment.is-filled { background: var(--tx-color-primary); scale: 1 1; }
.tx-motion-control__meter.is-horizontal .tx-motion-control__segment { width: 24px; height: 8px; scale: 1; }
.tx-motion-control__radial { position: relative; display: inline-grid; place-items: center; width: 58px; height: 58px; background: transparent; font-size: 12px; }
.tx-motion-control__radial svg { position: absolute; inset: 0; width: 100%; height: 100%; rotate: -90deg; }
.tx-motion-control__radial circle { fill: none; stroke-width: 3.5; }
.tx-motion-control__ring-track { stroke: var(--tx-fill-color); }
.tx-motion-control__ring-fill { stroke: var(--tx-color-primary); stroke-linecap: round; }
.tx-motion-control__pagination :deep(.tx-pagination__list) { gap: 4px; padding: 4px; border-radius: 16px; background: var(--tx-fill-color-light); }
.tx-motion-control__pagination :deep(.tx-pagination__button) { transition: none; border: 0; box-shadow: inset 0 0 0 1px var(--tx-border-color-light); }
.tx-motion-control__pagination :deep(.tx-pagination__item:first-child), .tx-motion-control__pagination :deep(.tx-pagination__item:last-child) { display: none; }
.tx-motion-control--pagination-numbered-bubble :deep(.tx-pagination__button--active) { translate: 0 -6px; border-radius: 10px; background: var(--tx-color-primary-light-9); color: var(--tx-text-color-primary); }
.tx-motion-control--yui-stepper-dots :deep(.tx-pagination__button) { width: 8px; min-width: 8px; height: 8px; min-height: 8px; padding: 0; overflow: hidden; color: transparent; font-size: 0; border: 0; border-radius: 8px; background: var(--tx-fill-color-dark); }
.tx-motion-control--yui-stepper-dots :deep(.tx-pagination__button--active) { width: 24px; background: var(--tx-color-primary); }
.tx-motion-control__counter { display: flex; align-items: center; gap: 10px; padding: 4px 8px; border-radius: 999px; background: var(--tx-bg-color); box-shadow: inset 0 0 0 1px var(--tx-border-color-light); }
.tx-motion-control__counter-button { min-height: 28px; width: 28px; padding: 0; border-radius: 50%; background: var(--tx-fill-color-light); box-shadow: none; }
.tx-motion-control__number { min-width: 24px; font-variant-numeric: tabular-nums; text-align: center; }
.tx-motion-control__counter.is-wheel { border-radius: 14px; gap: 8px; }
.tx-motion-control__counter.is-wheel .tx-motion-control__number { height: 28px; display: grid; place-items: center; overflow: hidden; }
.tx-motion-control__wheel-buttons { display: flex; flex-direction: column; gap: 2px; }
.tx-motion-control__wheel-buttons .tx-motion-control__button { min-height: 18px; padding: 0 3px; box-shadow: none; border-radius: 4px; }
.tx-motion-control__wheel-buttons :deep(svg) { width: 14px; height: 14px; }
.tx-motion-control__counter.is-simple { padding: 0; background: transparent; box-shadow: none; gap: 8px; }
.tx-motion-control__counter.is-simple .tx-motion-control__counter-button { width: var(--tx-mc-height); min-height: var(--tx-mc-height); border-radius: 12px; box-shadow: inset 0 0 0 1px var(--tx-border-color-light); }
.tx-motion-control__pip { width: 64px; height: 48px; }
.tx-motion-control__pip.is-pip { background: var(--tx-color-primary-light-9); }
.tx-motion-control__pip-window { position: absolute; right: 6px; bottom: 6px; width: 16px; height: 12px; border-radius: 3px; background: var(--tx-color-primary); box-shadow: 0 0 0 1px var(--tx-bg-color); }
.tx-motion-control__download-status { font-size: 12px; color: var(--tx-text-color-regular); }
.tx-motion-control.is-motion {
  .tx-motion-control__button { transition: scale 150ms var(--tx-mc-ease), translate 200ms var(--tx-mc-ease); }
  .tx-motion-control__link:is(:hover, :focus-visible):not(:disabled) { scale: 1.05; translate: 0 -2px; }
  .tx-motion-control__magnetic:is(:hover, :focus-visible):not(:disabled) { scale: 1.05; translate: 3px 0; }
  .tx-motion-control__hint:is(:hover, :focus-visible):not(:disabled) { scale: 1.08; }
  .tx-motion-control__state-pill:hover:not(:disabled) { scale: 1.05; }
  .tx-motion-control__launch { transition: max-width 200ms var(--tx-mc-ease), opacity 200ms; }
  .tx-motion-control__frequency-label { transition: filter 300ms, opacity 300ms; }
  .tx-motion-control__theme-icon { transition: rotate var(--tx-mc-duration) var(--tx-mc-ease); }
  .tx-motion-control__step-fill { transition: scale 400ms cubic-bezier(.16,1,.3,1); }
  .tx-motion-control__step-node, .tx-motion-control__segment { transition: scale var(--tx-mc-duration) var(--tx-mc-ease); }
  .tx-motion-control__ring-fill { transition: stroke-dashoffset 350ms ease; }
  .tx-mc-layout-enter-active, .tx-mc-layout-leave-active, .tx-mc-perspective-enter-active, .tx-mc-perspective-leave-active { transition: rotate 200ms, opacity 200ms, scale 200ms; }
  .tx-mc-layout-enter-from { rotate: -90deg; opacity: 0; }
  .tx-mc-perspective-enter-from { rotate: -45deg; scale: .8; }
  .tx-mc-layout-leave-to, .tx-mc-perspective-leave-to { opacity: 0; }
  .tx-motion-control__tab-label { transition: max-width 300ms ease-out, opacity 300ms; }
  &.tx-motion-control--tab-bar :deep(.tx-tab-item) { transition: padding-inline 500ms var(--tx-mc-ease); }
  :deep(.tx-pagination__button) { transition: width var(--tx-mc-duration) var(--tx-mc-ease), translate var(--tx-mc-duration) var(--tx-mc-ease); }
  .tx-mc-frequency-enter-active, .tx-mc-frequency-leave-active { transition: opacity 300ms, scale 300ms, filter 300ms, translate 300ms; }
  .tx-mc-frequency-enter-from, .tx-mc-frequency-leave-to { opacity: 0; scale: .95; filter: blur(4px); translate: 12px 0; }
  .tx-mc-close-enter-active, .tx-mc-close-leave-active, .tx-mc-close-move { transition: opacity 200ms, scale 200ms, transform 200ms; }
  .tx-mc-close-enter-from, .tx-mc-close-leave-to { opacity: 0; scale: .8; }
  .tx-mc-close-leave-active { position: absolute; }
  .tx-mc-icon-enter-active, .tx-mc-icon-leave-active { transition: opacity 120ms, scale 120ms; }
  .tx-mc-icon-enter-from, .tx-mc-icon-leave-to { opacity: 0; scale: .8; }
  .tx-mc-pip-enter-active, .tx-mc-pip-leave-active { transition: opacity 200ms, scale 200ms, translate 200ms; }
  .tx-mc-pip-enter-from, .tx-mc-pip-leave-to { opacity: 0; scale: .5; translate: 5px -5px; }
}
@media (prefers-reduced-motion: no-preference) {
  .tx-motion-control--yui-multi-tab-close.is-motion :deep(.tx-tab-item.is-closing) { animation: tx-mc-tab-close 200ms ease forwards; }
  .tx-motion-control.is-motion.is-loading .tx-motion-control__download-arrow { animation: tx-mc-download 600ms infinite; }
  .tx-motion-control--menu-dots-expand.is-motion.is-dots-a :deep(.tx-motion-control__icon) { animation: tx-mc-dots-a 300ms ease; }
  .tx-motion-control--menu-dots-expand.is-motion.is-dots-b :deep(.tx-motion-control__icon) { animation: tx-mc-dots-b 300ms ease; }
}
@keyframes tx-mc-download { 50% { translate: 0 4px; } }
@keyframes tx-mc-tab-close { to { scale: .8; opacity: 0; } }
@keyframes tx-mc-dots-a { 50% { scale: 1.3; } }
@keyframes tx-mc-dots-b { 50% { scale: 1.3; } }
.tx-motion-control--yui-multi-tab-close :deep(.tx-tabs__nav-inner) { position: relative; }
.tx-motion-control:not(.is-motion) .tx-motion-control__download-arrow { animation: none; }
@media (prefers-reduced-motion: reduce) {
  .tx-motion-control *, .tx-motion-control :deep(*) { transition: none !important; animation: none !important; }
}
@media (max-width: 540px) {
  .tx-motion-control__frequency { flex-wrap: wrap; }
  .tx-motion-control__frequency-options { max-width: 100%; }
  .tx-motion-control__frequency-options :deep(.tx-tabs__nav) { overflow-x: auto; }
}
</style>
