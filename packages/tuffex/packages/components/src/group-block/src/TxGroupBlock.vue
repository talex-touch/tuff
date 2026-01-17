<script setup lang="ts">
import type { GroupBlockEmits, GroupBlockProps } from './types'
import { nextTick, onMounted, ref, watch } from 'vue'
import { hasWindow } from '../../../../utils/env'

defineOptions({
  name: 'TxGroupBlock',
})

const props = withDefaults(defineProps<GroupBlockProps>(), {
  icon: '',
  description: '',
  expandFill: false,
  shrink: false,
  collapsible: true,
  collapsed: false,
  defaultExpand: true,
  memoryName: '',
})

const emit = defineEmits<GroupBlockEmits>()

const STORAGE_PREFIX = 'tx-group-block-storage-'

function readStoredExpand(): boolean | null {
  if (!hasWindow())
    return null
  if (!props.memoryName)
    return null
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${props.memoryName}`)
    if (!raw)
      return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.expand === 'boolean')
      return parsed.expand
  }
  catch {
    return null
  }
  return null
}

function persistState(state: boolean): void {
  if (!hasWindow())
    return
  if (!props.memoryName)
    return
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${props.memoryName}`, JSON.stringify({ expand: state }))
  }
  catch {
  }
}

function resolveDefaultExpand(): boolean {
  if (typeof props.defaultExpand === 'boolean')
    return props.defaultExpand
  return !props.collapsed
}

const storedExpand = ref<boolean | null>(readStoredExpand())
const hasUserInteracted = ref(false)
const expanded = ref(storedExpand.value ?? (!props.shrink && resolveDefaultExpand()))

const contentRef = ref<HTMLElement | null>(null)
const isMounted = ref(false)

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
  <div class="tx-group-block" :class="{ 'tx-group-block--expanded': expanded }">
    <div
      class="tx-group-block__header fake-background"
      :class="{ 'tx-group-block__header--static': !collapsible }"
      role="button"
      tabindex="0"
      @click="toggle"
      @keydown.enter="toggle"
      @keydown.space.prevent="toggle"
    >
      <div class="tx-group-block__content">
        <slot name="icon" :active="expanded">
          <i v-if="icon" :class="icon" class="tx-group-block__icon" aria-hidden="true" />
        </slot>
        <div class="tx-group-block__label">
          <h3 class="tx-group-block__name">
            {{ name }}
          </h3>
          <p v-if="description" class="tx-group-block__description">
            {{ description }}
          </p>
        </div>
      </div>

      <slot name="header-extra" :active="expanded" />

      <div
        v-if="collapsible"
        class="tx-group-block__toggle"
        :class="expanded ? 'i-carbon-subtract' : 'i-carbon-add'"
        aria-hidden="true"
      />
    </div>

    <div ref="contentRef" class="tx-group-block__body">
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
.tx-group-block {
  --tx-group-block-radius: 12px;
  --tx-group-block-transition: 0.45s cubic-bezier(0.33, 1, 0.68, 1);

  position: relative;
  width: 100%;
  margin-bottom: 0.7rem;
  overflow: hidden;
  border-radius: var(--tx-group-block-radius);
  border: 1px solid var(--tx-border-color-lighter, #eee);

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 22px 4px 12px;
    width: 100%;
    height: 56px;
    cursor: pointer;
    user-select: none;
    box-sizing: border-box;
    background: var(--tx-fill-color-light, #f5f7fa);
    border-bottom: 1px solid var(--tx-border-color-lighter, #eee);
    transition: background-color 0.25s ease;

    --fake-color: var(--tx-fill-color, #ebeef5);
    --fake-inner-opacity: 0.5;

    &::before {
      border-radius: 0;
    }

    &--static {
      cursor: default;
    }

    &:hover {
      --fake-color: var(--tx-fill-color, #ebeef5);
      transition: all 1s;
    }

    &:focus-visible {
      outline: 2px solid var(--tx-color-primary);
      outline-offset: -2px;
    }
  }

  &__content {
    display: flex;
    align-items: center;
    height: 100%;
    gap: 12px;

    > * {
      font-size: 22px;
    }
  }

  &__icon {
    font-size: 22px;
    color: var(--tx-text-color-primary, #303133);
  }

  &__label {
    flex: 1;
  }

  &__name {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
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
    margin-left: 12px;
    font-size: 20px;
    color: var(--tx-text-color-secondary, #909399);
    transition: transform 0.25s ease;
  }

  &__body {
    padding: 0;
    transition: height var(--tx-group-block-transition), opacity 0.35s ease;
  }

  &__body :deep(.tx-block-slot),
  &__body :deep(.tx-block-switch),
  &__body :deep(.tx-block-line) {
    margin-bottom: 0;
    border-radius: 0 !important;
  }
}
</style>
