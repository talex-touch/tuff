<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { PackageManager } from '~/utils/docs-install-command'
import type { DocsSuiteKey } from '~/utils/docs-suites'
import { toLocalizedDocsPath } from '#shared/utils/docs-path'
import {
  buildFrameworkInstallSnippet,
  DOCS_FRAMEWORK_META,
  getFrameworkCoverageSummary,
  TUFFEX_FRAMEWORK_MATRIX,
} from '~/data/tuffex-framework-matrix'
import { useDocsFramework } from '~/composables/useDocsFramework'
import DocsFrameworkSwitcher from './DocsFrameworkSwitcher.vue'

const props = defineProps<{
  suite: Exclude<DocsSuiteKey, 'concepts' | 'templates'>
  version: string
}>()

const { locale, t } = useI18n()
const { framework } = useDocsFramework()
const packageManager = useState<PackageManager>('docs-install-manager', () => 'pnpm')

const localeKey = computed<'zh' | 'en'>(() => (locale.value === 'zh' ? 'zh' : 'en'))
const installCommand = computed(() => buildFrameworkInstallSnippet(framework.value, packageManager.value))
const activeMeta = computed(() => DOCS_FRAMEWORK_META[framework.value])
const coverage = computed(() => getFrameworkCoverageSummary())

const suiteCategoryMap: Record<Exclude<DocsSuiteKey, 'concepts' | 'templates'>, 'base' | 'pro' | 'ai' | null> = {
  base: 'base',
  pro: 'pro',
  ai: 'ai',
  data: null,
  flow: 'ai',
  motion: 'pro',
}

const readyInSuite = computed(() => {
  if (framework.value === 'vue')
    return []
  const cat = suiteCategoryMap[props.suite]
  return TUFFEX_FRAMEWORK_MATRIX.filter(entry =>
    entry[framework.value] === 'ready'
    && (cat === null || entry.category === cat),
  )
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
  if (copyTimer)
    clearTimeout(copyTimer)
})
</script>

<template>
  <div class="docs-gallery-fw not-prose">
    <div class="docs-gallery__bar">
      <button
        type="button"
        class="docs-gallery__install"
        :aria-label="`${t('docs.framework.copyInstall')}: ${installCommand}`"
        @click="copyInstall"
      >
        <span class="docs-gallery__install-prompt" aria-hidden="true">$</span>
        <span>{{ installCommand }}</span>
        <span class="docs-gallery__install-icon" :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" aria-hidden="true" />
      </button>
      <div class="docs-gallery-fw__right">
        <DocsFrameworkSwitcher size="sm" />
        <span class="docs-gallery__version">
          <template v-if="framework === 'vue'">v{{ props.version }}</template>
          <template v-else>{{ activeMeta.shortLabel }} {{ coverage[framework].ready }}/{{ coverage.total }}</template>
        </span>
      </div>
    </div>
    <div v-if="framework !== 'vue'" class="docs-gallery-fw__strip">
      <span class="docs-gallery-fw__strip-label">
        <span :class="activeMeta.icon" aria-hidden="true" />
        <template v-if="readyInSuite.length">
          {{ localeKey === 'zh'
            ? `本套件已适配 ${activeMeta.shortLabel}（${readyInSuite.length}）：`
            : `${activeMeta.shortLabel} ready in this suite (${readyInSuite.length}):` }}
        </template>
        <template v-else>
          {{ localeKey === 'zh'
            ? `本套件组件正在规划 ${activeMeta.shortLabel} 适配（当前展示 Vue 实时示例）`
            : `${activeMeta.shortLabel} adaptation planned for this suite (showing live Vue specimens)` }}
        </template>
      </span>
      <div v-if="readyInSuite.length" class="docs-gallery-fw__chips">
        <NuxtLink
          v-for="item in readyInSuite"
          :key="item.id"
          :to="toLocalizedDocsPath(`/docs/dev/components/${item.id}`, localeKey)"
          class="docs-gallery-fw__chip"
        >
          {{ item.name }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.docs-gallery-fw__right {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.docs-gallery-fw__strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding: 8px 18px 10px;
  border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
  background: var(--tx-fill-color-light, #f5f7fa);
  font-size: 12px;
  color: var(--tx-text-color-regular, #606266);
}

:global(.dark .docs-gallery-fw__strip),
:global([data-theme='dark'] .docs-gallery-fw__strip) {
  background: var(--tx-fill-color-lighter, #1d1d1d);
}

.docs-gallery-fw__strip-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 500;
}

.docs-gallery-fw__chips {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.docs-gallery-fw__chip {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
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
