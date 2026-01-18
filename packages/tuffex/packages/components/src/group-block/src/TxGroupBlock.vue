<script setup lang="ts">
import type { TxIconSource } from '../../icon'
import type { GroupBlockEmits, GroupBlockProps } from './types'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { TuffIcon } from '../../icon'
import { hasWindow } from '../../../../utils/env'

defineOptions({
  name: 'TxGroupBlock',
})

type IconValue = TxIconSource | string | null | undefined

const props = withDefaults(defineProps<GroupBlockProps>(), {
  description: '',
  iconSize: 22,
  collapsible: true,
  collapsed: false,
  defaultExpand: true,
  memoryName: '',
  icon: '',
  expandFill: false,
  shrink: false,
})

const emit = defineEmits<GroupBlockEmits>()

const STORAGE_PREFIX = 'tuff-block-storage-'
const LEGACY_STORAGE_PREFIX = 'tx-group-block-storage-'

function readStoredExpand(): boolean | null {
  if (!hasWindow() || !props.memoryName)
    return null
  try {
    const key = `${STORAGE_PREFIX}${props.memoryName}`
    const legacyKey = `${LEGACY_STORAGE_PREFIX}${props.memoryName}`
    const raw = localStorage.getItem(key) ?? localStorage.getItem(legacyKey)
    if (!raw)
      return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.expand === 'boolean')
      return parsed.expand
  }
  catch (error) {
    console.warn('[TxGroupBlock] Failed to read stored expand state', error)
  }
  return null
}

function persistState(state: boolean): void {
  if (!hasWindow() || !props.memoryName)
    return
  try {
    const payload = JSON.stringify({ expand: state })
    localStorage.setItem(`${STORAGE_PREFIX}${props.memoryName}`, payload)
    localStorage.setItem(`${LEGACY_STORAGE_PREFIX}${props.memoryName}`, payload)
    storedExpand.value = state
  }
  catch (error) {
    console.warn('[TxGroupBlock] Failed to persist expand state', error)
  }
}

function resolveDefaultExpand(): boolean {
  if (typeof props.defaultExpand === 'boolean')
    return props.defaultExpand
  return !props.collapsed
}

const storedExpand = ref<boolean | null>(readStoredExpand())
const hasUserInteracted = ref(false)
const expanded = ref(storedExpand.value ?? (props.shrink ? false : resolveDefaultExpand()))

const contentRef = ref<HTMLElement | null>(null)
const isMounted = ref(false)

function toIcon(icon?: IconValue): TxIconSource | null {
  if (!icon)
    return null
  if (typeof icon === 'string')
    return { type: 'class', value: icon }
  return icon
}

const defaultIcon = computed(() => {
  if (props.defaultIcon !== undefined)
    return toIcon(props.defaultIcon)
  return toIcon(props.icon)
})

const activeIcon = computed(() => {
  if (props.activeIcon !== undefined)
    return toIcon(props.activeIcon)
  return null
})

const headerIcon = computed(() => {
  if (expanded.value)
    return activeIcon.value ?? defaultIcon.value
  return defaultIcon.value ?? activeIcon.value
})

function applyImmediate(state: boolean): void {
  const el = contentRef.value
  if (!el)
    return
  el.style.transition = 'none'
  if (state) {
    el.style.display = 'block'
    el.style.height = 'auto'
    el.style.opacity = '1'
  }
  else {
    el.style.display = 'none'
    el.style.height = '0px'
    el.style.opacity = '0'
  }
  void el.offsetHeight
  el.style.transition = ''
}

async function animateContent(state: boolean): Promise<void> {
  const el = contentRef.value
  if (!el)
    return

  el.style.transition = ''
  el.style.overflow = 'hidden'
  el.style.willChange = 'height, opacity'

  if (state) {
    el.style.display = 'block'
    el.style.height = '0px'
    el.style.opacity = '0'
    await nextTick()
    const target = el.scrollHeight || 0
    requestAnimationFrame(() => {
      el.style.height = `${target}px`
      el.style.opacity = '1'
    })
  }
  else {
    const current = el.scrollHeight || el.offsetHeight || 0
    el.style.height = `${current}px`
    el.style.opacity = '1'
    await nextTick()
    requestAnimationFrame(() => {
      el.style.height = '0px'
      el.style.opacity = '0'
    })
  }

  const onEnd = (e: TransitionEvent) => {
    if (e.target !== el)
      return
    if (e.propertyName !== 'height')
      return
    el.removeEventListener('transitionend', onEnd)
    if (state) {
      el.style.height = 'auto'
      el.style.opacity = '1'
    }
    else {
      el.style.display = 'none'
      el.style.height = '0px'
      el.style.opacity = '0'
    }
    el.style.willChange = ''
  }

  el.addEventListener('transitionend', onEnd)
}

function toggle(): void {
  if (!props.collapsible)
    return
  expanded.value = !expanded.value
  hasUserInteracted.value = true
  persistState(expanded.value)
  emit('update:expanded', expanded.value)
  emit('toggle', expanded.value)
}

watch(
  () => props.shrink,
  (newVal) => {
    if (storedExpand.value !== null || hasUserInteracted.value)
      return
    expanded.value = !newVal
  },
)

watch(
  () => props.collapsed,
  (value) => {
    if (storedExpand.value !== null || hasUserInteracted.value)
      return
    expanded.value = !value
  },
)

watch(
  () => props.defaultExpand,
  (value) => {
    if (storedExpand.value !== null || hasUserInteracted.value)
      return
    if (typeof value === 'boolean')
      expanded.value = value
  },
)

watch(
  expanded,
  (value) => {
    if (!isMounted.value)
      return
    animateContent(value)
  },
  { flush: 'post' },
)

onMounted(() => {
  applyImmediate(expanded.value)
  isMounted.value = true
})
</script>

<template>
  <div
    class="tx-group-block TGroupBlock-Container"
    :class="{ 'tx-group-block--expanded': expanded, expand: expanded }"
  >
    <div
      class="tx-group-block__header TGroupBlock-Header fake-background index-fix"
      :class="{ 'tx-group-block__header--static': !collapsible, 'is-static': !collapsible }"
      @click="toggle"
    >
      <div class="tx-group-block__content TGroupBlock-Content">
        <slot name="icon" :active="expanded">
          <TuffIcon v-if="headerIcon" :icon="headerIcon" :size="iconSize" />
        </slot>
        <div class="tx-group-block__label TGroupBlock-Label">
          <h3 class="tx-group-block__name">
            {{ name }}
          </h3>
          <p class="tx-group-block__description">
            {{ description }}
          </p>
        </div>
      </div>

      <slot name="header-extra" :active="expanded" />

      <div
        v-if="collapsible"
        class="tx-group-block__toggle TGroupBlock-Mode"
        :class="expanded ? 'i-carbon-subtract' : 'i-carbon-add'"
        aria-hidden="true"
      />
    </div>

    <div ref="contentRef" class="tx-group-block__body TGroupBlock-Main">
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
.tx-group-block {
  position: relative;
  width: 100%;
  margin-bottom: 0.7rem;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  --fake-radius: 0 !important;

  &__header {
    padding: 4px 22px 4px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    height: 56px;
    cursor: pointer;
    user-select: none;
    box-sizing: border-box;
    border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
    --fake-color: var(--tx-fill-color-darker, #ebeef5);
    --fake-inner-opacity: 0.5;
    transition: background-color 0.25s;

    &--static {
      cursor: default;
    }

    &:hover {
      --fake-color: var(--tx-fill-color, #f0f2f5);
      transition: all 1s;
    }
  }

  &__content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 100%;

    > * {
      margin-right: 12px;
      font-size: 24px;
    }
  }

  &__label {
    flex: 1;
  }

  &__name {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--tx-text-color-primary, #303133);
  }

  &__description {
    margin: 0;
    font-size: 12px;
    font-weight: 400;
    opacity: 0.5;
    color: var(--tx-text-color-secondary, #909399);
  }

  &__toggle {
    position: relative;
    font-size: 20px;
    color: var(--tx-text-color-secondary, #909399);
  }

  &__body {
    padding: 0;
    transition: height 0.45s cubic-bezier(0.33, 1, 0.68, 1), opacity 0.35s ease;

    :deep(.TBlockSelection),
    :deep(.tx-block-slot),
    :deep(.tx-block-switch) {
      margin: 0;
      border-radius: 0 !important;
      --fake-radius: 0 !important;
      --fake-inner-opacity: 0.5;

      .TBlockSelection-Content > * {
        font-size: 20px;
      }

      .TBlockSelection-Func {
        margin-right: 32px;
      }
    }
  }
}

.touch-blur .tx-group-block__header {
  --fake-color: var(--tx-fill-color, #f0f2f5);

  &:hover {
    --fake-color: var(--tx-fill-color-light, #f5f7fa);
  }
}
</style>
