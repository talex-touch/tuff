<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { PackageManager } from '~/utils/docs-install-command'
import type { DocsFramework, FrameworkSupportStatus } from '~/data/tuffex-framework-matrix'
import {
  buildFrameworkImportSnippet,
  buildFrameworkInstallSnippet,
  DOCS_FRAMEWORK_META,
  DOCS_FRAMEWORKS,
  formatFrameworkStatusLabel,
  formatTierDescription,
  getComponentFrameworkEntry,
} from '~/data/tuffex-framework-matrix'
import { useDocsFramework } from '~/composables/useDocsFramework'

const props = defineProps<{
  slug: string
}>()

const { locale, t } = useI18n()
const { framework, setFramework } = useDocsFramework()
const packageManager = useState<PackageManager>('docs-install-manager', () => 'pnpm')

const localeKey = computed<'zh' | 'en'>(() => (locale.value === 'zh' ? 'zh' : 'en'))
const entry = computed(() => getComponentFrameworkEntry(props.slug))

const activeStatus = computed<FrameworkSupportStatus>(() => {
  if (!entry.value)
    return framework.value === 'vue' ? 'ready' : 'planned'
  return entry.value[framework.value]
})

const frameworkPills = computed(() => {
  if (!entry.value)
    return []
  return DOCS_FRAMEWORKS.map((id) => {
    const meta = DOCS_FRAMEWORK_META[id]
    const status = entry.value![id]
    return {
      id,
      label: meta.shortLabel,
      fullLabel: meta.label,
      icon: meta.icon,
      status,
      statusText: formatFrameworkStatusLabel(status, localeKey.value, id),
    }
  })
})

const tierTooltip = computed(() => (entry.value ? formatTierDescription(entry.value.tier, localeKey.value) : ''))

const installSnippet = computed(() => buildFrameworkInstallSnippet(framework.value, packageManager.value))
const importSnippet = computed(() => (entry.value ? buildFrameworkImportSnippet(entry.value, framework.value) : ''))

const activeTargetSymbol = computed(() => {
  if (!entry.value)
    return ''
  if (framework.value === 'vue')
    return entry.value.vueExports[0] ?? ''
  if (framework.value === 'react')
    return entry.value.reactExports.join(', ')
  return entry.value.wcTags?.map(tag => `<${tag}>`).join(' ') ?? '—'
})

const statusNote = computed(() => {
  if (!entry.value)
    return ''
  if (activeStatus.value === 'unsupported')
    return localeKey.value === 'zh' ? (entry.value.notesZh ?? '') : (entry.value.notes ?? '')
  return ''
})

const copiedInstall = ref(false)
const copiedImport = ref(false)
let installTimer: ReturnType<typeof setTimeout> | null = null
let importTimer: ReturnType<typeof setTimeout> | null = null

async function copyText(text: string, which: 'install' | 'import') {
  if (!import.meta.client || !text)
    return
  try {
    await navigator.clipboard.writeText(text)
    if (which === 'install') {
      copiedInstall.value = true
      if (installTimer)
        clearTimeout(installTimer)
      installTimer = setTimeout(() => {
        copiedInstall.value = false
        installTimer = null
      }, 1500)
    }
    else {
      copiedImport.value = true
      if (importTimer)
        clearTimeout(importTimer)
      importTimer = setTimeout(() => {
        copiedImport.value = false
        importTimer = null
      }, 1500)
    }
  }
  catch {
    // Ignore clipboard rejection.
  }
}

function selectPill(id: DocsFramework) {
  setFramework(id)
}

onBeforeUnmount(() => {
  if (installTimer)
    clearTimeout(installTimer)
  if (importTimer)
    clearTimeout(importTimer)
})
</script>

<template>
  <section v-if="entry" class="docs-fw-strip not-prose" :aria-label="t('docs.framework.switcherLabel')">
    <div class="docs-fw-strip__top">
      <div class="docs-fw-strip__pills" role="group" :aria-label="t('docs.framework.switcherLabel')">
        <span class="docs-fw-strip__tier" :data-tier="entry.tier" :title="tierTooltip">
          Tier {{ entry.tier }}
        </span>
        <button
          v-for="pill in frameworkPills"
          :key="pill.id"
          type="button"
          class="docs-fw-strip__pill"
          :class="{ 'is-selected': framework === pill.id }"
          :data-status="pill.status"
          :aria-pressed="framework === pill.id"
          :title="`${pill.fullLabel}: ${pill.statusText}`"
          @click="selectPill(pill.id)"
        >
          <span class="docs-fw-strip__pill-icon" :class="pill.icon" aria-hidden="true" />
          <span class="docs-fw-strip__pill-name">{{ pill.label }}</span>
          <span class="docs-fw-strip__pill-sep" aria-hidden="true">·</span>
          <span class="docs-fw-strip__pill-state">{{ pill.statusText }}</span>
        </button>
      </div>
    </div>

    <p v-if="statusNote" class="docs-fw-strip__note">
      <span class="i-carbon-information docs-fw-strip__note-icon" aria-hidden="true" />
      <span>{{ statusNote }}</span>
    </p>

    <div v-else-if="framework !== 'vue'" class="docs-fw-strip__snippets">
      <div class="docs-fw-strip__snippet-row">
        <span class="docs-fw-strip__snippet-label">{{ t('docs.framework.installLabel') }}</span>
        <code class="docs-fw-strip__code">{{ installSnippet }}</code>
        <span v-if="activeTargetSymbol" class="docs-fw-strip__symbol" :title="activeTargetSymbol">
          {{ activeTargetSymbol }}
        </span>
        <button
          type="button"
          class="docs-fw-strip__copy"
          :aria-label="copiedInstall ? t('docs.framework.copied') : t('docs.framework.copyInstall')"
          :title="copiedInstall ? t('docs.framework.copied') : t('docs.framework.copyInstall')"
          @click="copyText(installSnippet, 'install')"
        >
          <span :class="copiedInstall ? 'i-carbon-checkmark' : 'i-carbon-copy'" aria-hidden="true" />
        </button>
      </div>
      <div class="docs-fw-strip__snippet-row docs-fw-strip__snippet-row--multiline">
        <span class="docs-fw-strip__snippet-label">{{ t('docs.framework.importLabel') }}</span>
        <pre class="docs-fw-strip__pre"><code>{{ importSnippet }}</code></pre>
        <button
          type="button"
          class="docs-fw-strip__copy"
          :aria-label="copiedImport ? t('docs.framework.copied') : t('docs.framework.copyImport')"
          :title="copiedImport ? t('docs.framework.copied') : t('docs.framework.copyImport')"
          @click="copyText(importSnippet, 'import')"
        >
          <span :class="copiedImport ? 'i-carbon-checkmark' : 'i-carbon-copy'" aria-hidden="true" />
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.docs-fw-strip {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  border-radius: 14px;
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

:global(.dark .docs-fw-strip),
:global([data-theme='dark'] .docs-fw-strip) {
  background: color-mix(in srgb, var(--tx-fill-color-lighter, #1d1d1d) 82%, var(--tx-bg-color, #141414));
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, rgba(255, 255, 255, 0.08));
}

.docs-fw-strip__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.docs-fw-strip__pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.docs-fw-strip__tier {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 7%, transparent);
  color: var(--tx-text-color-regular, #606266);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.docs-fw-strip__pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 9px;
  border: 0;
  border-radius: 999px;
  background: var(--tx-bg-color, #ffffff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-regular, #606266);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
}

:global(.dark .docs-fw-strip__pill),
:global([data-theme='dark'] .docs-fw-strip__pill) {
  background: var(--tx-fill-color-light, #262727);
}

.docs-fw-strip__pill[data-status='ready'] {
  background: color-mix(in srgb, var(--tx-color-success, #67c23a) 12%, var(--tx-bg-color, #ffffff));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-success, #67c23a) 35%, transparent);
  color: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--tx-text-color-primary, #303133));
}

.docs-fw-strip__pill[data-status='planned'] {
  background: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 11%, var(--tx-bg-color, #ffffff));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-warning, #e6a23c) 32%, transparent);
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 45%, var(--tx-text-color-primary, #303133));
}

.docs-fw-strip__pill[data-status='unsupported'] {
  background: color-mix(in srgb, var(--tx-text-color-secondary, #909399) 10%, var(--tx-bg-color, #ffffff));
  box-shadow: inset 0 0 0 1px var(--tx-border-color-light, #e4e7ed);
  color: var(--tx-text-color-regular, #606266);
}

.docs-fw-strip__pill:hover {
  box-shadow: inset 0 0 0 1px var(--tx-color-primary, #409eff);
}

.docs-fw-strip__pill.is-selected {
  box-shadow:
    inset 0 0 0 1.5px var(--tx-color-primary, #409eff),
    0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
}

.docs-fw-strip__pill:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.docs-fw-strip__pill-icon {
  font-size: 12px;
}

.docs-fw-strip__pill-name {
  font-weight: 600;
}

.docs-fw-strip__pill-sep {
  opacity: 0.45;
}

.docs-fw-strip__note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 8px 10px;
  border-radius: 9px;
  background: var(--tx-bg-color, #ffffff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  line-height: 1.5;
  text-wrap: pretty;
}

:global(.dark .docs-fw-strip__note),
:global([data-theme='dark'] .docs-fw-strip__note) {
  background: var(--tx-bg-color, #141414);
}

.docs-fw-strip__note-icon {
  flex: none;
  margin-top: 2px;
  font-size: 14px;
  color: var(--tx-color-info, #909399);
}

.docs-fw-strip__snippets {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}

.docs-fw-strip__snippet-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  padding: 6px 8px 6px 10px;
  border-radius: 9px;
  background: var(--tx-bg-color, #ffffff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.docs-fw-strip__snippet-row--multiline {
  align-items: flex-start;
}

:global(.dark .docs-fw-strip__snippet-row),
:global([data-theme='dark'] .docs-fw-strip__snippet-row) {
  background: var(--tx-bg-color, #141414);
}

.docs-fw-strip__snippet-label {
  flex: none;
  min-width: 44px;
  padding-top: 1px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.docs-fw-strip__code,
.docs-fw-strip__pre {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  margin: 0;
  overflow-x: auto;
  scrollbar-width: thin;
  color: var(--tx-text-color-primary, #303133);
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
}

.docs-fw-strip__code {
  white-space: nowrap;
}

.docs-fw-strip__pre {
  white-space: pre;
}

.docs-fw-strip__symbol {
  flex: none;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-regular, #606266);
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}

.docs-fw-strip__copy {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  font-size: 13px;
}

.docs-fw-strip__copy:hover {
  background: var(--tx-fill-color, #f0f2f5);
  color: var(--tx-text-color-primary, #303133);
}

.docs-fw-strip__copy:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}
</style>
