<script lang="ts" name="HomeSideLauncher" setup>
import type { PreviewArtifact } from '~/modules/conversation/preview-index'
import type { SidePanelWorkspaceKind } from '../composables/useHomeSidePanel'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  cleanPathCandidate,
  isHttpWebUrl,
  isPotentialFilePath,
  resolveAbsolutePath
} from '../composables/useFileLinkClick'

export interface LauncherQuickAction {
  id: string
  label: string
  icon: string
  count?: number
  waiting?: boolean
  chevron?: boolean
  run: () => void
}

const props = defineProps<{
  workspaceRoot?: string
  createdFiles: PreviewArtifact[]
  reviewCount: number
  outputsCount: number
  sourcesCount: number
  activityCount: number
  waiting: boolean
}>()

const emit = defineEmits<{
  (event: 'open-tool', kind: SidePanelWorkspaceKind): void
  (event: 'open-file-picker'): void
  (event: 'open-file', payload: { path: string; displayPath: string }): void
  (event: 'open-web', url: string): void
  (event: 'open-blank-browser'): void
}>()

const { t } = useI18n()
const inputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const highlightedIndex = ref(0)

const allActions = computed<LauncherQuickAction[]>(() => [
  {
    id: 'git',
    label: t('home.git.title'),
    icon: 'i-ri-git-branch-line',
    run: () => emit('open-tool', 'git')
  },
  {
    id: 'review',
    label: t('home.workspace.panel.review'),
    icon: 'i-ri-file-edit-line',
    count: props.reviewCount || undefined,
    run: () => emit('open-tool', 'review')
  },
  {
    id: 'open-file',
    label: t('home.sidePanel.openFile'),
    icon: 'i-ri-file-line',
    run: () => emit('open-file-picker')
  },
  {
    id: 'terminal',
    label: t('terminal.title'),
    icon: 'i-ri-terminal-box-line',
    run: () => emit('open-tool', 'terminal')
  },
  {
    id: 'browser',
    label: t('home.sidePanel.browser'),
    icon: 'i-ri-global-line',
    run: () => emit('open-blank-browser')
  },
  {
    id: 'outputs',
    label: t('home.preview.artifacts'),
    icon: 'i-ri-stack-line',
    count: props.outputsCount || undefined,
    run: () => emit('open-tool', 'outputs')
  },
  {
    id: 'work',
    label: t('home.preview.toolCalls'),
    icon: 'i-ri-pulse-line',
    count: props.activityCount || undefined,
    waiting: props.waiting,
    run: () => emit('open-tool', 'work')
  },
  {
    id: 'sources',
    label: t('home.preview.sources'),
    icon: 'i-ri-book-open-line',
    count: props.sourcesCount || undefined,
    run: () => emit('open-tool', 'sources')
  },
  {
    id: 'context',
    label: t('home.workspace.panel.context'),
    icon: 'i-ri-cpu-line',
    run: () => emit('open-tool', 'context')
  },
  {
    id: 'plugins',
    label: t('home.sidePanel.plugins'),
    icon: 'i-ri-puzzle-line',
    chevron: true,
    run: () => emit('open-tool', 'plugins')
  }
])

const filteredActions = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allActions.value
  return allActions.value.filter(
    (action) => action.label.toLowerCase().includes(q) || action.id.includes(q)
  )
})

const filteredFiles = computed(() => {
  const q = query.value.trim().toLowerCase()
  const files = props.createdFiles.filter((item) => Boolean(item.path))
  if (!q) return files.slice(0, 6)
  return files
    .filter(
      (item) => item.name.toLowerCase().includes(q) || (item.path ?? '').toLowerCase().includes(q)
    )
    .slice(0, 8)
})

function looksLikeDomain(value: string): boolean {
  return /^(?:localhost|\[[\da-f:]+\]|(?:[\p{L}\d-]+\.)+[\p{L}\d-]+)(?::\d{1,5})?(?:[/?#]|$)/iu.test(
    value
  )
}

function submitQuery(): void {
  const raw = query.value.trim()
  if (!raw) {
    const selected = filteredActions.value[highlightedIndex.value]
    selected?.run()
    return
  }

  // 1. Explicit http(s) URL
  if (isHttpWebUrl(raw)) {
    emit('open-web', raw)
    query.value = ''
    return
  }

  // 2. Local file path (absolute, relative, or filename with extension)
  if (isPotentialFilePath(raw) && !looksLikeDomain(raw)) {
    const cleaned = cleanPathCandidate(raw)
    const resolved = resolveAbsolutePath(cleaned, props.workspaceRoot)
    emit('open-file', { path: resolved, displayPath: cleaned })
    query.value = ''
    return
  }

  // 3. Domain / localhost
  if (looksLikeDomain(raw) && !/\s/.test(raw)) {
    const url = raw.startsWith('localhost') ? `http://${raw}` : `https://${raw}`
    emit('open-web', url)
    query.value = ''
    return
  }

  // 4. Matching quick action
  if (filteredActions.value.length > 0) {
    const target =
      filteredActions.value[Math.min(highlightedIndex.value, filteredActions.value.length - 1)]
    target?.run()
    query.value = ''
    return
  }

  // 5. Fallback: web search inside the right-sidebar browser
  emit('open-web', `https://www.google.com/search?q=${encodeURIComponent(raw)}`)
  query.value = ''
}

function onInputKeydown(event: KeyboardEvent): void {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (filteredActions.value.length) {
      highlightedIndex.value = (highlightedIndex.value + 1) % filteredActions.value.length
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (filteredActions.value.length) {
      highlightedIndex.value =
        (highlightedIndex.value - 1 + filteredActions.value.length) % filteredActions.value.length
    }
  } else if (event.key === 'Enter') {
    event.preventDefault()
    submitQuery()
  }
}

onMounted(() => {
  void nextTick(() => inputRef.value?.focus())
})
</script>

<template>
  <div class="HomeSideLauncher">
    <div class="HomeSideLauncher-SearchWrap">
      <label class="HomeSideLauncher-Omnibox">
        <span class="i-ri-search-line HomeSideLauncher-SearchIcon" aria-hidden="true" />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          spellcheck="false"
          autocomplete="off"
          class="HomeSideLauncher-Input"
          :placeholder="t('home.sidePanel.searchPlaceholder')"
          :aria-label="t('home.sidePanel.searchPlaceholder')"
          @keydown="onInputKeydown"
        />
        <button
          v-if="query"
          type="button"
          class="HomeSideLauncher-ClearBtn"
          :aria-label="t('common.close')"
          @click="query = ''"
        >
          <span class="i-ri-close-line" aria-hidden="true" />
        </button>
      </label>
    </div>

    <div class="HomeSideLauncher-List" role="list">
      <button
        v-for="(action, idx) in filteredActions"
        :key="action.id"
        type="button"
        class="HomeSideLauncher-Row"
        :class="{ 'is-highlighted': query && idx === highlightedIndex }"
        @click="action.run()"
      >
        <span :class="action.icon" class="HomeSideLauncher-RowIcon" aria-hidden="true" />
        <span class="HomeSideLauncher-RowLabel">{{ action.label }}</span>
        <span v-if="action.waiting" class="HomeSideLauncher-Waiting" aria-hidden="true" />
        <span v-if="action.count" class="HomeSideLauncher-Count">{{ action.count }}</span>
        <span
          v-if="action.chevron"
          class="i-ri-arrow-right-s-line HomeSideLauncher-Chevron"
          aria-hidden="true"
        />
      </button>

      <section v-if="filteredFiles.length" class="HomeSideLauncher-Section">
        <h3 class="HomePreview-GroupLabel">{{ t('home.preview.artifactsCreated') }}</h3>
        <button
          v-for="file in filteredFiles"
          :key="file.id"
          type="button"
          class="HomeSideLauncher-Row"
          :title="file.path"
          @click="file.path && emit('open-file', { path: file.path, displayPath: file.path })"
        >
          <span class="i-ri-file-code-line HomeSideLauncher-RowIcon" aria-hidden="true" />
          <span class="HomeSideLauncher-FileText">
            <span class="HomeSideLauncher-RowLabel">{{ file.name }}</span>
            <span v-if="file.dir" class="HomePreview-Detail">{{ file.dir }}</span>
          </span>
        </button>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.HomeSideLauncher {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 12px 14px 16px;
  box-sizing: border-box;
  overflow-y: auto;
}

.HomeSideLauncher-SearchWrap {
  flex: none;
}

.HomeSideLauncher-Omnibox {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  height: 38px;
  padding: 0 14px;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--shell-surface);
  box-shadow: inset 0 0 0 1px var(--shell-border-strong, var(--shell-border));

  &:focus-within {
    box-shadow:
      inset 0 0 0 1.5px var(--shell-primary),
      0 0 0 3px var(--shell-primary-soft);
  }
}

.HomeSideLauncher-SearchIcon {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 15px;
}

.HomeSideLauncher-Input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-body);
  outline: none;

  &::placeholder {
    color: var(--shell-text-muted);
  }
}

.HomeSideLauncher-ClearBtn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

.HomeSideLauncher-List {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.HomeSideLauncher-Row {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 9px 10px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-body);
  text-align: left;
  cursor: pointer;

  &:hover,
  &.is-highlighted {
    background: var(--shell-surface-2);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -2px;
  }
}

.HomeSideLauncher-RowIcon {
  flex: none;
  color: var(--shell-text-secondary);
  font-size: 16px;
}

.HomeSideLauncher-RowLabel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideLauncher-FileText {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.HomeSideLauncher-Count {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--shell-surface-2);
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.HomeSideLauncher-Waiting {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--shell-primary);
}

.HomeSideLauncher-Chevron {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 16px;
}

.HomeSideLauncher-Section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--shell-border);
}
</style>
