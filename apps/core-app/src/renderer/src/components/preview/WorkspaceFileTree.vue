<script lang="ts" name="WorkspaceFileTree" setup>
import type { WorkspaceFileEntry } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import {
  TxContextMenu,
  TxContextMenuDivider,
  TxContextMenuItem
} from '@talex-touch/tuffex/context-menu'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AgentWorkspaceEvents } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { SHELL_MENU_CARD } from '~/components/shell/shell-menu-panel'
import { basenameOfPath } from '~/modules/browser-workspace/preview-url'
import {
  flattenFileTree,
  formatCompactFileSize,
  normalizePosixPath,
  resolveAncestorDirectories,
  resolveFileIconClass
} from './workspace-file-tree'

const props = withDefaults(
  defineProps<{
    rootPath?: string
    conversationId?: string | null
    activePath?: string
    /** When updated, reveals & expands this directory inside the tree. */
    revealDirPath?: string
    revealNonce?: number
    /** Compact drawer presentation beside a file viewer vs full-width tab. */
    compact?: boolean
  }>(),
  {
    rootPath: '',
    conversationId: null,
    activePath: '',
    revealDirPath: '',
    revealNonce: 0,
    compact: false
  }
)

const emit = defineEmits<{
  (event: 'open-file', payload: { path: string; displayPath: string }): void
  (event: 'close'): void
}>()

const { t } = useI18n()
const transport = isElectronRenderer() ? useTuffTransport() : null

function resolveAppSdk() {
  try {
    return typeof useAppSdk === 'function' ? useAppSdk() : null
  } catch {
    return null
  }
}

const query = ref('')
const showHidden = ref(false)
const rootLoading = ref(false)
const rootError = ref('')
const childrenByDir = reactive<Record<string, WorkspaceFileEntry[]>>({})
const expandedDirs = ref<Set<string>>(new Set())
const loadingDirs = ref<Set<string>>(new Set())
const focusedPath = ref<string | null>(null)
const contextMenuRef = ref<InstanceType<typeof TxContextMenu> | null>(null)
const contextMenuOpen = ref(false)
const contextTarget = ref<{ path: string; name: string; isDirectory: boolean } | null>(null)

let rootGeneration = 0

const normalizedRoot = computed(() => (props.rootPath ? normalizePosixPath(props.rootPath) : ''))
const rootName = computed(() =>
  normalizedRoot.value ? basenameOfPath(normalizedRoot.value) || normalizedRoot.value : ''
)

const rows = computed(() =>
  flattenFileTree({
    rootPath: normalizedRoot.value,
    childrenByDir,
    expandedDirs: expandedDirs.value,
    loadingDirs: loadingDirs.value,
    activePath: props.activePath,
    showHidden: showHidden.value,
    query: query.value
  })
)

function toDisplayPath(fullPath: string): string {
  const norm = normalizePosixPath(fullPath)
  const root = normalizedRoot.value
  if (root && norm.startsWith(`${root}/`)) {
    return norm.slice(root.length + 1)
  }
  return fullPath
}

async function fetchDirectory(
  dirPath: string,
  force = false
): Promise<WorkspaceFileEntry[] | null> {
  const normDir = normalizePosixPath(dirPath)
  if (!normDir || !transport) return null
  if (!force && childrenByDir[normDir]) {
    return childrenByDir[normDir]!
  }

  const nextLoading = new Set(loadingDirs.value)
  nextLoading.add(normDir)
  loadingDirs.value = nextLoading

  try {
    const result = await transport.send(AgentWorkspaceEvents.readFile, {
      path: normDir,
      conversationId: props.conversationId ?? null
    })
    if (result.kind === 'directory') {
      childrenByDir[normDir] = result.entries ?? []
      return childrenByDir[normDir]!
    }
    return null
  } catch (err) {
    if (normDir === normalizedRoot.value) {
      rootError.value = err instanceof Error ? err.message : t('home.preview.readFailed')
    }
    return null
  } finally {
    const doneLoading = new Set(loadingDirs.value)
    doneLoading.delete(normDir)
    loadingDirs.value = doneLoading
  }
}

async function loadRoot(force = false): Promise<void> {
  const root = normalizedRoot.value
  const gen = ++rootGeneration
  rootError.value = ''

  if (!root) {
    for (const key of Object.keys(childrenByDir)) delete childrenByDir[key]
    expandedDirs.value = new Set()
    rootLoading.value = false
    return
  }

  if (!transport) {
    rootError.value = t('home.preview.readFailed')
    rootLoading.value = false
    return
  }

  if (force) {
    for (const key of Object.keys(childrenByDir)) delete childrenByDir[key]
  }

  rootLoading.value = !childrenByDir[root]
  await fetchDirectory(root, force)
  if (gen !== rootGeneration) return
  rootLoading.value = false

  if (props.activePath) {
    await revealPath(props.activePath, false)
  }
}

async function revealPath(targetPath: string, includeTargetDir: boolean): Promise<void> {
  const root = normalizedRoot.value
  if (!root || !targetPath) return
  const ancestors = resolveAncestorDirectories(targetPath, root, includeTargetDir)
  if (ancestors.length === 0) return

  const nextExpanded = new Set(expandedDirs.value)
  for (const dir of ancestors) {
    if (dir !== root) {
      nextExpanded.add(dir)
    }
    await fetchDirectory(dir)
  }
  expandedDirs.value = nextExpanded
}

async function toggleDirectory(dirPath: string): Promise<void> {
  const norm = normalizePosixPath(dirPath)
  const next = new Set(expandedDirs.value)
  if (next.has(norm)) {
    next.delete(norm)
    expandedDirs.value = next
    return
  }
  next.add(norm)
  expandedDirs.value = next
  await fetchDirectory(norm)
}

function collapseAll(): void {
  expandedDirs.value = new Set()
}

function handleRowClick(row: { path: string; isDirectory: boolean }): void {
  focusedPath.value = row.path
  if (row.isDirectory) {
    void toggleDirectory(row.path)
    return
  }
  emit('open-file', {
    path: row.path,
    displayPath: toDisplayPath(row.path)
  })
}

function handleRowKeydown(
  event: KeyboardEvent,
  row: { path: string; isDirectory: boolean; expanded: boolean },
  index: number
): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    const next = rows.value[index + 1]
    if (next) focusRowByPath(next.path)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    const prev = rows.value[index - 1]
    if (prev) focusRowByPath(prev.path)
  } else if (event.key === 'ArrowRight' && row.isDirectory && !row.expanded) {
    event.preventDefault()
    void toggleDirectory(row.path)
  } else if (event.key === 'ArrowLeft' && row.isDirectory && row.expanded) {
    event.preventDefault()
    void toggleDirectory(row.path)
  }
}

function focusRowByPath(targetPath: string): void {
  focusedPath.value = targetPath
  const el = document.querySelector<HTMLButtonElement>(
    `[data-file-tree-path="${CSS.escape(targetPath)}"]`
  )
  el?.focus()
}

function openRowContextMenu(
  event: MouseEvent,
  row: { path: string; name: string; isDirectory: boolean }
): void {
  contextTarget.value = row
  contextMenuRef.value?.openAt(event)
}

async function copyTargetPath(relative: boolean): Promise<void> {
  const target = contextTarget.value
  contextMenuOpen.value = false
  if (!target) return
  try {
    await navigator.clipboard.writeText(relative ? toDisplayPath(target.path) : target.path)
    toast.success(t('home.copied'))
  } catch {
    // ignore clipboard errors
  }
}

async function revealTargetInFinder(): Promise<void> {
  const target = contextTarget.value
  contextMenuOpen.value = false
  if (!target) return
  try {
    const appSdk = resolveAppSdk()
    if (appSdk) {
      await appSdk.showInFolder(target.path, { reveal: true })
    }
  } catch {
    toast.error(t('home.preview.openFailed'))
  }
}

async function openTargetExternal(): Promise<void> {
  const target = contextTarget.value
  contextMenuOpen.value = false
  if (!target || !transport) return
  try {
    await transport.send(AgentWorkspaceEvents.openFileExternal, {
      path: target.path,
      conversationId: props.conversationId ?? null
    })
  } catch {
    toast.error(t('home.preview.openFailed'))
  }
}

watch(
  [normalizedRoot, () => props.conversationId],
  () => {
    void loadRoot(false)
  },
  { immediate: true }
)

watch(
  () => props.activePath,
  (nextPath) => {
    if (nextPath && normalizedRoot.value) {
      void revealPath(nextPath, false)
    }
  }
)

watch(
  () => [props.revealDirPath, props.revealNonce] as const,
  ([dirPath]) => {
    if (dirPath && normalizedRoot.value) {
      void revealPath(dirPath, true)
    }
  }
)
</script>

<template>
  <section
    class="WorkspaceFileTree"
    :class="{ 'is-compact': compact }"
    :aria-label="t('home.sidePanel.files')"
    data-testid="workspace-file-tree"
  >
    <header class="WorkspaceFileTree-Header">
      <div class="WorkspaceFileTree-Root" :title="normalizedRoot">
        <span class="i-ri-folder-3-line WorkspaceFileTree-RootIcon" aria-hidden="true" />
        <span class="WorkspaceFileTree-RootName">
          {{ rootName || t('home.sidePanel.files') }}
        </span>
      </div>

      <div class="WorkspaceFileTree-Actions">
        <button
          type="button"
          class="WorkspaceFileTree-ActionBtn"
          :class="{ 'is-active': showHidden }"
          :aria-pressed="showHidden"
          :title="t('home.sidePanel.toggleHiddenFiles')"
          :aria-label="t('home.sidePanel.toggleHiddenFiles')"
          data-testid="file-tree-toggle-hidden"
          @click="showHidden = !showHidden"
        >
          <span :class="showHidden ? 'i-ri-eye-line' : 'i-ri-eye-off-line'" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="WorkspaceFileTree-ActionBtn"
          :title="t('home.sidePanel.collapseAllFolders')"
          :aria-label="t('home.sidePanel.collapseAllFolders')"
          data-testid="file-tree-collapse-all"
          @click="collapseAll"
        >
          <span class="i-ri-contract-up-down-line" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="WorkspaceFileTree-ActionBtn"
          :title="t('home.sidePanel.reload')"
          :aria-label="t('home.sidePanel.reload')"
          data-testid="file-tree-refresh"
          @click="loadRoot(true)"
        >
          <span class="i-ri-refresh-line" aria-hidden="true" />
        </button>

        <button
          v-if="compact"
          type="button"
          class="WorkspaceFileTree-ActionBtn"
          :title="t('common.close')"
          :aria-label="t('common.close')"
          data-testid="file-tree-close"
          @click="emit('close')"
        >
          <span class="i-ri-close-line" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div v-if="normalizedRoot" class="WorkspaceFileTree-Filter">
      <span class="i-ri-search-line WorkspaceFileTree-FilterIcon" aria-hidden="true" />
      <input
        v-model="query"
        type="search"
        class="WorkspaceFileTree-FilterInput"
        :placeholder="t('home.sidePanel.filterFilesPlaceholder')"
        :aria-label="t('home.sidePanel.filterFilesPlaceholder')"
        data-testid="file-tree-filter-input"
      />
      <button
        v-if="query"
        type="button"
        class="WorkspaceFileTree-FilterClear"
        :aria-label="t('common.clear')"
        @click="query = ''"
      >
        <span class="i-ri-close-circle-fill" aria-hidden="true" />
      </button>
    </div>

    <div class="WorkspaceFileTree-Body" role="tree" :aria-label="t('home.sidePanel.files')">
      <div v-if="!normalizedRoot" class="WorkspaceFileTree-Empty">
        <span class="i-ri-folder-unknow-line WorkspaceFileTree-EmptyIcon" aria-hidden="true" />
        <p class="WorkspaceFileTree-EmptyText">{{ t('home.sidePanel.noWorkspaceRoot') }}</p>
      </div>

      <div v-else-if="rootLoading" class="WorkspaceFileTree-Loading" aria-hidden="true">
        <TxSkeleton :rows="7" animated />
      </div>

      <div v-else-if="rootError" class="WorkspaceFileTree-Empty" role="alert">
        <span class="i-ri-error-warning-line WorkspaceFileTree-EmptyIcon" aria-hidden="true" />
        <p class="WorkspaceFileTree-EmptyText">{{ rootError }}</p>
      </div>

      <div v-else-if="rows.length === 0" class="WorkspaceFileTree-Empty">
        <p class="WorkspaceFileTree-EmptyText">
          {{ query ? t('home.sidePanel.filesFilterEmpty') : t('home.sidePanel.filesEmpty') }}
        </p>
      </div>

      <div v-else class="WorkspaceFileTree-List">
        <button
          v-for="(row, index) in rows"
          :key="row.path"
          type="button"
          role="treeitem"
          class="WorkspaceFileTree-Row"
          :class="{
            'is-active': row.isActive,
            'is-hidden': row.isHidden,
            'is-dir': row.isDirectory
          }"
          :style="{ '--tree-depth': row.depth }"
          :aria-expanded="row.isDirectory ? row.expanded : undefined"
          :aria-selected="row.isActive"
          :data-file-tree-path="row.path"
          :title="toDisplayPath(row.path)"
          @click="handleRowClick(row)"
          @keydown="handleRowKeydown($event, row, index)"
          @contextmenu.prevent="openRowContextMenu($event, row)"
        >
          <span v-if="row.depth > 0" class="WorkspaceFileTree-Guides" aria-hidden="true">
            <span
              v-for="level in row.depth"
              :key="level"
              class="WorkspaceFileTree-Guide"
              :style="{ left: `${(level - 1) * 14 + 13}px` }"
            />
          </span>

          <span class="WorkspaceFileTree-Chevron" aria-hidden="true">
            <span
              v-if="row.isDirectory"
              :class="
                row.loading
                  ? 'i-ri-loader-4-line is-spin'
                  : row.expanded
                    ? 'i-ri-arrow-down-s-line'
                    : 'i-ri-arrow-right-s-line'
              "
            />
          </span>

          <span
            :class="resolveFileIconClass(row.name, row.isDirectory, row.expanded)"
            class="WorkspaceFileTree-Icon"
            aria-hidden="true"
          />
          <span class="WorkspaceFileTree-Name">{{ row.name }}</span>
          <span
            v-if="!compact && !row.isDirectory && row.size !== undefined"
            class="WorkspaceFileTree-Size"
          >
            {{ formatCompactFileSize(row.size) }}
          </span>
        </button>
      </div>
    </div>

    <TxContextMenu
      ref="contextMenuRef"
      v-model="contextMenuOpen"
      :panel-card="SHELL_MENU_CARD"
      panel-background="refraction"
    >
      <TxContextMenuItem
        v-if="contextTarget && !contextTarget.isDirectory"
        @select="
          () => {
            if (contextTarget) {
              emit('open-file', {
                path: contextTarget.path,
                displayPath: toDisplayPath(contextTarget.path)
              })
            }
            contextMenuOpen = false
          }
        "
      >
        <span class="WorkspaceFileTree-MenuItem">
          <span class="i-ri-file-text-line" aria-hidden="true" />
          <span>{{ t('home.sidePanel.openInSidePanel') }}</span>
        </span>
      </TxContextMenuItem>
      <TxContextMenuItem @select="copyTargetPath(true)">
        <span class="WorkspaceFileTree-MenuItem">
          <span class="i-ri-file-copy-line" aria-hidden="true" />
          <span>{{ t('home.sidePanel.copyRelativePath') }}</span>
        </span>
      </TxContextMenuItem>
      <TxContextMenuItem @select="copyTargetPath(false)">
        <span class="WorkspaceFileTree-MenuItem">
          <span class="i-ri-links-line" aria-hidden="true" />
          <span>{{ t('home.sidePanel.copyFullPath') }}</span>
        </span>
      </TxContextMenuItem>
      <TxContextMenuDivider />
      <TxContextMenuItem
        v-if="contextTarget && !contextTarget.isDirectory"
        @select="openTargetExternal"
      >
        <span class="WorkspaceFileTree-MenuItem">
          <span class="i-ri-external-link-line" aria-hidden="true" />
          <span>{{ t('home.fileLink.openWithSystem') }}</span>
        </span>
      </TxContextMenuItem>
      <TxContextMenuItem @select="revealTargetInFinder">
        <span class="WorkspaceFileTree-MenuItem">
          <span class="i-ri-folder-open-line" aria-hidden="true" />
          <span>{{ t('home.fileLink.revealInFinder') }}</span>
        </span>
      </TxContextMenuItem>
    </TxContextMenu>
  </section>
</template>

<style lang="scss" scoped>
.WorkspaceFileTree {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--shell-bg);
  color: var(--shell-text-primary);
  box-sizing: border-box;
}

.WorkspaceFileTree-Header {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 8px 0 10px;
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-surface);
  box-sizing: border-box;
}

.WorkspaceFileTree-Root {
  display: inline-flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.WorkspaceFileTree-RootIcon {
  flex: none;
  font-size: 14px;
  color: var(--shell-primary);
}

.WorkspaceFileTree-RootName {
  overflow: hidden;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.WorkspaceFileTree-Actions {
  display: inline-flex;
  flex: none;
  gap: 2px;
  align-items: center;
}

.WorkspaceFileTree-ActionBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 14px;
  cursor: pointer;

  &:hover,
  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

.WorkspaceFileTree-Filter {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--shell-border) 75%, transparent);
  background: var(--shell-bg);
}

.WorkspaceFileTree-FilterIcon {
  flex: none;
  font-size: 13px;
  color: var(--shell-text-muted);
}

.WorkspaceFileTree-FilterInput {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  outline: none;

  &::placeholder {
    color: var(--shell-text-muted);
  }

  &::-webkit-search-cancel-button {
    display: none;
  }
}

.WorkspaceFileTree-FilterClear {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 13px;
  cursor: pointer;

  &:hover {
    color: var(--shell-text-primary);
  }
}

.WorkspaceFileTree-Body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 6px 14px;
  overscroll-behavior: contain;
}

.WorkspaceFileTree-Loading {
  padding: 8px 6px;
}

.WorkspaceFileTree-Empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 28px 14px;
  text-align: center;
}

.WorkspaceFileTree-EmptyIcon {
  font-size: 22px;
  color: var(--shell-text-muted);
}

.WorkspaceFileTree-EmptyText {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.WorkspaceFileTree-List {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.WorkspaceFileTree-Row {
  position: relative;
  display: flex;
  gap: 5px;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: 26px;
  padding: 0 8px 0 calc(6px + var(--tree-depth, 0) * 14px);
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;

  &:hover {
    background: var(--shell-surface-2);
  }

  &.is-active {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
    font-weight: 500;
  }

  &.is-hidden:not(.is-active) {
    color: var(--shell-text-muted);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -1px;
  }
}

.WorkspaceFileTree-Guides {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.WorkspaceFileTree-Guide {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: color-mix(in srgb, var(--shell-border) 70%, transparent);
}

.WorkspaceFileTree-Chevron {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: var(--shell-text-muted);
  font-size: 13px;
}

.WorkspaceFileTree-Icon {
  display: inline-flex;
  flex: none;
  font-size: 14px;
  color: var(--shell-text-secondary);

  .WorkspaceFileTree-Row.is-dir & {
    color: var(--shell-text-secondary);
  }

  .WorkspaceFileTree-Row.is-active & {
    color: var(--shell-primary);
  }
}

.WorkspaceFileTree-Name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.WorkspaceFileTree-Size {
  flex: none;
  margin-left: 6px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.WorkspaceFileTree-MenuItem {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.is-spin {
  animation: workspace-tree-spin 0.9s linear infinite;
}

@keyframes workspace-tree-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-spin {
    animation: none;
  }
}
</style>
