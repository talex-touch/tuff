<script lang="ts" name="HomeSideGitPane" setup>
import type {
  WorkspaceGitBranchEntry,
  WorkspaceGitCommitEntry,
  WorkspaceGitDiffResult,
  WorkspaceGitFileEntry,
  WorkspaceGitStatusResult
} from '@talex-touch/utils/transport/sdk/domains/workspace-git'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createWorkspaceGitSdk } from '@talex-touch/utils/transport/sdk/domains/workspace-git'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

type GitSubTab = 'changes' | 'branches' | 'log'

type PendingConfirm =
  | { kind: 'discard'; file: WorkspaceGitFileEntry }
  | { kind: 'pull' }
  | { kind: 'push' }

interface DiffLine {
  type: 'meta' | 'hunk' | 'add' | 'del' | 'context'
  text: string
}

const props = defineProps<{
  cwd?: string
  conversationId: string | null
  active: boolean
}>()

const emit = defineEmits<{
  (event: 'open-file', payload: { path: string; displayPath: string }): void
}>()

const { t } = useI18n()
const transport = isElectronRenderer() ? useTuffTransport() : null
const gitSdk = transport ? createWorkspaceGitSdk(transport) : null

const subTab = ref<GitSubTab>('changes')
const status = ref<WorkspaceGitStatusResult | null>(null)
const branches = ref<WorkspaceGitBranchEntry[]>([])
const commits = ref<WorkspaceGitCommitEntry[]>([])
const loadingStatus = ref(false)
const loadingBranches = ref(false)
const loadingLog = ref(false)
const loadingDiff = ref(false)
const mutating = ref(false)
const actionError = ref('')
const actionNotice = ref('')
const pendingConfirm = ref<PendingConfirm | null>(null)

const commitMessage = ref('')
const newBranchName = ref('')
const branchFilter = ref('')

const selectedFile = ref<{ path: string; staged: boolean; untracked: boolean } | null>(null)
const diffResult = ref<WorkspaceGitDiffResult | null>(null)

let statusRequestSeq = 0
let diffRequestSeq = 0

const target = computed(() => ({
  ...(props.cwd ? { cwd: props.cwd } : {}),
  ...(props.conversationId ? { conversationId: props.conversationId } : {})
}))

const stagedFiles = computed(() => (status.value?.files ?? []).filter((item) => item.staged))
const unstagedFiles = computed(() =>
  (status.value?.files ?? []).filter((item) => item.unstaged || item.untracked || item.conflicted)
)
const totalChanges = computed(() => stagedFiles.value.length + unstagedFiles.value.length)

const localBranches = computed(() => {
  const q = branchFilter.value.trim().toLowerCase()
  return branches.value.filter(
    (branch) => !branch.isRemote && (!q || branch.name.toLowerCase().includes(q))
  )
})
const remoteBranches = computed(() => {
  const q = branchFilter.value.trim().toLowerCase()
  return branches.value.filter(
    (branch) => branch.isRemote && (!q || branch.name.toLowerCase().includes(q))
  )
})

const canCommit = computed(
  () =>
    Boolean(status.value?.isRepo) &&
    stagedFiles.value.length > 0 &&
    commitMessage.value.trim().length > 0 &&
    !mutating.value
)

const parsedDiffLines = computed<DiffLine[]>(() => {
  const raw = diffResult.value?.diff ?? ''
  if (!raw) return []
  return raw.split('\n').map((text) => {
    if (
      text.startsWith('diff --git') ||
      text.startsWith('index ') ||
      text.startsWith('new file') ||
      text.startsWith('deleted file') ||
      text.startsWith('--- ') ||
      text.startsWith('+++ ')
    ) {
      return { type: 'meta', text }
    }
    if (text.startsWith('@@')) return { type: 'hunk', text }
    if (text.startsWith('+')) return { type: 'add', text }
    if (text.startsWith('-')) return { type: 'del', text }
    return { type: 'context', text }
  })
})

function splitFilePath(relPath: string): { name: string; dir: string } {
  const slash = relPath.lastIndexOf('/')
  if (slash < 0) return { name: relPath, dir: '' }
  return {
    name: relPath.slice(slash + 1),
    dir: relPath.slice(0, slash)
  }
}

function statusBadgeCode(file: WorkspaceGitFileEntry, staged: boolean): string {
  if (file.conflicted) return 'U'
  if (file.untracked) return '?'
  const raw = staged ? file.indexStatus : file.worktreeStatus
  return raw && raw !== '.' && raw !== ' ' ? raw : 'M'
}

function statusBadgeTone(code: string): string {
  switch (code) {
    case 'A':
    case '?':
      return 'is-added'
    case 'D':
      return 'is-deleted'
    case 'U':
      return 'is-conflict'
    case 'R':
    case 'C':
      return 'is-renamed'
    default:
      return 'is-modified'
  }
}

function resolveRepoFilePath(relPath: string): string {
  const root = status.value?.repoRoot?.replace(/\/+$/, '')
  return root ? `${root}/${relPath}` : relPath
}

function closeDiff(): void {
  selectedFile.value = null
  diffResult.value = null
}

function openChangedFile(file: WorkspaceGitFileEntry): void {
  emit('open-file', {
    path: resolveRepoFilePath(file.path),
    displayPath: file.path
  })
}

async function refreshStatus(options: { silent?: boolean } = {}): Promise<void> {
  if (!gitSdk) return
  const seq = ++statusRequestSeq
  if (!options.silent) loadingStatus.value = true
  try {
    const next = await gitSdk.status(target.value)
    if (seq !== statusRequestSeq) return
    status.value = next
    if (next.error) {
      actionError.value = next.error
    }
    if (selectedFile.value && next.isRepo) {
      const stillPresent = next.files.some(
        (item) =>
          item.path === selectedFile.value?.path &&
          (selectedFile.value.staged ? item.staged : item.unstaged || item.untracked)
      )
      if (stillPresent) {
        void loadDiff(
          selectedFile.value.path,
          selectedFile.value.staged,
          selectedFile.value.untracked
        )
      } else {
        selectedFile.value = null
        diffResult.value = null
      }
    }
  } catch (error) {
    if (seq === statusRequestSeq) {
      actionError.value = error instanceof Error ? error.message : String(error)
    }
  } finally {
    if (seq === statusRequestSeq) {
      loadingStatus.value = false
    }
  }
}

async function loadDiff(filePath: string, staged: boolean, untracked: boolean): Promise<void> {
  if (!gitSdk) return
  const seq = ++diffRequestSeq
  selectedFile.value = { path: filePath, staged, untracked }
  loadingDiff.value = true
  try {
    const next = await gitSdk.diff({
      ...target.value,
      path: filePath,
      staged,
      untracked
    })
    if (seq !== diffRequestSeq) return
    diffResult.value = next
  } catch (error) {
    if (seq === diffRequestSeq) {
      diffResult.value = {
        path: filePath,
        staged,
        diff: '',
        additions: 0,
        deletions: 0,
        binary: false,
        truncated: false,
        empty: true,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  } finally {
    if (seq === diffRequestSeq) {
      loadingDiff.value = false
    }
  }
}

async function refreshBranches(): Promise<void> {
  if (!gitSdk || !status.value?.isRepo) return
  loadingBranches.value = true
  try {
    const next = await gitSdk.branches(target.value)
    branches.value = next.branches
    if (next.error) actionError.value = next.error
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loadingBranches.value = false
  }
}

async function refreshLog(): Promise<void> {
  if (!gitSdk || !status.value?.isRepo) return
  loadingLog.value = true
  try {
    const next = await gitSdk.log({ ...target.value, limit: 40 })
    commits.value = next.commits
    if (next.error) actionError.value = next.error
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loadingLog.value = false
  }
}

async function refreshAll(): Promise<void> {
  actionError.value = ''
  pendingConfirm.value = null
  await refreshStatus()
  if (!status.value?.isRepo) return
  if (subTab.value === 'branches') {
    await refreshBranches()
  } else if (subTab.value === 'log') {
    await refreshLog()
  }
}

function selectSubTab(next: GitSubTab): void {
  subTab.value = next
  if (next === 'branches') {
    void refreshBranches()
  } else if (next === 'log') {
    void refreshLog()
  }
}

function applyMutationStatus(next?: WorkspaceGitStatusResult): void {
  if (!next) return
  status.value = next
  if (selectedFile.value) {
    const stillPresent = next.files.some(
      (item) =>
        item.path === selectedFile.value?.path &&
        (selectedFile.value.staged ? item.staged : item.unstaged || item.untracked)
    )
    if (stillPresent) {
      void loadDiff(
        selectedFile.value.path,
        selectedFile.value.staged,
        selectedFile.value.untracked
      )
    } else {
      selectedFile.value = null
      diffResult.value = null
    }
  }
}

async function runMutation(
  action: () => Promise<{
    ok: boolean
    summary?: string
    error?: string
    status?: WorkspaceGitStatusResult
  }>,
  successMessage?: string
): Promise<boolean> {
  if (mutating.value) return false
  mutating.value = true
  actionError.value = ''
  actionNotice.value = ''
  try {
    const result = await action()
    if (!result.ok) {
      actionError.value = result.error || t('home.git.actionFailed')
      return false
    }
    applyMutationStatus(result.status)
    if (successMessage) {
      actionNotice.value = successMessage
    } else if (result.summary) {
      actionNotice.value = result.summary
    }
    return true
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error)
    return false
  } finally {
    mutating.value = false
  }
}

function stageFile(file: WorkspaceGitFileEntry): void {
  if (!gitSdk) return
  pendingConfirm.value = null
  void runMutation(() => gitSdk.stage({ ...target.value, paths: [file.path] }))
}

function stageAll(): void {
  if (!gitSdk) return
  pendingConfirm.value = null
  void runMutation(() => gitSdk.stage({ ...target.value, all: true }))
}

function unstageFile(file: WorkspaceGitFileEntry): void {
  if (!gitSdk) return
  pendingConfirm.value = null
  void runMutation(() => gitSdk.unstage({ ...target.value, paths: [file.path] }))
}

function unstageAll(): void {
  if (!gitSdk) return
  pendingConfirm.value = null
  void runMutation(() => gitSdk.unstage({ ...target.value, all: true }))
}

function requestDiscard(file: WorkspaceGitFileEntry): void {
  actionError.value = ''
  pendingConfirm.value = { kind: 'discard', file }
}

function requestPull(): void {
  actionError.value = ''
  pendingConfirm.value = { kind: 'pull' }
}

function requestPush(): void {
  actionError.value = ''
  pendingConfirm.value = { kind: 'push' }
}

function cancelConfirm(): void {
  pendingConfirm.value = null
}

async function executeConfirm(): Promise<void> {
  if (!gitSdk || !pendingConfirm.value) return
  const current = pendingConfirm.value
  pendingConfirm.value = null

  if (current.kind === 'discard') {
    await runMutation(
      () =>
        gitSdk.discard({
          ...target.value,
          path: current.file.path,
          untracked: current.file.untracked
        }),
      t('home.git.discarded', { name: splitFilePath(current.file.path).name })
    )
    return
  }

  if (current.kind === 'pull') {
    const ok = await runMutation(() => gitSdk.pull(target.value), t('home.git.pulled'))
    if (ok && subTab.value === 'log') {
      void refreshLog()
    }
    return
  }

  if (current.kind === 'push') {
    await runMutation(
      () => gitSdk.push({ ...target.value, setUpstream: true }),
      t('home.git.pushed')
    )
  }
}

async function handleFetch(): Promise<void> {
  if (!gitSdk) return
  pendingConfirm.value = null
  const ok = await runMutation(() => gitSdk.fetch(target.value), t('home.git.fetched'))
  if (ok && subTab.value === 'branches') {
    void refreshBranches()
  }
}

async function handleCommit(): Promise<void> {
  if (!gitSdk || !canCommit.value) return
  const message = commitMessage.value.trim()
  pendingConfirm.value = null
  const ok = await runMutation(
    () => gitSdk.commit({ ...target.value, message }),
    t('home.git.committed')
  )
  if (ok) {
    commitMessage.value = ''
    if (subTab.value === 'log') {
      void refreshLog()
    }
  }
}

function onCommitKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    void handleCommit()
  }
}

async function switchBranch(branchName: string): Promise<void> {
  if (!gitSdk || mutating.value) return
  pendingConfirm.value = null
  const ok = await runMutation(
    () => gitSdk.checkout({ ...target.value, branch: branchName }),
    t('home.git.switchedBranch', { branch: branchName })
  )
  if (ok) {
    void refreshBranches()
    if (commits.value.length > 0) void refreshLog()
  }
}

async function createBranch(): Promise<void> {
  if (!gitSdk || mutating.value) return
  const name = newBranchName.value.trim()
  if (!name) return
  pendingConfirm.value = null
  const ok = await runMutation(
    () => gitSdk.checkout({ ...target.value, branch: name, create: true }),
    t('home.git.createdBranch', { branch: name })
  )
  if (ok) {
    newBranchName.value = ''
    void refreshBranches()
  }
}

async function copyCommitHash(hash: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(hash)
    toast.success(t('home.copied'))
  } catch {
    // ignore clipboard failures
  }
}

watch(
  [() => props.cwd, () => props.conversationId, () => props.active],
  ([, , active], previous) => {
    if (!active) return
    const targetChanged =
      !previous || previous[0] !== props.cwd || previous[1] !== props.conversationId
    if (targetChanged) {
      selectedFile.value = null
      diffResult.value = null
      pendingConfirm.value = null
      actionError.value = ''
      actionNotice.value = ''
    }
    void refreshAll()
  },
  { immediate: true }
)
</script>

<template>
  <section class="HomeSideGit" :aria-label="t('home.git.title')">
    <!-- Top bar: branch badge + remote operations + refresh -->
    <header class="HomeSideGit-TopBar">
      <button
        type="button"
        class="HomeSideGit-BranchBtn"
        :disabled="!status?.isRepo"
        :title="status?.upstream ? `${status.branch} → ${status.upstream}` : status?.branch"
        @click="selectSubTab(subTab === 'branches' ? 'changes' : 'branches')"
      >
        <span class="i-ri-git-branch-line HomeSideGit-BranchIcon" aria-hidden="true" />
        <span class="HomeSideGit-BranchName">
          {{ status?.isRepo ? status.branch : t('home.git.title') }}
        </span>
        <span
          v-if="status?.isRepo && (status.ahead > 0 || status.behind > 0)"
          class="HomeSideGit-SyncCounts"
        >
          <span v-if="status.ahead > 0" class="HomeSideGit-Ahead">↑{{ status.ahead }}</span>
          <span v-if="status.behind > 0" class="HomeSideGit-Behind">↓{{ status.behind }}</span>
        </span>
      </button>

      <div class="HomeSideGit-RemoteActions">
        <button
          v-if="status?.isRepo"
          type="button"
          class="HomeSideGit-ActionBtn"
          :disabled="!status.hasRemote || mutating"
          :title="status.hasRemote ? t('home.git.fetch') : t('home.git.noRemote')"
          :aria-label="t('home.git.fetch')"
          @click="handleFetch"
        >
          <span class="i-ri-download-cloud-2-line" aria-hidden="true" />
        </button>

        <button
          v-if="status?.isRepo"
          type="button"
          class="HomeSideGit-ActionBtn"
          :class="{ 'is-highlighted': status.behind > 0 }"
          :disabled="!status.hasRemote || mutating"
          :title="status.hasRemote ? t('home.git.pull') : t('home.git.noRemote')"
          :aria-label="t('home.git.pull')"
          @click="requestPull"
        >
          <span class="i-ri-arrow-down-line" aria-hidden="true" />
          <span v-if="status.behind > 0" class="HomeSideGit-BtnBadge">{{ status.behind }}</span>
        </button>

        <button
          v-if="status?.isRepo"
          type="button"
          class="HomeSideGit-ActionBtn"
          :class="{ 'is-highlighted': status.ahead > 0 }"
          :disabled="!status.hasRemote || status.detached || mutating"
          :title="status.hasRemote ? t('home.git.push') : t('home.git.noRemote')"
          :aria-label="t('home.git.push')"
          @click="requestPush"
        >
          <span class="i-ri-arrow-up-line" aria-hidden="true" />
          <span v-if="status.ahead > 0" class="HomeSideGit-BtnBadge">{{ status.ahead }}</span>
        </button>

        <button
          type="button"
          class="HomeSideGit-ActionBtn"
          :disabled="loadingStatus || mutating"
          :title="t('home.git.refresh')"
          :aria-label="t('home.git.refresh')"
          @click="refreshAll"
        >
          <span
            class="i-ri-refresh-line"
            :class="{ 'is-spin': loadingStatus || mutating }"
            aria-hidden="true"
          />
        </button>
      </div>
    </header>

    <!-- Inline secondary confirmation bar for high-risk actions (discard / pull / push) -->
    <div
      v-if="pendingConfirm"
      class="HomeSideGit-ConfirmBar"
      :class="{ 'is-danger': pendingConfirm.kind === 'discard' }"
      role="alertdialog"
      aria-live="assertive"
    >
      <div class="HomeSideGit-ConfirmText">
        <template v-if="pendingConfirm.kind === 'discard'">
          {{
            pendingConfirm.file.untracked
              ? t('home.git.confirmDiscardUntracked', { path: pendingConfirm.file.path })
              : t('home.git.confirmDiscard', { path: pendingConfirm.file.path })
          }}
        </template>
        <template v-else-if="pendingConfirm.kind === 'pull'">
          {{ t('home.git.confirmPull', { branch: status?.branch ?? '' }) }}
          <span v-if="(status?.unstagedCount ?? 0) > 0" class="HomeSideGit-ConfirmWarn">
            {{ t('home.git.dirtyWorktreeHint') }}
          </span>
        </template>
        <template v-else>
          {{
            t('home.git.confirmPush', {
              branch: status?.branch ?? '',
              target: status?.upstream || t('home.git.defaultRemote')
            })
          }}
        </template>
      </div>
      <div class="HomeSideGit-ConfirmActions">
        <button
          type="button"
          class="HomeSideGit-ConfirmBtn"
          :class="pendingConfirm.kind === 'discard' ? 'is-danger' : 'is-primary'"
          :disabled="mutating"
          @click="executeConfirm"
        >
          {{
            pendingConfirm.kind === 'discard'
              ? t('home.git.confirmDiscardAction')
              : pendingConfirm.kind === 'pull'
                ? t('home.git.confirmPullAction')
                : t('home.git.confirmPushAction')
          }}
        </button>
        <button type="button" class="HomeSideGit-ConfirmBtn" @click="cancelConfirm">
          {{ t('common.cancel') }}
        </button>
      </div>
    </div>

    <!-- Error / notice banner -->
    <div v-if="actionError" class="HomeSideGit-Banner is-error" role="alert">
      <span class="HomeSideGit-BannerText">{{ actionError }}</span>
      <button
        type="button"
        class="HomeSideGit-BannerClose"
        :aria-label="t('common.close')"
        @click="actionError = ''"
      >
        <span class="i-ri-close-line" aria-hidden="true" />
      </button>
    </div>
    <div v-else-if="actionNotice" class="HomeSideGit-Banner is-notice" role="status">
      <span class="HomeSideGit-BannerText">{{ actionNotice }}</span>
      <button
        type="button"
        class="HomeSideGit-BannerClose"
        :aria-label="t('common.close')"
        @click="actionNotice = ''"
      >
        <span class="i-ri-close-line" aria-hidden="true" />
      </button>
    </div>

    <!-- Initial loading skeleton -->
    <div v-if="loadingStatus && !status" class="HomeSideGit-Skeleton" aria-busy="true">
      <TxSkeleton :height="32" :radius="8" />
      <TxSkeleton :height="64" :radius="8" />
      <TxSkeleton :height="24" :radius="6" />
      <TxSkeleton :height="24" :radius="6" />
      <TxSkeleton :height="24" :radius="6" />
    </div>

    <!-- Unavailable / non-repository state -->
    <div v-else-if="!gitSdk || !status?.available" class="HomeSideGit-EmptyState">
      <span class="i-ri-git-branch-line HomeSideGit-EmptyIcon" aria-hidden="true" />
      <p class="HomeSideGit-EmptyTitle">{{ t('home.git.unavailable') }}</p>
    </div>

    <div v-else-if="!status.isRepo" class="HomeSideGit-EmptyState">
      <span class="i-ri-git-repository-line HomeSideGit-EmptyIcon" aria-hidden="true" />
      <p class="HomeSideGit-EmptyTitle">{{ t('home.git.notRepo') }}</p>
      <p v-if="status.cwd" class="HomeSideGit-EmptyPath" :title="status.cwd">{{ status.cwd }}</p>
      <button type="button" class="HomeSideGit-SecondaryBtn" @click="refreshAll">
        <span class="i-ri-refresh-line" aria-hidden="true" />
        <span>{{ t('home.git.refresh') }}</span>
      </button>
    </div>

    <!-- Active repository workspace -->
    <template v-else>
      <nav class="HomeSideGit-SubTabs" role="tablist" :aria-label="t('home.git.views')">
        <button
          type="button"
          role="tab"
          class="HomeSideGit-SubTab"
          :class="{ 'is-active': subTab === 'changes' }"
          :aria-selected="subTab === 'changes'"
          @click="selectSubTab('changes')"
        >
          <span>{{ t('home.git.tabChanges') }}</span>
          <span v-if="totalChanges > 0" class="HomeSideGit-SubTabCount">{{ totalChanges }}</span>
        </button>
        <button
          type="button"
          role="tab"
          class="HomeSideGit-SubTab"
          :class="{ 'is-active': subTab === 'branches' }"
          :aria-selected="subTab === 'branches'"
          @click="selectSubTab('branches')"
        >
          <span>{{ t('home.git.tabBranches') }}</span>
          <span v-if="branches.length > 0" class="HomeSideGit-SubTabCount">
            {{ branches.filter((b) => !b.isRemote).length }}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          class="HomeSideGit-SubTab"
          :class="{ 'is-active': subTab === 'log' }"
          :aria-selected="subTab === 'log'"
          @click="selectSubTab('log')"
        >
          <span>{{ t('home.git.tabHistory') }}</span>
        </button>
      </nav>

      <!-- CHANGES VIEW -->
      <div v-if="subTab === 'changes'" class="HomeSideGit-Body">
        <div class="HomeSideGit-ChangesList">
          <!-- Commit composer -->
          <div class="HomeSideGit-CommitBox">
            <textarea
              v-model="commitMessage"
              class="HomeSideGit-CommitInput"
              rows="2"
              :placeholder="t('home.git.commitPlaceholder')"
              :aria-label="t('home.git.commitPlaceholder')"
              @keydown="onCommitKeydown"
            />
            <div class="HomeSideGit-CommitFooter">
              <span class="HomeSideGit-CommitHint">
                {{
                  stagedFiles.length > 0
                    ? t('home.git.stagedReady', { count: stagedFiles.length })
                    : t('home.git.stageBeforeCommit')
                }}
              </span>
              <button
                type="button"
                class="HomeSideGit-CommitBtn"
                :disabled="!canCommit"
                @click="handleCommit"
              >
                <span class="i-ri-check-line" aria-hidden="true" />
                <span>{{ t('home.git.commit') }}</span>
              </button>
            </div>
          </div>

          <div v-if="totalChanges === 0" class="HomeSideGit-CleanState">
            <span class="i-ri-checkbox-circle-line HomeSideGit-CleanIcon" aria-hidden="true" />
            <span>{{ t('home.git.workingTreeClean') }}</span>
          </div>

          <template v-else>
            <!-- Staged changes -->
            <div v-if="stagedFiles.length > 0" class="HomeSideGit-Group">
              <div class="HomeSideGit-GroupHead">
                <span class="HomeSideGit-GroupTitle">
                  {{ t('home.git.staged') }}
                  <span class="HomeSideGit-GroupCount">{{ stagedFiles.length }}</span>
                </span>
                <button
                  type="button"
                  class="HomeSideGit-GroupAction"
                  :disabled="mutating"
                  :title="t('home.git.unstageAll')"
                  @click="unstageAll"
                >
                  <span class="i-ri-subtract-line" aria-hidden="true" />
                  <span>{{ t('home.git.unstageAll') }}</span>
                </button>
              </div>
              <ul class="HomeSideGit-FileList">
                <li
                  v-for="file in stagedFiles"
                  :key="`staged:${file.path}`"
                  class="HomeSideGit-FileRow"
                  :class="{
                    'is-selected': selectedFile?.path === file.path && selectedFile.staged
                  }"
                >
                  <button
                    type="button"
                    class="HomeSideGit-FileMain"
                    :title="file.path"
                    @click="loadDiff(file.path, true, false)"
                  >
                    <span
                      class="HomeSideGit-StatusCode"
                      :class="statusBadgeTone(statusBadgeCode(file, true))"
                    >
                      {{ statusBadgeCode(file, true) }}
                    </span>
                    <span class="HomeSideGit-FileName">{{ splitFilePath(file.path).name }}</span>
                    <span v-if="splitFilePath(file.path).dir" class="HomeSideGit-FileDir">
                      {{ splitFilePath(file.path).dir }}
                    </span>
                  </button>
                  <div class="HomeSideGit-FileActions">
                    <button
                      type="button"
                      class="HomeSideGit-RowIconBtn"
                      :title="t('home.sidePanel.openFile')"
                      :aria-label="t('home.sidePanel.openFile')"
                      @click="openChangedFile(file)"
                    >
                      <span class="i-ri-file-text-line" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="HomeSideGit-RowIconBtn"
                      :disabled="mutating"
                      :title="t('home.git.unstage')"
                      :aria-label="t('home.git.unstage')"
                      @click="unstageFile(file)"
                    >
                      <span class="i-ri-subtract-line" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              </ul>
            </div>

            <!-- Unstaged & untracked changes -->
            <div v-if="unstagedFiles.length > 0" class="HomeSideGit-Group">
              <div class="HomeSideGit-GroupHead">
                <span class="HomeSideGit-GroupTitle">
                  {{ t('home.git.unstaged') }}
                  <span class="HomeSideGit-GroupCount">{{ unstagedFiles.length }}</span>
                </span>
                <button
                  type="button"
                  class="HomeSideGit-GroupAction"
                  :disabled="mutating"
                  :title="t('home.git.stageAll')"
                  @click="stageAll"
                >
                  <span class="i-ri-add-line" aria-hidden="true" />
                  <span>{{ t('home.git.stageAll') }}</span>
                </button>
              </div>
              <ul class="HomeSideGit-FileList">
                <li
                  v-for="file in unstagedFiles"
                  :key="`unstaged:${file.path}`"
                  class="HomeSideGit-FileRow"
                  :class="{
                    'is-selected': selectedFile?.path === file.path && !selectedFile.staged
                  }"
                >
                  <button
                    type="button"
                    class="HomeSideGit-FileMain"
                    :title="file.path"
                    @click="loadDiff(file.path, false, file.untracked)"
                  >
                    <span
                      class="HomeSideGit-StatusCode"
                      :class="statusBadgeTone(statusBadgeCode(file, false))"
                    >
                      {{ statusBadgeCode(file, false) }}
                    </span>
                    <span class="HomeSideGit-FileName">{{ splitFilePath(file.path).name }}</span>
                    <span v-if="splitFilePath(file.path).dir" class="HomeSideGit-FileDir">
                      {{ splitFilePath(file.path).dir }}
                    </span>
                  </button>
                  <div class="HomeSideGit-FileActions">
                    <button
                      type="button"
                      class="HomeSideGit-RowIconBtn"
                      :title="t('home.sidePanel.openFile')"
                      :aria-label="t('home.sidePanel.openFile')"
                      @click="openChangedFile(file)"
                    >
                      <span class="i-ri-file-text-line" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="HomeSideGit-RowIconBtn is-danger"
                      :disabled="mutating"
                      :title="t('home.git.discard')"
                      :aria-label="t('home.git.discard')"
                      @click="requestDiscard(file)"
                    >
                      <span class="i-ri-arrow-go-back-line" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="HomeSideGit-RowIconBtn"
                      :disabled="mutating"
                      :title="t('home.git.stage')"
                      :aria-label="t('home.git.stage')"
                      @click="stageFile(file)"
                    >
                      <span class="i-ri-add-line" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              </ul>
            </div>
          </template>
        </div>

        <!-- Unified Diff Pane -->
        <div v-if="selectedFile" class="HomeSideGit-DiffPane">
          <div class="HomeSideGit-DiffHeader">
            <div class="HomeSideGit-DiffMeta">
              <span class="HomeSideGit-DiffScope">
                {{ selectedFile.staged ? t('home.git.staged') : t('home.git.unstaged') }}
              </span>
              <span class="HomeSideGit-DiffPath" :title="selectedFile.path">
                {{ selectedFile.path }}
              </span>
            </div>
            <div class="HomeSideGit-DiffHeaderRight">
              <span v-if="diffResult && !diffResult.binary" class="HomeSideGit-DiffStats">
                <span class="is-add">+{{ diffResult.additions }}</span>
                <span class="is-del">-{{ diffResult.deletions }}</span>
              </span>
              <button
                type="button"
                class="HomeSideGit-RowIconBtn"
                :title="t('common.close')"
                :aria-label="t('common.close')"
                @click="closeDiff"
              >
                <span class="i-ri-close-line" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div v-if="loadingDiff" class="HomeSideGit-DiffNotice">
            {{ t('home.workspace.review.loadingDiff') }}
          </div>
          <div v-else-if="diffResult?.error" class="HomeSideGit-DiffNotice is-error">
            {{ diffResult.error }}
          </div>
          <div v-else-if="diffResult?.binary" class="HomeSideGit-DiffNotice">
            {{ t('home.workspace.review.reason.binary') }}
          </div>
          <div v-else-if="!diffResult || diffResult.empty" class="HomeSideGit-DiffNotice">
            {{ t('home.git.emptyDiff') }}
          </div>
          <div v-else class="HomeSideGit-DiffScroll">
            <pre class="HomeSideGit-DiffCode"><code
              v-for="(line, idx) in parsedDiffLines"
              :key="idx"
              class="HomeSideGit-DiffLine"
              :class="`is-${line.type}`"
            >{{ line.text }}</code></pre>
            <p v-if="diffResult.truncated" class="HomeSideGit-DiffTruncated">
              {{ t('home.workspace.review.reason.diff_limit') }}
            </p>
          </div>
        </div>
      </div>

      <!-- BRANCHES VIEW -->
      <div v-else-if="subTab === 'branches'" class="HomeSideGit-ScrollView">
        <form class="HomeSideGit-NewBranchForm" @submit.prevent="createBranch">
          <input
            v-model="newBranchName"
            type="text"
            class="HomeSideGit-Input"
            :placeholder="t('home.git.newBranchPlaceholder')"
            :aria-label="t('home.git.newBranchPlaceholder')"
          />
          <button
            type="submit"
            class="HomeSideGit-PrimaryBtn"
            :disabled="!newBranchName.trim() || mutating"
          >
            <span class="i-ri-add-line" aria-hidden="true" />
            <span>{{ t('home.git.createBranch') }}</span>
          </button>
        </form>

        <input
          v-if="branches.length > 6"
          v-model="branchFilter"
          type="search"
          class="HomeSideGit-Input HomeSideGit-FilterInput"
          :placeholder="t('home.git.filterBranches')"
          :aria-label="t('home.git.filterBranches')"
        />

        <div v-if="loadingBranches && branches.length === 0" class="HomeSideGit-Skeleton">
          <TxSkeleton :height="28" :radius="6" />
          <TxSkeleton :height="28" :radius="6" />
          <TxSkeleton :height="28" :radius="6" />
        </div>

        <template v-else>
          <div class="HomeSideGit-Group">
            <div class="HomeSideGit-GroupHead">
              <span class="HomeSideGit-GroupTitle">
                {{ t('home.git.localBranches') }}
                <span class="HomeSideGit-GroupCount">{{ localBranches.length }}</span>
              </span>
            </div>
            <ul class="HomeSideGit-BranchList">
              <li v-for="branch in localBranches" :key="branch.name">
                <button
                  type="button"
                  class="HomeSideGit-BranchRow"
                  :class="{ 'is-current': branch.current }"
                  :disabled="branch.current || mutating"
                  @click="switchBranch(branch.name)"
                >
                  <span
                    :class="branch.current ? 'i-ri-check-line' : 'i-ri-git-branch-line'"
                    class="HomeSideGit-BranchRowIcon"
                    aria-hidden="true"
                  />
                  <span class="HomeSideGit-BranchRowMain">
                    <span class="HomeSideGit-BranchRowName">{{ branch.name }}</span>
                    <span v-if="branch.subject" class="HomeSideGit-BranchRowSubject">
                      {{ branch.subject }}
                    </span>
                  </span>
                  <span v-if="branch.shortOid" class="HomeSideGit-HashPill">
                    {{ branch.shortOid }}
                  </span>
                </button>
              </li>
            </ul>
          </div>

          <div v-if="remoteBranches.length > 0" class="HomeSideGit-Group">
            <div class="HomeSideGit-GroupHead">
              <span class="HomeSideGit-GroupTitle">
                {{ t('home.git.remoteBranches') }}
                <span class="HomeSideGit-GroupCount">{{ remoteBranches.length }}</span>
              </span>
            </div>
            <ul class="HomeSideGit-BranchList">
              <li v-for="branch in remoteBranches" :key="branch.name">
                <button
                  type="button"
                  class="HomeSideGit-BranchRow"
                  :disabled="mutating"
                  @click="switchBranch(branch.name)"
                >
                  <span class="i-ri-cloud-line HomeSideGit-BranchRowIcon" aria-hidden="true" />
                  <span class="HomeSideGit-BranchRowMain">
                    <span class="HomeSideGit-BranchRowName">{{ branch.name }}</span>
                    <span v-if="branch.subject" class="HomeSideGit-BranchRowSubject">
                      {{ branch.subject }}
                    </span>
                  </span>
                  <span v-if="branch.shortOid" class="HomeSideGit-HashPill">
                    {{ branch.shortOid }}
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </template>
      </div>

      <!-- HISTORY / LOG VIEW -->
      <div v-else class="HomeSideGit-ScrollView">
        <div v-if="loadingLog && commits.length === 0" class="HomeSideGit-Skeleton">
          <TxSkeleton :height="36" :radius="6" />
          <TxSkeleton :height="36" :radius="6" />
          <TxSkeleton :height="36" :radius="6" />
        </div>

        <div v-else-if="commits.length === 0" class="HomeSideGit-CleanState">
          <span class="i-ri-history-line HomeSideGit-CleanIcon" aria-hidden="true" />
          <span>{{ t('home.git.noCommits') }}</span>
        </div>

        <ol v-else class="HomeSideGit-LogList">
          <li v-for="commit in commits" :key="commit.hash" class="HomeSideGit-LogItem">
            <div class="HomeSideGit-LogHead">
              <span class="HomeSideGit-LogSubject" :title="commit.subject">
                {{ commit.subject }}
              </span>
              <button
                type="button"
                class="HomeSideGit-HashPill is-copyable"
                :title="t('home.git.copyHash')"
                @click="copyCommitHash(commit.hash)"
              >
                {{ commit.shortHash }}
              </button>
            </div>
            <div v-if="commit.refs.length > 0" class="HomeSideGit-LogRefs">
              <span v-for="refLabel in commit.refs" :key="refLabel" class="HomeSideGit-RefPill">
                {{ refLabel }}
              </span>
            </div>
            <div class="HomeSideGit-LogMeta">
              <span>{{ commit.author }}</span>
              <span>·</span>
              <span>{{ commit.relativeDate }}</span>
            </div>
          </li>
        </ol>
      </div>
    </template>
  </section>
</template>

<style lang="scss" scoped>
.HomeSideGit {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--shell-bg);
}

.HomeSideGit-TopBar {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-surface);
}

.HomeSideGit-BranchBtn {
  display: inline-flex;
  flex: 0 1 auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  font-weight: 500;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--shell-border-strong, var(--shell-border));
    background: var(--shell-surface-2);
  }

  &:disabled {
    cursor: default;
    opacity: 0.7;
  }
}

.HomeSideGit-BranchIcon {
  flex: none;
  color: var(--shell-primary);
  font-size: 14px;
}

.HomeSideGit-BranchName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideGit-SyncCounts {
  display: inline-flex;
  flex: none;
  gap: 4px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.HomeSideGit-Ahead {
  color: var(--shell-primary);
}

.HomeSideGit-Behind {
  color: var(--shell-warning, var(--shell-text-secondary));
}

.HomeSideGit-RemoteActions {
  display: flex;
  flex: none;
  gap: 2px;
  align-items: center;
}

.HomeSideGit-ActionBtn {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font: inherit;
  font-size: 14px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-highlighted {
    color: var(--shell-primary);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .is-spin {
    animation: git-spin 1s linear infinite;

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  }
}

.HomeSideGit-BtnBadge {
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.HomeSideGit-ConfirmBar {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-primary-soft, var(--shell-surface));

  &.is-danger {
    background: color-mix(in srgb, var(--shell-danger) 10%, var(--shell-bg));
    border-bottom-color: color-mix(in srgb, var(--shell-danger) 30%, var(--shell-border));
  }
}

.HomeSideGit-ConfirmText {
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  line-height: 1.45;
  word-break: break-word;
}

.HomeSideGit-ConfirmWarn {
  display: block;
  margin-top: 2px;
  color: var(--shell-danger);
  font-size: var(--shell-fs-caption);
}

.HomeSideGit-ConfirmActions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.HomeSideGit-ConfirmBtn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  cursor: pointer;

  &.is-primary {
    border-color: var(--shell-primary);
    background: var(--shell-primary);
    color: var(--shell-on-primary, var(--tx-color-white));
  }

  &.is-danger {
    border-color: var(--shell-danger);
    background: var(--shell-danger);
    color: var(--tx-color-white);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.HomeSideGit-Banner {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--shell-border);
  font-size: var(--shell-fs-caption);
  line-height: 1.45;

  &.is-error {
    background: color-mix(in srgb, var(--shell-danger) 10%, var(--shell-bg));
    color: var(--shell-danger);
  }

  &.is-notice {
    background: var(--shell-success-soft, var(--shell-surface));
    color: var(--shell-success, var(--shell-text-primary));
  }
}

.HomeSideGit-BannerText {
  flex: 1 1 auto;
  min-width: 0;
  word-break: break-word;
}

.HomeSideGit-BannerClose {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.HomeSideGit-SubTabs {
  display: flex;
  flex: none;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-bg);
}

.HomeSideGit-SubTab {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface);
    color: var(--shell-text-primary);
  }

  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
    font-weight: 500;
  }
}

.HomeSideGit-SubTabCount {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--shell-surface);
  color: var(--shell-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.HomeSideGit-Body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.HomeSideGit-ChangesList {
  display: flex;
  flex: 1 1 50%;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 10px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.HomeSideGit-ScrollView {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 10px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.HomeSideGit-CommitBox {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md, 10px);
  background: var(--shell-surface);
}

.HomeSideGit-CommitInput {
  width: 100%;
  min-height: 44px;
  max-height: 120px;
  padding: 4px 6px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
  resize: vertical;
  outline: none;
  box-sizing: border-box;

  &::placeholder {
    color: var(--shell-text-muted);
  }
}

.HomeSideGit-CommitFooter {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.HomeSideGit-CommitHint {
  overflow: hidden;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideGit-CommitBtn,
.HomeSideGit-PrimaryBtn,
.HomeSideGit-SecondaryBtn {
  display: inline-flex;
  flex: none;
  gap: 4px;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--shell-radius-sm);
  font: inherit;
  font-size: var(--shell-fs-sm);
  font-weight: 500;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.HomeSideGit-CommitBtn,
.HomeSideGit-PrimaryBtn {
  border: 1px solid var(--shell-primary);
  background: var(--shell-primary);
  color: var(--shell-on-primary, var(--tx-color-white));
}

.HomeSideGit-SecondaryBtn {
  border: 1px solid var(--shell-border);
  background: var(--shell-surface);
  color: var(--shell-text-primary);

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
  }
}

.HomeSideGit-Group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.HomeSideGit-GroupHead {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.HomeSideGit-GroupTitle {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  font-weight: 600;
}

.HomeSideGit-GroupCount {
  color: var(--shell-text-muted);
  font-variant-numeric: tabular-nums;
}

.HomeSideGit-GroupAction {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  height: 22px;
  padding: 0 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--shell-text-muted);
  font: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

.HomeSideGit-FileList,
.HomeSideGit-BranchList,
.HomeSideGit-LogList {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.HomeSideGit-FileRow {
  display: flex;
  gap: 4px;
  align-items: center;
  min-width: 0;
  border-radius: var(--shell-radius-sm);

  &:hover,
  &.is-selected {
    background: var(--shell-surface);
  }

  &.is-selected {
    box-shadow: inset 0 0 0 1px var(--shell-border);
  }
}

.HomeSideGit-FileMain {
  display: flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  border: none;
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  text-align: left;
  cursor: pointer;
}

.HomeSideGit-StatusCode {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 11px;
  font-weight: 600;

  &.is-added {
    background: var(
      --shell-success-soft,
      color-mix(in srgb, var(--shell-success) 15%, transparent)
    );
    color: var(--shell-success);
  }

  &.is-deleted {
    background: color-mix(in srgb, var(--shell-danger) 14%, transparent);
    color: var(--shell-danger);
  }

  &.is-conflict {
    background: color-mix(in srgb, var(--shell-danger) 22%, transparent);
    color: var(--shell-danger);
  }

  &.is-modified,
  &.is-renamed {
    background: var(
      --shell-primary-soft,
      color-mix(in srgb, var(--shell-primary) 14%, transparent)
    );
    color: var(--shell-primary);
  }
}

.HomeSideGit-FileName {
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideGit-FileDir {
  flex: 1 2 auto;
  overflow: hidden;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideGit-FileActions {
  display: flex;
  flex: none;
  gap: 1px;
  align-items: center;
  padding-right: 4px;
}

.HomeSideGit-RowIconBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 13px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-danger:hover:not(:disabled) {
    color: var(--shell-danger);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.HomeSideGit-DiffPane {
  display: flex;
  flex: 1 1 50%;
  flex-direction: column;
  min-height: 160px;
  border-top: 1px solid var(--shell-border);
  background: var(--shell-bg);
}

.HomeSideGit-DiffHeader {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-surface);
}

.HomeSideGit-DiffMeta {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.HomeSideGit-DiffScope {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
  font-size: 11px;
}

.HomeSideGit-DiffPath {
  overflow: hidden;
  color: var(--shell-text-primary);
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideGit-DiffHeaderRight {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
}

.HomeSideGit-DiffStats {
  display: inline-flex;
  gap: 5px;
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 11px;
  font-variant-numeric: tabular-nums;

  .is-add {
    color: var(--shell-success);
  }

  .is-del {
    color: var(--shell-danger);
  }
}

.HomeSideGit-DiffScroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.HomeSideGit-DiffCode {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 6px 0;
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  line-height: 1.55;
}

.HomeSideGit-DiffLine {
  display: block;
  min-width: max-content;
  padding: 0 10px;
  white-space: pre;

  &.is-meta {
    color: var(--shell-text-muted);
  }

  &.is-hunk {
    background: var(
      --shell-primary-soft,
      color-mix(in srgb, var(--shell-primary) 10%, transparent)
    );
    color: var(--shell-primary);
  }

  &.is-add {
    background: var(
      --shell-success-soft,
      color-mix(in srgb, var(--shell-success) 14%, transparent)
    );
    color: var(--shell-text-primary);
  }

  &.is-del {
    background: color-mix(in srgb, var(--shell-danger) 14%, transparent);
    color: var(--shell-text-primary);
  }

  &.is-context {
    color: var(--shell-text-secondary);
  }
}

.HomeSideGit-DiffNotice,
.HomeSideGit-DiffTruncated {
  margin: 0;
  padding: 12px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);

  &.is-error {
    color: var(--shell-danger);
  }
}

.HomeSideGit-NewBranchForm {
  display: flex;
  gap: 6px;
  align-items: center;
}

.HomeSideGit-Input {
  flex: 1 1 auto;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface);
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: var(--shell-primary);
  }

  &::placeholder {
    color: var(--shell-text-muted);
  }
}

.HomeSideGit-BranchRow {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  text-align: left;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--shell-surface);
  }

  &.is-current {
    background: var(--shell-surface);
    font-weight: 500;
    cursor: default;
  }
}

.HomeSideGit-BranchRowIcon {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 14px;

  .HomeSideGit-BranchRow.is-current & {
    color: var(--shell-primary);
  }
}

.HomeSideGit-BranchRowMain {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.HomeSideGit-BranchRowName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideGit-BranchRowSubject {
  overflow: hidden;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideGit-HashPill {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--shell-border);
  border-radius: 4px;
  background: var(--shell-surface);
  color: var(--shell-text-secondary);
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 11px;

  &.is-copyable {
    cursor: pointer;

    &:hover {
      border-color: var(--shell-primary);
      color: var(--shell-primary);
    }
  }
}

.HomeSideGit-LogItem {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--shell-border) 60%, transparent);
}

.HomeSideGit-LogHead {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  justify-content: space-between;
}

.HomeSideGit-LogSubject {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  font-weight: 500;
  line-height: 1.4;
  word-break: break-word;
}

.HomeSideGit-LogRefs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.HomeSideGit-RefPill {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--shell-primary-soft, var(--shell-surface));
  color: var(--shell-primary);
  font-size: 11px;
  font-weight: 500;
}

.HomeSideGit-LogMeta {
  display: flex;
  gap: 6px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.HomeSideGit-Skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.HomeSideGit-EmptyState,
.HomeSideGit-CleanState {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  text-align: center;
}

.HomeSideGit-EmptyIcon,
.HomeSideGit-CleanIcon {
  font-size: 24px;
  opacity: 0.7;
}

.HomeSideGit-EmptyTitle {
  margin: 0;
  color: var(--shell-text-secondary);
  font-weight: 500;
}

.HomeSideGit-EmptyPath {
  max-width: 100%;
  margin: 0;
  overflow: hidden;
  color: var(--shell-text-muted);
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes git-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
