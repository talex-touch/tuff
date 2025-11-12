<script lang="ts" name="TuffGroupBlock" setup>
import { computed, onMounted, ref, watch } from 'vue'
import type { ITuffIcon } from '@talex-touch/utils'
import TuffIcon from '~/components/base/TuffIcon.vue'
import gsap from 'gsap'

type IconValue = ITuffIcon | string | null | undefined
const STORAGE_PREFIX = 'tuff-block-storage-'

const props = withDefaults(
  defineProps<{
    name: string
    description?: string
    defaultIcon?: IconValue
    activeIcon?: IconValue
    iconSize?: number
    collapsible?: boolean
    collapsed?: boolean
    defaultExpand?: boolean
    memoryName?: string
  }>(),
  {
    description: '',
    iconSize: 22,
    collapsible: true,
    collapsed: false,
    defaultExpand: true
  }
)

const emits = defineEmits<{
  (e: 'toggle', expanded: boolean): void
}>()

function resolveDefaultExpand(): boolean {
  if (typeof props.defaultExpand === 'boolean') return props.defaultExpand
  return !props.collapsed
}

function toIcon(icon?: IconValue): ITuffIcon | null {
  if (!icon) return null
  if (typeof icon === 'string') {
    return { type: 'class', value: icon }
  }
  return icon
}

const defaultIcon = computed(() => toIcon(props.defaultIcon))
const activeIcon = computed(() => toIcon(props.activeIcon))

function readStoredExpand(): boolean | null {
  if (typeof window === 'undefined' || !props.memoryName) return null
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${props.memoryName}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.expand === 'boolean') return parsed.expand
  } catch (error) {
    console.warn('[TuffGroupBlock] Failed to read stored expand state', error)
  }
  return null
}

const storedExpand = ref<boolean | null>(readStoredExpand())
const expanded = ref(storedExpand.value ?? resolveDefaultExpand())
const hasUserInteracted = ref(false)
const contentRef = ref<HTMLElement | null>(null)
const isMounted = ref(false)

const headerIcon = computed(() => {
  if (expanded.value) {
    return activeIcon.value ?? defaultIcon.value
  }
  return defaultIcon.value ?? activeIcon.value
})

function persistState(state: boolean) {
  if (typeof window === 'undefined' || !props.memoryName) return
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${props.memoryName}`,
      JSON.stringify({ expand: state })
    )
    storedExpand.value = state
  } catch (error) {
    console.warn('[TuffGroupBlock] Failed to persist expand state', error)
  }
}

function applyImmediate(state: boolean) {
  const el = contentRef.value
  if (!el) return
  gsap.killTweensOf(el)
  if (state) {
    el.style.display = 'block'
    el.style.height = 'auto'
    el.style.opacity = '1'
  } else {
    el.style.display = 'none'
    el.style.height = '0px'
    el.style.opacity = '0'
  }
}

function animateContent(state: boolean) {
  const el = contentRef.value
  if (!el) return

  gsap.killTweensOf(el)

  if (state) {
    el.style.display = 'block'
    const target = el.scrollHeight || 0
    gsap.fromTo(
      el,
      { height: 0, opacity: 0.2 },
      {
        height: target,
        opacity: 1,
        duration: 0.45,
        ease: 'power3.out',
        onComplete: () => {
          el.style.height = 'auto'
        }
      }
    )
  } else {
    const current = el.scrollHeight || el.offsetHeight || 0
    gsap.fromTo(
      el,
      { height: current, opacity: 1 },
      {
        height: 0,
        opacity: 0,
        duration: 0.35,
        ease: 'power2.inOut',
        onComplete: () => {
          el.style.display = 'none'
        }
      }
    )
  }
}

function toggle() {
  if (!props.collapsible) return
  expanded.value = !expanded.value
  hasUserInteracted.value = true
  persistState(expanded.value)
  emits('toggle', expanded.value)
}

watch(
  () => props.collapsed,
  (value) => {
    if (storedExpand.value !== null || hasUserInteracted.value) return
    expanded.value = !value
  }
)

watch(
  () => props.defaultExpand,
  (value) => {
    if (storedExpand.value !== null || hasUserInteracted.value) return
    if (typeof value === 'boolean') {
      expanded.value = value
    }
  }
)

watch(
  expanded,
  (value) => {
    if (!isMounted.value) return
    animateContent(value)
  },
  { flush: 'post' }
)

onMounted(() => {
  applyImmediate(expanded.value)
  isMounted.value = true
})
</script>

<template>
  <div class="TGroupBlock-Container" :class="{ expand: expanded }">
    <div
      class="TGroupBlock-Header fake-background index-fix"
      :class="{ 'is-static': !collapsible }"
      @click="toggle"
    >
      <div class="TGroupBlock-Content">
        <slot name="icon" :active="expanded">
          <TuffIcon v-if="headerIcon" :icon="headerIcon" :size="iconSize" />
        </slot>
        <div class="TGroupBlock-Label">
          <h3>{{ name }}</h3>
          <p>{{ description }}</p>
        </div>
      </div>
      <slot name="header-extra" :active="expanded" />
      <div
        v-if="collapsible"
        class="TGroupBlock-Mode"
        :class="expanded ? 'i-carbon-subtract' : 'i-carbon-add'"
      />
    </div>
    <div ref="contentRef" class="TGroupBlock-Main">
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.TGroupBlock-Header {
  .TGroupBlock-Content {
    :deep(.TuffIcon) {
      position: relative;
      bottom: -0.125em;
      font-size: inherit;
    }
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 100%;

    > * {
      margin-right: 12px;
      font-size: 24px;
    }

    > .TGroupBlock-Label {
      flex: 1;

      > h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
      }

      > p {
        margin: 0;
        font-size: 12px;
        font-weight: 400;
        opacity: 0.5;
      }
    }
  }
  .TGroupBlock-Mode {
    position: relative;
    margin-right: 10px;
    bottom: -0.125em;
    font-size: 20px;
  }
  padding: 4px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: 56px;
  cursor: pointer;
  user-select: none;
  box-sizing: border-box;
  border-bottom: 1px solid var(--el-border-color-lighter);
  --fake-color: var(--el-fill-color-dark);
  --fake-inner-opacity: 0.5;
  transition: background-color 0.25s;

  &.is-static {
    cursor: default;
  }

  &:hover {
    --fake-color: var(--el-fill-color);
    transition: all 1s;
  }
}

.touch-blur .TGroupBlock-Header {
  --fake-color: var(--el-fill-color);
  &:hover {
    --fake-color: var(--el-fill-color-light);
  }
}

.TGroupBlock-Main {
  padding: 0;

  .TBlockSelection {
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

    .touch-blur & {
      &:hover {
        --fake-color: var(--el-fill-color-light) !important;
      }
    }
  }
}

.TGroupBlock-Container {
  position: relative;
  margin-bottom: 0.7rem;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  --fake-radius: 0 !important;
}

</style>
