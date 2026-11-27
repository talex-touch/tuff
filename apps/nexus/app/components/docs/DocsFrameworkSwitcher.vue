<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DocsFramework, FrameworkSupportStatus } from '~/data/tuffex-framework-matrix'
import {
  DOCS_FRAMEWORK_META,
  DOCS_FRAMEWORKS,
  getComponentFrameworkEntry,
} from '~/data/tuffex-framework-matrix'
import { useDocsFramework } from '~/composables/useDocsFramework'

const props = withDefaults(defineProps<{
  size?: 'sm' | 'md'
  componentSlug?: string | null
  showStatusDots?: boolean
  block?: boolean
}>(), {
  size: 'md',
  componentSlug: null,
  showStatusDots: false,
  block: false,
})

const { t } = useI18n()
const { framework, setFramework } = useDocsFramework()
const tabRefs = ref<Array<HTMLButtonElement | null>>([])

const activeIndex = computed(() => Math.max(0, DOCS_FRAMEWORKS.indexOf(framework.value)))
const componentEntry = computed(() => (props.componentSlug ? getComponentFrameworkEntry(props.componentSlug) : null))

const options = computed(() => DOCS_FRAMEWORKS.map((id) => {
  const meta = DOCS_FRAMEWORK_META[id]
  const status: FrameworkSupportStatus | null = componentEntry.value ? componentEntry.value[id] : null
  return {
    id,
    label: meta.shortLabel,
    fullLabel: meta.label,
    icon: meta.icon,
    status,
  }
}))

function setTabRef(index: number, el: unknown) {
  tabRefs.value[index] = el instanceof HTMLButtonElement ? el : null
}

function selectFramework(id: DocsFramework) {
  setFramework(id)
}

function cycleFramework(delta: -1 | 1) {
  const nextIndex = (activeIndex.value + delta + DOCS_FRAMEWORKS.length) % DOCS_FRAMEWORKS.length
  const nextId = DOCS_FRAMEWORKS[nextIndex]
  if (!nextId)
    return
  selectFramework(nextId)
  tabRefs.value[nextIndex]?.focus()
}
</script>

<template>
  <div
    class="docs-fw-switcher not-prose"
    :class="[
      `docs-fw-switcher--${props.size}`,
      { 'docs-fw-switcher--block': props.block },
    ]"
    role="tablist"
    :aria-label="t('docs.framework.switcherLabel')"
    :data-active-index="activeIndex"
  >
    <span class="docs-fw-switcher__thumb" aria-hidden="true" />
    <button
      v-for="(item, index) in options"
      :key="item.id"
      :ref="(el) => setTabRef(index, el)"
      type="button"
      role="tab"
      class="docs-fw-switcher__tab"
      :class="{ 'is-active': framework === item.id }"
      :aria-selected="framework === item.id"
      :tabindex="framework === item.id ? 0 : -1"
      :title="item.fullLabel"
      @click="selectFramework(item.id)"
      @keydown.left.prevent="cycleFramework(-1)"
      @keydown.right.prevent="cycleFramework(1)"
    >
      <span class="docs-fw-switcher__icon" :class="item.icon" aria-hidden="true" />
      <span class="docs-fw-switcher__label">{{ item.label }}</span>
      <span
        v-if="props.showStatusDots && item.status"
        class="docs-fw-switcher__dot"
        :data-status="item.status"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<style scoped>
.docs-fw-switcher {
  --fw-track: var(--tx-fill-color-light, #f5f7fa);
  --fw-thumb: var(--tx-bg-color, #ffffff);
  --fw-ring: var(--tx-border-color-lighter, #ebeef5);
  --fw-ink: var(--tx-text-color-regular, #606266);
  --fw-ink-active: var(--tx-text-color-primary, #303133);

  position: relative;
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--fw-track);
  box-shadow: inset 0 0 0 1px var(--fw-ring);
  user-select: none;
}

.docs-fw-switcher--block {
  display: grid;
  width: 100%;
}

.docs-fw-switcher--sm {
  border-radius: 9px;
  padding: 2px;
}

:global(.dark .docs-fw-switcher),
:global([data-theme='dark'] .docs-fw-switcher) {
  --fw-track: var(--tx-fill-color-lighter, #1d1d1d);
  --fw-thumb: var(--tx-fill-color, #303030);
  --fw-ring: var(--tx-border-color-lighter, rgba(255, 255, 255, 0.1));
}

.docs-fw-switcher__thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 10px) / 3);
  border-radius: 7px;
  background: var(--fw-thumb);
  box-shadow: var(--tx-elevation-1, 0 1px 3px rgba(0, 0, 0, 0.08));
  pointer-events: none;
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.docs-fw-switcher--sm .docs-fw-switcher__thumb {
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: calc((100% - 8px) / 3);
  border-radius: 7px;
}

.docs-fw-switcher[data-active-index='1'] .docs-fw-switcher__thumb {
  transform: translateX(calc(100% + 2px));
}

.docs-fw-switcher[data-active-index='2'] .docs-fw-switcher__thumb {
  transform: translateX(calc(200% + 4px));
}

.docs-fw-switcher__tab {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--fw-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}

.docs-fw-switcher--sm .docs-fw-switcher__tab {
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
}

.docs-fw-switcher__tab:hover {
  color: var(--fw-ink-active);
}

.docs-fw-switcher__tab.is-active {
  color: var(--fw-ink-active);
  font-weight: 600;
}

.docs-fw-switcher__tab:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.docs-fw-switcher__icon {
  flex: none;
  font-size: 13px;
}

.docs-fw-switcher--sm .docs-fw-switcher__icon {
  font-size: 12px;
}

.docs-fw-switcher__dot {
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--tx-text-color-placeholder, #a8abb2);
}

.docs-fw-switcher__dot[data-status='ready'] {
  background: var(--tx-color-success, #67c23a);
}

.docs-fw-switcher__dot[data-status='planned'] {
  background: var(--tx-color-warning, #e6a23c);
}

.docs-fw-switcher__dot[data-status='unsupported'] {
  background: var(--tx-text-color-placeholder, #a8abb2);
}

@media (prefers-reduced-motion: reduce) {
  .docs-fw-switcher__thumb {
    transition: none;
  }
}
</style>
