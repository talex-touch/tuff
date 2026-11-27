<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import type { FrameworkCompatEntry } from '~/data/tuffex-framework-matrix'
import type { PackageManager } from '~/utils/docs-install-command'
import type { DocsSuiteKey } from '~/utils/docs-suites'
import { formatInstallCommand } from '~/utils/docs-install-command'
import { DOCS_FRAMEWORK_META } from '~/utils/tuffex-component-slug'
import { useDocsFramework } from '~/composables/useDocsFramework'

const props = defineProps<{
  suite: Exclude<DocsSuiteKey, 'concepts' | 'templates'>
  version: string
}>()

const { locale, t } = useI18n()
const { framework } = useDocsFramework()
const packageManager = useState<PackageManager>('docs-install-manager', () => 'pnpm')

const localeKey = computed<'zh' | 'en'>(() => (locale.value === 'zh' ? 'zh' : 'en'))
const activeMeta = computed(() => DOCS_FRAMEWORK_META[framework.value])
const installCommand = computed(() =>
  formatInstallCommand({ kind: 'add', dev: false, rest: activeMeta.value.packageName }, packageManager.value),
)

// Lazy-load the 193-module compat matrix only when switching away from default Vue,
// keeping it out of the initial Vue suite page bundle.
const frameworkMatrix = shallowRef<readonly FrameworkCompatEntry[] | null>(null)
let unmounted = false

watch(
  framework,
  (activeFramework) => {
    if (activeFramework === 'vue' || frameworkMatrix.value)
      return
    void import('~/data/tuffex-framework-matrix').then((mod) => {
      if (!unmounted)
        frameworkMatrix.value = mod.TUFFEX_FRAMEWORK_MATRIX
    })
  },
  { immediate: true },
)

const suiteCategoryMap: Record<Exclude<DocsSuiteKey, 'concepts' | 'templates'>, 'base' | 'pro' | 'ai' | null> = {
  base: 'base',
  pro: 'pro',
  ai: 'ai',
  data: null,
  flow: 'ai',
  motion: 'pro',
}

const suiteEntries = computed(() => {
  const matrix = frameworkMatrix.value
  if (!matrix)
    return []
  const cat = suiteCategoryMap[props.suite]
  return matrix.filter(entry => cat === null || entry.category === cat)
})

const readyInSuite = computed(() => {
  if (framework.value === 'vue')
    return []
  return suiteEntries.value.filter(entry => entry[framework.value] === 'ready')
})

const showReadyList = ref(false)
watch([framework, () => props.suite], () => {
  showReadyList.value = false
})

const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

async function copyInstall() {
  if (!import.meta.client)
    return
  try {
    await navigator.clipboard.writeText(installCommand.value)
  }
  catch {
    return
  }
  copied.value = true
  if (copyTimer)
    clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copied.value = false
    copyTimer = null
  }, 1600)
}

onBeforeUnmount(() => {
  unmounted = true
  if (copyTimer)
    clearTimeout(copyTimer)
})
</script>

<template>
  <div class="docs-gallery-fw not-prose">
    <div class="docs-gallery__bar docs-gallery-fw__bar">
      <button
        type="button"
        class="docs-gallery__install"
        :aria-label="copied ? t('docs.codeBlock.copied') : t('docs.codeBlock.copy')"
        @click="copyInstall"
      >
        <span class="docs-gallery__install-prompt" aria-hidden="true">$</span>
        <code>{{ installCommand }}</code>
        <span
          class="docs-gallery__install-icon"
          :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'"
          aria-hidden="true"
        />
      </button>

      <span v-if="framework === 'vue'" class="docs-gallery__version">
        v{{ props.version }}
      </span>
      <div v-else class="docs-gallery-fw__right">
        <template v-if="readyInSuite.length">
          <span class="docs-gallery__version docs-gallery-fw__summary">
            <span class="docs-gallery-fw__summary-icon" :class="activeMeta.icon" aria-hidden="true" />
            <span>{{ t('docs.framework.gallerySuiteReady', { framework: activeMeta.shortLabel, ready: readyInSuite.length, total: suiteEntries.length }) }}</span>
          </span>
          <button
            type="button"
            class="docs-gallery-fw__toggle"
            :aria-expanded="showReadyList"
            @click="showReadyList = !showReadyList"
          >
            <span>{{ showReadyList ? t('docs.framework.galleryHideList') : t('docs.framework.galleryViewList', { count: readyInSuite.length }) }}</span>
            <span class="docs-gallery-fw__toggle-icon i-carbon-chevron-down" :class="{ 'is-open': showReadyList }" aria-hidden="true" />
          </button>
        </template>
        <span v-else-if="frameworkMatrix" class="docs-gallery-fw__planned">
          <span class="docs-gallery-fw__summary-icon" :class="activeMeta.icon" aria-hidden="true" />
          <span>{{ t('docs.framework.gallerySuitePlanned', { framework: activeMeta.shortLabel }) }}</span>
        </span>
      </div>
    </div>
    <div v-if="framework !== 'vue' && readyInSuite.length && showReadyList" class="docs-gallery-fw__strip">
      <div class="docs-gallery-fw__chips">
        <NuxtLink
          v-for="item in readyInSuite"
          :key="item.id"
          :to="`/${localeKey}/${item.id}`"
          class="docs-gallery-fw__chip"
        >
          {{ item.name }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.docs-gallery-fw__bar {
  flex-wrap: wrap;
}

.docs-gallery-fw__right {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-family: inherit;
}

.docs-gallery-fw__summary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-weight: 500;
}

.docs-gallery-fw__summary-icon {
  flex: none;
  font-size: 12px;
}

.docs-gallery-fw__toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-light, #e4e7ed);
  color: var(--tx-text-color-regular, #606266);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
}

.docs-gallery-fw__toggle:hover {
  background: var(--tx-fill-color, #f0f2f5);
  color: var(--tx-text-color-primary, #303133);
}

.docs-gallery-fw__toggle:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

:global(.dark .docs-gallery-fw__toggle),
:global([data-theme='dark'] .docs-gallery-fw__toggle) {
  background: var(--tx-fill-color-lighter, #1d1d1d);
}

.docs-gallery-fw__toggle-icon {
  font-size: 12px;
  transition: transform 0.16s ease;
}

.docs-gallery-fw__toggle-icon.is-open {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .docs-gallery-fw__toggle-icon {
    transition: none;
  }
}

.docs-gallery-fw__planned {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-regular, #606266);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.docs-gallery-fw__strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding: 10px 18px 12px;
  border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
  background: var(--tx-fill-color-light, #f5f7fa);
  font-size: 12px;
  color: var(--tx-text-color-regular, #606266);
}

:global(.dark .docs-gallery-fw__strip),
:global([data-theme='dark'] .docs-gallery-fw__strip) {
  background: var(--tx-fill-color-lighter, #1d1d1d);
}

.docs-gallery-fw__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.docs-gallery-fw__chip {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-success, #67c23a) 12%, var(--tx-bg-color, #ffffff));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-success, #67c23a) 30%, transparent);
  color: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--tx-text-color-primary, #303133));
  font-size: 11px;
  font-weight: 500;
  text-decoration: none;
}

.docs-gallery-fw__chip:hover {
  box-shadow: inset 0 0 0 1px var(--tx-color-primary, #409eff);
  color: var(--tx-color-primary, #409eff);
}
</style>
