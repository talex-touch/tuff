<script lang="ts" name="HomeSideGitPane" setup>
import type {
  WorkspaceGitBranchEntry,
  WorkspaceGitCommitEntry,
  WorkspaceGitDiffResult,
  WorkspaceGitFileEntry,
  WorkspaceGitRemoteEntry,
  WorkspaceGitRemoteProvider,
  WorkspaceGitStatusResult
} from '@talex-touch/utils/transport/sdk/domains/workspace-git'
import {
  TxContextMenu,
  TxContextMenuDivider,
  TxContextMenuItem
} from '@talex-touch/tuffex/context-menu'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { hasWindow, isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createWorkspaceGitSdk } from '@talex-touch/utils/transport/sdk/domains/workspace-git'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { SHELL_MENU_CARD } from '~/components/shell/shell-menu-panel'
import {
  buildBranchTree,
  collectDefaultExpandedFolders,
  flattenBranchTree,
  resolveAuthorAvatarTone,
  resolveAuthorInitials,
  resolveRemoteNameForBranch
} from './git-branch-tree'

type GitSubTab = 'changes' | 'branches' | 'log'

type PendingConfirm =
  | { kind: 'discard'; file: WorkspaceGitFileEntry }
  | { kind: 'pull' }
  | { kind: 'push' }
  | { kind: 'delete-branch'; branch: WorkspaceGitBranchEntry; force: boolean }
  | { kind: 'remove-remote'; remote: WorkspaceGitRemoteEntry }

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
  (event: 'open-web', url: string): void
}>()

const { t } = useI18n()
const transport = isElectronRenderer() ? useTuffTransport() : null
const gitSdk = transport ? createWorkspaceGitSdk(transport) : null

const GIT_SUB_TAB_STORAGE_KEY = 'tuff.home.gitSubTab'

function readStoredSubTab(): GitSubTab {
  if (!hasWindow()) return 'changes'
  try {
    const raw = window.localStorage.getItem(GIT_SUB_TAB_STORAGE_KEY)
    if (raw === 'changes' || raw === 'branches' || raw === 'log') return raw
  } catch {
    // ignore storage failures
  }
  return 'changes'
}

function writeStoredSubTab(next: GitSubTab): void {
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(GIT_SUB_TAB_STORAGE_KEY, next)
  } catch {
    // ignore storage failures
  }
}

const subTab = ref<GitSubTab>(readStoredSubTab())
const status = ref<WorkspaceGitStatusResult | null>(null)
const branches = ref<WorkspaceGitBranchEntry[]>([])
const remotes = ref<WorkspaceGitRemoteEntry[]>([])
const commits = ref<WorkspaceGitCommitEntry[]>([])
const loadingStatus = ref(false)
const loadingBranches = ref(false)
const loadingLog = ref(false)
const loadingDiff = ref(false)
const mutating = ref(false)
const actionError = ref('')
const pendingConfirm = ref<PendingConfirm | null>(null)

const commitMessage = ref('')
const branchQuery = ref('')

const selectedFile = ref<{ path: string; staged: boolean; untracked: boolean } | null>(null)
const diffResult = ref<WorkspaceGitDiffResult | null>(null)

const expandedFolderIds = ref<Set<string>>(new Set())
const treeExpansionInitialized = ref(false)
const previewedBranch = ref<WorkspaceGitBranchEntry | null>(null)
const previewCommits = ref<WorkspaceGitCommitEntry[]>([])
const loadingBranchPreview = ref(false)
const branchPreviewError = ref('')

const branchEditTarget = ref<WorkspaceGitBranchEntry | null>(null)
const editBranchName = ref('')
const editBranchUpstream = ref('')

const remoteEditMode = ref<'add' | 'edit' | null>(null)
const remoteEditOriginalName = ref('')
const remoteEditHasCredentials = ref(false)
const editRemoteName = ref('')
const editRemoteFetchUrl = ref('')
const editRemotePushUrl = ref('')

const branchMenuRef = ref<InstanceType<typeof TxContextMenu> | null>(null)
const branchMenuOpen = ref(false)
const branchMenuTarget = ref<WorkspaceGitBranchEntry | null>(null)

const remoteMenuRef = ref<InstanceType<typeof TxContextMenu> | null>(null)
const remoteMenuOpen = ref(false)
const remoteMenuTarget = ref<WorkspaceGitRemoteEntry | null>(null)

const avatarLoadState = reactive<Record<string, 'loaded' | 'error'>>({})

let statusRequestSeq = 0
let diffRequestSeq = 0
let branchesRequestSeq = 0
let logRequestSeq = 0
let branchPreviewSeq = 0

const target = computed(() => ({
  ...(props.cwd ? { cwd: props.cwd } : {}),
  ...(props.conversationId ? { conversationId: props.conversationId } : {})
}))

const targetKey = computed(() => `${props.cwd ?? ''}\0${props.conversationId ?? ''}`)

const stagedFiles = computed(() => (status.value?.files ?? []).filter((item) => item.staged))
const unstagedFiles = computed(() =>
  (status.value?.files ?? []).filter((item) => item.unstaged || item.untracked || item.conflicted)
)
const totalChanges = computed(() => stagedFiles.value.length + unstagedFiles.value.length)

const normalizedBranchQuery = computed(() => branchQuery.value.trim())

const localBranches = computed(() => {
  const q = normalizedBranchQuery.value.toLowerCase()
  return branches.value.filter(
    (branch) => !branch.isRemote && (!q || branch.name.toLowerCase().includes(q))
  )
})

const remoteByName = computed(() => new Map(remotes.value.map((item) => [item.name, item])))
const allRemoteBranches = computed(() => branches.value.filter((branch) => branch.isRemote))

const remoteBranches = computed(() => {
  const q = normalizedBranchQuery.value.toLowerCase()
  return branches.value.filter(
    (branch) => branch.isRemote && (!q || branch.name.toLowerCase().includes(q))
  )
})

const matchingRemoteNames = computed(() => {
  const q = normalizedBranchQuery.value.toLowerCase()
  return remotes.value
    .filter((remote) => {
      if (!q) return true
      return (
        remote.name.toLowerCase().includes(q) ||
        (remote.displayLabel?.toLowerCase().includes(q) ?? false) ||
        (remote.host?.toLowerCase().includes(q) ?? false)
      )
    })
    .map((remote) => remote.name)
})

const localBranchTree = computed(() =>
  buildBranchTree(localBranches.value, 'local', status.value?.upstream)
)

const remoteBranchTree = computed(() =>
  buildBranchTree(
    remoteBranches.value,
    'remote',
    status.value?.upstream,
    matchingRemoteNames.value,
    remotes.value.map((item) => item.name)
  )
)

const isBranchFiltering = computed(() => normalizedBranchQuery.value.length > 0)

const localBranchRows = computed(() =>
  flattenBranchTree(localBranchTree.value, expandedFolderIds.value, isBranchFiltering.value)
)

const remoteBranchRows = computed(() =>
  flattenBranchTree(remoteBranchTree.value, expandedFolderIds.value, isBranchFiltering.value)
)

const canCreateQueriedBranch = computed(() => {
  const candidate = normalizedBranchQuery.value
  if (!candidate || /\s/.test(candidate)) return false
  if (candidate.startsWith('-') || candidate.startsWith('/') || candidate.endsWith('/')) {
    return false
  }
  return !branches.value.some((branch) => !branch.isRemote && branch.name === candidate)
})

const canCommit = computed(
  () =>
    Boolean(status.value?.isRepo) &&
    stagedFiles.value.length > 0 &&
    commitMessage.value.trim().length > 0 &&
    !mutating.value
)

const diffTransitionKey = computed(() =>
  selectedFile.value ? `${selectedFile.value.path}:${selectedFile.value.staged}` : 'none'
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

function treeIndentStyle(depth: number): Record<string, string> {
  return {
    '--git-tree-depth': String(depth)
  }
}

function toggleFolder(folderId: string): void {
  const next = new Set(expandedFolderIds.value)
  if (next.has(folderId)) {
    next.delete(folderId)
  } else {
    next.add(folderId)
  }
  expandedFolderIds.value = next
}

function onAvatarLoad(url: string): void {
  avatarLoadState[url] = 'loaded'
}

function onAvatarError(url: string): void {
  avatarLoadState[url] = 'error'
}

function resolveRepoFilePath(relPath: string): string {
  const root = status.value?.repoRoot?.replace(/\/+$/, '')
  return root ? `${root}/${relPath}` : relPath
}

function closeDiff(): void {
  selectedFile.value = null
  diffResult.value = null
}

function remoteProviderIcon(provider: WorkspaceGitRemoteProvider): string {
  switch (provider) {
    case 'github':
      return 'i-ri-github-fill'
    case 'gitlab':
      return 'i-ri-gitlab-fill'
    case 'local':
      return 'i-ri-hard-drive-2-line'
    case 'gitee':
    case 'bitbucket':
    case 'codeberg':
      return 'i-ri-git-repository-line'
    default:
      return 'i-ri-global-line'
  }
}

function remoteForBranch(branch: WorkspaceGitBranchEntry): WorkspaceGitRemoteEntry | undefined {
  if (!branch.isRemote) return undefined
  const remoteName = resolveRemoteNameForBranch(
    branch,
    remotes.value.map((item) => item.name)
  )
  return remoteName ? remoteByName.value.get(remoteName) : undefined
}

function closeBranchEditor(): void {
  branchEditTarget.value = null
  editBranchName.value = ''
  editBranchUpstream.value = ''
}

function closeRemoteEditor(): void {
  remoteEditMode.value = null
  remoteEditOriginalName.value = ''
  remoteEditHasCredentials.value = false
  editRemoteName.value = ''
  editRemoteFetchUrl.value = ''
  editRemotePushUrl.value = ''
}

function openBranchEditor(branch: WorkspaceGitBranchEntry): void {
  if (branch.isRemote) return
  closeRemoteEditor()
  closeBranchPreview()
  branchEditTarget.value = branch
  editBranchName.value = branch.name
  editBranchUpstream.value = branch.upstream ?? ''
}

function openAddRemoteEditor(prefillName = ''): void {
  closeBranchPreview()
  closeBranchEditor()
  remoteEditMode.value = 'add'
  remoteEditOriginalName.value = ''
  remoteEditHasCredentials.value = false
  editRemoteName.value = prefillName
  editRemoteFetchUrl.value = ''
  editRemotePushUrl.value = ''
}

function openRemoteEditor(remote: WorkspaceGitRemoteEntry): void {
  closeBranchPreview()
  closeBranchEditor()
  remoteEditMode.value = 'edit'
  remoteEditOriginalName.value = remote.name
  remoteEditHasCredentials.value = Boolean(remote.hasCredentials)
  editRemoteName.value = remote.name
  editRemoteFetchUrl.value = remote.fetchUrl
  editRemotePushUrl.value =
    remote.pushUrl && remote.pushUrl !== remote.fetchUrl ? remote.pushUrl : ''
}

function closeBranchPreview(): void {
  branchPreviewSeq += 1
  previewedBranch.value = null
  previewCommits.value = []
  branchPreviewError.value = ''
  loadingBranchPreview.value = false
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
  const key = targetKey.value
  const seq = ++branchesRequestSeq
  loadingBranches.value = true
  try {
    const next = await gitSdk.branches(target.value)
    if (seq !== branchesRequestSeq || key !== targetKey.value) return
    branches.value = next.branches
    const remotesLoaded = !next.remotesError && Array.isArray(next.remotes)
    if (remotesLoaded) {
      remotes.value = next.remotes!
    }
    if (next.error) {
      actionError.value = next.error
    } else if (next.remotesError) {
      actionError.value = next.remotesError
    }

    if (!treeExpansionInitialized.value) {
      const remoteNames = remotes.value.map((item) => item.name)
      const localNodes = buildBranchTree(
        next.branches.filter((branch) => !branch.isRemote),
        'local',
        status.value?.upstream
      )
      const remoteNodes = buildBranchTree(
        next.branches.filter((branch) => branch.isRemote),
        'remote',
        status.value?.upstream,
        remoteNames,
        remoteNames
      )
      expandedFolderIds.value = new Set([
        ...collectDefaultExpandedFolders(localNodes, 'local'),
        ...collectDefaultExpandedFolders(remoteNodes, 'remote')
      ])
      treeExpansionInitialized.value = true
    }

    if (previewedBranch.value) {
      const prevShortOid = previewedBranch.value.shortOid
      const prevFullRef = previewedBranch.value.fullRef
      const updated = next.branches.find(
        (item) =>
          item.name === previewedBranch.value?.name &&
          item.isRemote === previewedBranch.value?.isRemote
      )
      if (updated) {
        previewedBranch.value = updated
        if (updated.shortOid !== prevShortOid || updated.fullRef !== prevFullRef) {
          void loadBranchPreviewCommits(updated)
        }
      } else {
        closeBranchPreview()
      }
    }

    if (branchEditTarget.value) {
      const updatedEdit = next.branches.find(
        (item) => !item.isRemote && item.name === branchEditTarget.value?.name
      )
      if (updatedEdit) {
        branchEditTarget.value = updatedEdit
      } else {
        closeBranchEditor()
      }
    }

    if (remotesLoaded && remoteEditMode.value === 'edit' && remoteEditOriginalName.value) {
      const stillExists = remotes.value.some((item) => item.name === remoteEditOriginalName.value)
      if (!stillExists) {
        closeRemoteEditor()
      }
    }
  } catch (error) {
    if (seq === branchesRequestSeq && key === targetKey.value) {
      actionError.value = error instanceof Error ? error.message : String(error)
    }
  } finally {
    if (seq === branchesRequestSeq && key === targetKey.value) {
      loadingBranches.value = false
    }
  }
}

async function loadBranchPreviewCommits(branch: WorkspaceGitBranchEntry): Promise<void> {
  if (!gitSdk) return
  branchPreviewError.value = ''
  const key = targetKey.value
  const seq = ++branchPreviewSeq
  loadingBranchPreview.value = true
  try {
    const next = await gitSdk.log({
      ...target.value,
      ref: branch.fullRef || branch.name,
      limit: 8
    })
    if (seq !== branchPreviewSeq || key !== targetKey.value) return
    previewCommits.value = next.commits
    if (next.error) branchPreviewError.value = next.error
  } catch (error) {
    if (seq === branchPreviewSeq && key === targetKey.value) {
      previewCommits.value = []
      branchPreviewError.value = error instanceof Error ? error.message : String(error)
    }
  } finally {
    if (seq === branchPreviewSeq && key === targetKey.value) {
      loadingBranchPreview.value = false
    }
  }
}

async function previewBranch(branch: WorkspaceGitBranchEntry): Promise<void> {
  closeBranchEditor()
  closeRemoteEditor()
  previewedBranch.value = branch
  await loadBranchPreviewCommits(branch)
}

function handleBranchDoubleClick(branch: WorkspaceGitBranchEntry): void {
  if (branch.current || mutating.value) return
  void switchBranch(branch.name)
}

function openBranchMenu(branch: WorkspaceGitBranchEntry, event: MouseEvent): void {
  event.preventDefault()
  remoteMenuOpen.value = false
  branchMenuTarget.value = branch
  branchMenuRef.value?.openAt(event)
}

function openRemoteMenu(remoteName: string, event: MouseEvent): void {
  const cleanName = remoteName.trim()
  if (!cleanName) return
  event.preventDefault()
  branchMenuOpen.value = false
  const existing = remoteByName.value.get(cleanName)
  remoteMenuTarget.value = existing ?? {
    name: cleanName,
    fetchUrl: '',
    pushUrl: '',
    provider: 'custom'
  }
  remoteMenuRef.value?.openAt(event)
}

function openRemoteFolderMenu(
  row: { depth: number; label: string; fullPath: string; remoteName?: string },
  event: MouseEvent
): void {
  const remoteName =
    row.remoteName || (row.depth === 0 ? row.label : (row.fullPath.split('/')[0] ?? ''))
  openRemoteMenu(remoteName, event)
}

function selectBranchMenuAction(
  action: 'preview' | 'switch' | 'edit' | 'view-remote' | 'copy-name' | 'copy-hash' | 'delete'
): void {
  const branch = branchMenuTarget.value
  branchMenuOpen.value = false
  if (!branch) return
  if (action === 'preview') {
    void previewBranch(branch)
  } else if (action === 'switch' && !branch.current) {
    void switchBranch(branch.name)
  } else if (action === 'edit' && !branch.isRemote) {
    openBranchEditor(branch)
  } else if (action === 'view-remote') {
    const parentRemote = remoteForBranch(branch)
    if (parentRemote) openRemoteEditor(parentRemote)
  } else if (action === 'copy-name') {
    void copyText(branch.name)
  } else if (action === 'copy-hash' && branch.shortOid) {
    void copyText(branch.shortOid)
  } else if (action === 'delete' && !branch.isRemote && !branch.current) {
    requestDeleteBranch(branch)
  }
}

function selectRemoteMenuAction(
  action: 'edit' | 'fetch' | 'copy-url' | 'open-web' | 'remove'
): void {
  const remote = remoteMenuTarget.value
  remoteMenuOpen.value = false
  if (!remote) return
  if (action === 'edit') {
    if (remoteByName.value.has(remote.name)) {
      openRemoteEditor(remote)
    } else {
      openAddRemoteEditor(remote.name)
    }
  } else if (action === 'fetch') {
    void handleFetchRemote(remote.name)
  } else if (action === 'copy-url' && remote.fetchUrl) {
    void copyText(remote.fetchUrl)
  } else if (action === 'open-web' && remote.webUrl) {
    emit('open-web', remote.webUrl)
  } else if (action === 'remove') {
    requestRemoveRemote(remote)
  }
}

async function refreshLog(): Promise<void> {
  if (!gitSdk || !status.value?.isRepo) return
  const key = targetKey.value
  const seq = ++logRequestSeq
  loadingLog.value = true
  try {
    const next = await gitSdk.log({ ...target.value, limit: 40 })
    if (seq !== logRequestSeq || key !== targetKey.value) return
    commits.value = next.commits
    if (next.error) actionError.value = next.error
  } catch (error) {
    if (seq === logRequestSeq && key === targetKey.value) {
      actionError.value = error instanceof Error ? error.message : String(error)
    }
  } finally {
    if (seq === logRequestSeq && key === targetKey.value) {
      loadingLog.value = false
    }
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
  writeStoredSubTab(next)
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
  const key = targetKey.value
  mutating.value = true
  actionError.value = ''
  try {
    const result = await action()
    if (key !== targetKey.value) return false
    if (!result.ok) {
      const message = result.error || t('home.git.actionFailed')
      actionError.value = message
      toast.error(message)
      return false
    }
    applyMutationStatus(result.status)
    const notice = successMessage || result.summary
    if (notice) {
      toast.success(notice)
    }
    return true
  } catch (error) {
    if (key === targetKey.value) {
      const message = error instanceof Error ? error.message : String(error)
      actionError.value = message
      toast.error(message)
    }
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

function requestDeleteBranch(branch: WorkspaceGitBranchEntry): void {
  if (branch.isRemote || branch.current) return
  actionError.value = ''
  pendingConfirm.value = { kind: 'delete-branch', branch, force: false }
}

function requestRemoveRemote(remote: WorkspaceGitRemoteEntry): void {
  actionError.value = ''
  pendingConfirm.value = { kind: 'remove-remote', remote }
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
    return
  }

  if (current.kind === 'delete-branch') {
    const ok = await runMutation(
      () =>
        gitSdk.deleteBranch({
          ...target.value,
          branch: current.branch.name,
          force: current.force
        }),
      t('home.git.branchDeleted', { branch: current.branch.name })
    )
    if (ok) {
      if (branchEditTarget.value?.name === current.branch.name) closeBranchEditor()
      if (previewedBranch.value?.name === current.branch.name && !previewedBranch.value.isRemote) {
        closeBranchPreview()
      }
      await refreshBranches()
    }
    return
  }

  if (current.kind === 'remove-remote') {
    const ok = await runMutation(
      () => gitSdk.removeRemote({ ...target.value, name: current.remote.name }),
      t('home.git.remoteRemoved', { name: current.remote.name })
    )
    if (ok) {
      if (remoteEditMode.value === 'edit' && remoteEditOriginalName.value === current.remote.name) {
        closeRemoteEditor()
      }
      await refreshBranches()
    }
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

async function handleFetchRemote(remoteName: string): Promise<void> {
  if (!gitSdk) return
  pendingConfirm.value = null
  const ok = await runMutation(
    () => gitSdk.fetch({ ...target.value, remote: remoteName }),
    t('home.git.fetchedRemote', { name: remoteName })
  )
  if (ok) {
    await refreshBranches()
  }
}

async function saveBranchEdit(): Promise<void> {
  if (!gitSdk || !branchEditTarget.value || mutating.value) return
  const original = branchEditTarget.value
  const nextName = editBranchName.value.trim()
  const nextUpstream = editBranchUpstream.value.trim()
  const prevUpstream = original.upstream ?? ''
  if (!nextName) return

  let activeName = original.name
  let changed = false

  if (nextName !== original.name) {
    const renamed = await runMutation(
      () => gitSdk.renameBranch({ ...target.value, oldName: original.name, newName: nextName }),
      nextUpstream === prevUpstream ? t('home.git.branchRenamed', { branch: nextName }) : undefined
    )
    if (!renamed) return
    activeName = nextName
    changed = true
    branchEditTarget.value = {
      ...original,
      name: activeName,
      fullRef: `refs/heads/${activeName}`
    }
  }

  if (nextUpstream !== prevUpstream) {
    const updatedUpstream = await runMutation(
      () =>
        gitSdk.setUpstream({
          ...target.value,
          branch: activeName,
          upstream: nextUpstream || null
        }),
      t('home.git.branchUpdated', { branch: activeName })
    )
    if (!updatedUpstream) {
      if (changed) await refreshBranches()
      return
    }
    changed = true
  }

  if (changed) {
    await refreshBranches()
    const updatedBranch = branches.value.find((item) => !item.isRemote && item.name === activeName)
    if (updatedBranch) {
      branchEditTarget.value = updatedBranch
      editBranchName.value = updatedBranch.name
      editBranchUpstream.value = updatedBranch.upstream ?? ''
    } else {
      closeBranchEditor()
    }
  } else {
    closeBranchEditor()
  }
}

async function saveRemoteEdit(): Promise<void> {
  if (!gitSdk || !remoteEditMode.value || mutating.value) return
  const mode = remoteEditMode.value
  const name = editRemoteName.value.trim()
  const fetchUrl = editRemoteFetchUrl.value.trim()
  const pushUrl = editRemotePushUrl.value.trim()
  if (!name || !fetchUrl) return

  const ok = await runMutation(
    () =>
      gitSdk.saveRemote({
        ...target.value,
        mode,
        name,
        ...(mode === 'edit' ? { originalName: remoteEditOriginalName.value || name } : {}),
        fetchUrl,
        pushUrl
      }),
    mode === 'add' ? t('home.git.remoteAdded', { name }) : t('home.git.remoteSaved', { name })
  )
  if (ok) {
    closeRemoteEditor()
    await refreshBranches()
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
    await refreshBranches()
    if (commits.value.length > 0) void refreshLog()
  }
}

async function createBranch(): Promise<void> {
  if (!gitSdk || mutating.value || !canCreateQueriedBranch.value) return
  const name = normalizedBranchQuery.value
  if (!name) return
  pendingConfirm.value = null
  const ok = await runMutation(
    () => gitSdk.checkout({ ...target.value, branch: name, create: true }),
    t('home.git.createdBranch', { branch: name })
  )
  if (ok) {
    branchQuery.value = ''
    await refreshBranches()
  }
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t('home.copied'))
  } catch {
    // ignore clipboard failures
  }
}

watch(
  [() => props.cwd, () => props.conversationId, () => props.active],
  ([, , active], previous) => {
    const targetChanged =
      !previous || previous[0] !== props.cwd || previous[1] !== props.conversationId
    if (targetChanged) {
      branchesRequestSeq += 1
      logRequestSeq += 1
      branchPreviewSeq += 1
      status.value = null
      branches.value = []
      remotes.value = []
      commits.value = []
      loadingBranches.value = false
      loadingLog.value = false
      selectedFile.value = null
      diffResult.value = null
      previewedBranch.value = null
      previewCommits.value = []
      branchPreviewError.value = ''
      loadingBranchPreview.value = false
      closeBranchEditor()
      closeRemoteEditor()
      expandedFolderIds.value = new Set()
      treeExpansionInitialized.value = false
      branchQuery.value = ''
      pendingConfirm.value = null
      actionError.value = ''
      branchMenuOpen.value = false
      branchMenuTarget.value = null
      remoteMenuOpen.value = false
      remoteMenuTarget.value = null
    }
    if (!active) return
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
          :class="{ 'is-highlighted-behind': status.behind > 0 }"
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
          :class="{ 'is-highlighted-ahead': status.ahead > 0 }"
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

    <!-- Inline secondary confirmation bar for high-risk actions -->
    <Transition name="git-slide-down">
      <div
        v-if="pendingConfirm"
        class="HomeSideGit-ConfirmBar"
        :class="{
          'is-danger':
            pendingConfirm.kind === 'discard' ||
            pendingConfirm.kind === 'delete-branch' ||
            pendingConfirm.kind === 'remove-remote'
        }"
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
          <template v-else-if="pendingConfirm.kind === 'push'">
            {{
              t('home.git.confirmPush', {
                branch: status?.branch ?? '',
                target: status?.upstream || t('home.git.defaultRemote')
              })
            }}
          </template>
          <template v-else-if="pendingConfirm.kind === 'delete-branch'">
            <div>
              {{ t('home.git.confirmDeleteBranch', { branch: pendingConfirm.branch.name }) }}
            </div>
            <label class="HomeSideGit-ConfirmCheck">
              <input v-model="pendingConfirm.force" type="checkbox" />
              <span>{{ t('home.git.confirmDeleteBranchForce') }}</span>
            </label>
          </template>
          <template v-else>
            {{ t('home.git.confirmRemoveRemote', { name: pendingConfirm.remote.name }) }}
          </template>
        </div>
        <div class="HomeSideGit-ConfirmActions">
          <button
            type="button"
            class="HomeSideGit-ConfirmBtn"
            :class="
              pendingConfirm.kind === 'discard' ||
              pendingConfirm.kind === 'delete-branch' ||
              pendingConfirm.kind === 'remove-remote'
                ? 'is-danger'
                : 'is-primary'
            "
            :disabled="mutating"
            @click="executeConfirm"
          >
            {{
              pendingConfirm.kind === 'discard'
                ? t('home.git.confirmDiscardAction')
                : pendingConfirm.kind === 'pull'
                  ? t('home.git.confirmPullAction')
                  : pendingConfirm.kind === 'push'
                    ? t('home.git.confirmPushAction')
                    : pendingConfirm.kind === 'delete-branch'
                      ? t('home.git.confirmDeleteBranchAction')
                      : t('home.git.confirmRemoveRemoteAction')
            }}
          </button>
          <button type="button" class="HomeSideGit-ConfirmBtn" @click="cancelConfirm">
            {{ t('common.cancel') }}
          </button>
        </div>
      </div>
    </Transition>

    <!-- Error banner (success notices use top-right toast) -->
    <Transition name="git-slide-down">
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
    </Transition>

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
                <span class="HomeSideGit-GroupTitle is-staged">
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
                <span class="HomeSideGit-GroupTitle is-unstaged">
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

        <!-- Animated Unified Diff Drawer -->
        <Transition name="git-drawer">
          <div v-if="selectedFile" class="HomeSideGit-DiffPane">
            <div class="HomeSideGit-DiffHeader">
              <div class="HomeSideGit-DiffMeta">
                <span
                  class="HomeSideGit-DiffScope"
                  :class="selectedFile.staged ? 'is-staged' : 'is-unstaged'"
                >
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

            <Transition name="git-fade" mode="out-in">
              <div :key="diffTransitionKey" class="HomeSideGit-DiffContentWrap">
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
            </Transition>
          </div>
        </Transition>
      </div>

      <!-- BRANCHES VIEW -->
      <div v-else-if="subTab === 'branches'" class="HomeSideGit-Body">
        <div class="HomeSideGit-ScrollView">
          <!-- Merged single search + create branch bar -->
          <form class="HomeSideGit-BranchCombo" @submit.prevent="createBranch">
            <div class="HomeSideGit-ComboInputWrap">
              <span class="i-ri-search-line HomeSideGit-ComboIcon" aria-hidden="true" />
              <input
                v-model="branchQuery"
                type="text"
                class="HomeSideGit-ComboInput"
                :placeholder="t('home.git.branchSearchOrCreatePlaceholder')"
                :aria-label="t('home.git.branchSearchOrCreatePlaceholder')"
              />
              <button
                v-if="branchQuery"
                type="button"
                class="HomeSideGit-ComboClear"
                :title="t('home.git.clearSearch')"
                :aria-label="t('home.git.clearSearch')"
                @click="branchQuery = ''"
              >
                <span class="i-ri-close-line" aria-hidden="true" />
              </button>
            </div>
            <button
              type="submit"
              class="HomeSideGit-PrimaryBtn"
              :disabled="!canCreateQueriedBranch || mutating"
              data-testid="git-create-branch-btn"
            >
              <span class="i-ri-add-line" aria-hidden="true" />
              <span>{{ t('home.git.createBranch') }}</span>
            </button>
          </form>

          <div v-if="loadingBranches && branches.length === 0" class="HomeSideGit-Skeleton">
            <TxSkeleton :height="28" :radius="6" />
            <TxSkeleton :height="28" :radius="6" />
            <TxSkeleton :height="28" :radius="6" />
          </div>

          <div
            v-else-if="
              localBranchRows.length === 0 && remoteBranchRows.length === 0 && isBranchFiltering
            "
            class="HomeSideGit-CleanState"
          >
            <span class="i-ri-git-branch-line HomeSideGit-CleanIcon" aria-hidden="true" />
            <span>{{ t('home.git.branchNoMatch') }}</span>
            <button
              v-if="canCreateQueriedBranch"
              type="button"
              class="HomeSideGit-SecondaryBtn"
              :disabled="mutating"
              @click="createBranch"
            >
              <span class="i-ri-add-line" aria-hidden="true" />
              <span>{{
                t('home.git.createBranchFromQuery', { branch: normalizedBranchQuery })
              }}</span>
            </button>
          </div>

          <template v-else>
            <!-- Local branch tree -->
            <div v-if="localBranchRows.length > 0" class="HomeSideGit-Group">
              <div class="HomeSideGit-GroupHead">
                <span class="HomeSideGit-GroupTitle is-local">
                  <span class="i-ri-git-branch-line HomeSideGit-GroupIcon" aria-hidden="true" />
                  <span>{{ t('home.git.localBranches') }}</span>
                  <span class="HomeSideGit-GroupCount is-local">{{ localBranches.length }}</span>
                </span>
              </div>
              <ul class="HomeSideGit-BranchTree" :aria-label="t('home.git.localBranches')">
                <li v-for="row in localBranchRows" :key="row.id">
                  <button
                    v-if="row.kind === 'folder'"
                    type="button"
                    :aria-expanded="row.expanded"
                    class="HomeSideGit-TreeFolder"
                    :class="[`is-tone-${row.tone}`, { 'has-current': row.hasCurrent }]"
                    :style="treeIndentStyle(row.depth)"
                    :title="row.fullPath"
                    @click="toggleFolder(row.id)"
                  >
                    <span
                      class="i-ri-arrow-right-s-line HomeSideGit-TreeChevron"
                      :class="{ 'is-expanded': row.expanded }"
                      aria-hidden="true"
                    />
                    <span
                      :class="row.expanded ? 'i-ri-folder-open-line' : 'i-ri-folder-3-line'"
                      class="HomeSideGit-FolderIcon"
                      aria-hidden="true"
                    />
                    <span class="HomeSideGit-FolderLabel">{{ row.label }}</span>
                    <span class="HomeSideGit-FolderCount">{{ row.branchCount }}</span>
                  </button>

                  <button
                    v-else
                    type="button"
                    class="HomeSideGit-BranchRow"
                    :class="[
                      `is-tone-${row.tone}`,
                      {
                        'is-current': row.branch.current,
                        'is-previewed':
                          previewedBranch?.name === row.branch.name && !previewedBranch.isRemote
                      }
                    ]"
                    :style="treeIndentStyle(row.depth)"
                    :title="row.fullName"
                    @click="previewBranch(row.branch)"
                    @dblclick="handleBranchDoubleClick(row.branch)"
                    @contextmenu="openBranchMenu(row.branch, $event)"
                  >
                    <span
                      :class="row.branch.current ? 'i-ri-check-line' : 'i-ri-git-branch-line'"
                      class="HomeSideGit-BranchRowIcon"
                      aria-hidden="true"
                    />
                    <span class="HomeSideGit-BranchRowMain">
                      <span class="HomeSideGit-BranchRowName">{{ row.label }}</span>
                      <span v-if="row.branch.subject" class="HomeSideGit-BranchRowSubject">
                        {{ row.branch.subject }}
                      </span>
                    </span>
                    <span
                      v-if="row.branch.shortOid"
                      class="HomeSideGit-HashPill"
                      :class="{ 'is-current': row.branch.current }"
                    >
                      {{ row.branch.shortOid }}
                    </span>
                  </button>
                </li>
              </ul>
            </div>

            <!-- Remote branch tree -->
            <div v-if="remoteBranchRows.length > 0 || !isBranchFiltering" class="HomeSideGit-Group">
              <div class="HomeSideGit-GroupHead">
                <span class="HomeSideGit-GroupTitle is-remote">
                  <span class="i-ri-cloud-line HomeSideGit-GroupIcon" aria-hidden="true" />
                  <span>{{ t('home.git.remoteBranches') }}</span>
                  <span class="HomeSideGit-GroupCount is-remote">{{ remoteBranches.length }}</span>
                </span>
                <button
                  type="button"
                  class="HomeSideGit-GroupAction"
                  :disabled="mutating"
                  data-testid="git-add-remote-btn"
                  @click="openAddRemoteEditor()"
                >
                  <span class="i-ri-add-line" aria-hidden="true" />
                  <span>{{ t('home.git.addRemote') }}</span>
                </button>
              </div>
              <ul
                v-if="remoteBranchRows.length > 0"
                class="HomeSideGit-BranchTree"
                :aria-label="t('home.git.remoteBranches')"
              >
                <li v-for="row in remoteBranchRows" :key="row.id">
                  <div
                    v-if="row.kind === 'folder' && row.depth === 0"
                    class="HomeSideGit-RemoteRootRow"
                    :class="{
                      'is-editing':
                        remoteEditMode === 'edit' && remoteEditOriginalName === row.label
                    }"
                    :data-remote-root="row.label"
                    @contextmenu="openRemoteFolderMenu(row, $event)"
                  >
                    <button
                      type="button"
                      :aria-expanded="row.expanded"
                      class="HomeSideGit-TreeFolder is-remote-node is-remote-root"
                      :class="[
                        `is-tone-${row.tone}`,
                        {
                          'has-current': row.hasCurrent
                        }
                      ]"
                      :style="treeIndentStyle(row.depth)"
                      :title="
                        remoteByName.get(row.label)?.fetchUrl
                          ? `${row.label} · ${remoteByName.get(row.label)!.fetchUrl}`
                          : row.fullPath
                      "
                      @click="toggleFolder(row.id)"
                    >
                      <span
                        class="i-ri-arrow-right-s-line HomeSideGit-TreeChevron"
                        :class="{ 'is-expanded': row.expanded }"
                        aria-hidden="true"
                      />
                      <span class="i-ri-cloud-line HomeSideGit-FolderIcon" aria-hidden="true" />
                      <span class="HomeSideGit-FolderLabel">{{ row.label }}</span>
                      <span
                        v-if="remoteByName.get(row.label)?.displayLabel"
                        class="HomeSideGit-RemoteBadge"
                        :class="`is-${remoteByName.get(row.label)!.provider}`"
                        :title="remoteByName.get(row.label)!.fetchUrl"
                      >
                        <span
                          :class="remoteProviderIcon(remoteByName.get(row.label)!.provider)"
                          aria-hidden="true"
                        />
                        <span class="HomeSideGit-RemoteBadgeText">
                          {{ remoteByName.get(row.label)!.displayLabel }}
                        </span>
                      </span>
                      <span class="HomeSideGit-FolderCount">{{ row.branchCount }}</span>
                    </button>
                    <button
                      type="button"
                      class="HomeSideGit-RowIconBtn HomeSideGit-RemoteMoreBtn"
                      :title="t('home.git.editRemote')"
                      :aria-label="`${t('home.git.editRemote')}: ${row.label}`"
                      :data-testid="`git-remote-actions-${row.label}`"
                      @click.stop="openRemoteMenu(row.remoteName || row.label, $event)"
                    >
                      <span class="i-ri-more-2-line" aria-hidden="true" />
                    </button>
                  </div>

                  <button
                    v-else-if="row.kind === 'folder'"
                    type="button"
                    :aria-expanded="row.expanded"
                    class="HomeSideGit-TreeFolder is-remote-node"
                    :class="[`is-tone-${row.tone}`, { 'has-current': row.hasCurrent }]"
                    :style="treeIndentStyle(row.depth)"
                    :title="row.fullPath"
                    @click="toggleFolder(row.id)"
                    @contextmenu="openRemoteFolderMenu(row, $event)"
                  >
                    <span
                      class="i-ri-arrow-right-s-line HomeSideGit-TreeChevron"
                      :class="{ 'is-expanded': row.expanded }"
                      aria-hidden="true"
                    />
                    <span
                      :class="row.expanded ? 'i-ri-folder-open-line' : 'i-ri-folder-3-line'"
                      class="HomeSideGit-FolderIcon"
                      aria-hidden="true"
                    />
                    <span class="HomeSideGit-FolderLabel">{{ row.label }}</span>
                    <span class="HomeSideGit-FolderCount">{{ row.branchCount }}</span>
                  </button>

                  <button
                    v-else
                    type="button"
                    class="HomeSideGit-BranchRow is-remote-node"
                    :class="[
                      `is-tone-${row.tone}`,
                      {
                        'is-previewed':
                          previewedBranch?.name === row.branch.name && previewedBranch.isRemote
                      }
                    ]"
                    :style="treeIndentStyle(row.depth)"
                    :title="row.fullName"
                    @click="previewBranch(row.branch)"
                    @dblclick="handleBranchDoubleClick(row.branch)"
                    @contextmenu="openBranchMenu(row.branch, $event)"
                  >
                    <span class="i-ri-cloud-line HomeSideGit-BranchRowIcon" aria-hidden="true" />
                    <span class="HomeSideGit-BranchRowMain">
                      <span class="HomeSideGit-BranchRowName">{{ row.label }}</span>
                      <span v-if="row.branch.subject" class="HomeSideGit-BranchRowSubject">
                        {{ row.branch.subject }}
                      </span>
                    </span>
                    <span v-if="row.branch.shortOid" class="HomeSideGit-HashPill">
                      {{ row.branch.shortOid }}
                    </span>
                  </button>
                </li>
              </ul>
            </div>
          </template>
        </div>

        <!-- Animated Branch Preview / Editor / Remote Editor Drawer -->
        <Transition name="git-drawer" mode="out-in">
          <div
            v-if="previewedBranch"
            key="branch-preview"
            class="HomeSideGit-BranchPreview"
            data-testid="git-branch-preview"
          >
            <div class="HomeSideGit-PreviewHeader">
              <div class="HomeSideGit-PreviewTitleWrap">
                <span
                  class="HomeSideGit-PreviewScope"
                  :class="previewedBranch.isRemote ? 'is-remote' : 'is-local'"
                >
                  {{
                    previewedBranch.isRemote ? t('home.git.remoteBadge') : t('home.git.localBadge')
                  }}
                </span>
                <span v-if="previewedBranch.current" class="HomeSideGit-PreviewCurrent">
                  {{ t('home.git.currentBranchBadge') }}
                </span>
                <span class="HomeSideGit-PreviewName" :title="previewedBranch.name">
                  {{ previewedBranch.name }}
                </span>
              </div>
              <div class="HomeSideGit-PreviewActions">
                <button
                  v-if="!previewedBranch.current"
                  type="button"
                  class="HomeSideGit-PreviewSwitchBtn"
                  :disabled="mutating"
                  data-testid="git-preview-switch-btn"
                  @click="switchBranch(previewedBranch.name)"
                >
                  <span class="i-ri-git-branch-line" aria-hidden="true" />
                  <span>{{ t('home.git.switchToBranch') }}</span>
                </button>
                <button
                  v-if="!previewedBranch.isRemote"
                  type="button"
                  class="HomeSideGit-RowIconBtn"
                  :title="t('home.git.editBranch')"
                  :aria-label="t('home.git.editBranch')"
                  data-testid="git-preview-edit-btn"
                  @click="openBranchEditor(previewedBranch)"
                >
                  <span class="i-ri-edit-line" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="HomeSideGit-RowIconBtn"
                  :title="t('home.git.copyBranchName')"
                  :aria-label="t('home.git.copyBranchName')"
                  @click="copyText(previewedBranch.name)"
                >
                  <span class="i-ri-file-copy-line" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="HomeSideGit-RowIconBtn"
                  :title="t('common.close')"
                  :aria-label="t('common.close')"
                  @click="closeBranchPreview"
                >
                  <span class="i-ri-close-line" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div class="HomeSideGit-PreviewMeta">
              <button
                v-if="previewedBranch.shortOid"
                type="button"
                class="HomeSideGit-HashPill is-copyable"
                :title="t('home.git.copyLatestHash')"
                @click="copyText(previewedBranch.shortOid)"
              >
                {{ previewedBranch.shortOid }}
              </button>
              <button
                v-if="previewedBranch.isRemote && remoteForBranch(previewedBranch)?.displayLabel"
                type="button"
                class="HomeSideGit-RemoteBadge is-clickable"
                :class="`is-${remoteForBranch(previewedBranch)!.provider}`"
                :title="t('home.git.editRemote')"
                @click="openRemoteEditor(remoteForBranch(previewedBranch)!)"
              >
                <span
                  :class="remoteProviderIcon(remoteForBranch(previewedBranch)!.provider)"
                  aria-hidden="true"
                />
                <span class="HomeSideGit-RemoteBadgeText">
                  {{ remoteForBranch(previewedBranch)!.displayLabel }}
                </span>
              </button>
              <span v-if="previewedBranch.upstream" class="HomeSideGit-PreviewMetaItem">
                <span class="i-ri-links-line" aria-hidden="true" />
                <span>{{ previewedBranch.upstream }}</span>
              </span>
              <span v-if="previewedBranch.author" class="HomeSideGit-PreviewMetaItem">
                {{ previewedBranch.author }}
              </span>
              <span v-if="previewedBranch.relativeDate" class="HomeSideGit-PreviewMetaItem">
                {{ previewedBranch.relativeDate }}
              </span>
            </div>

            <Transition name="git-fade" mode="out-in">
              <div :key="previewedBranch.name" class="HomeSideGit-PreviewBody">
                <div v-if="loadingBranchPreview" class="HomeSideGit-DiffNotice">
                  {{ t('home.git.loadingCommits') }}
                </div>
                <div v-else-if="branchPreviewError" class="HomeSideGit-DiffNotice is-error">
                  {{ branchPreviewError }}
                </div>
                <div v-else-if="previewCommits.length === 0" class="HomeSideGit-DiffNotice">
                  {{ t('home.git.noCommits') }}
                </div>
                <ol v-else class="HomeSideGit-PreviewCommits">
                  <li
                    v-for="commit in previewCommits"
                    :key="commit.hash"
                    class="HomeSideGit-PreviewCommitItem"
                  >
                    <span
                      class="HomeSideGit-Avatar is-sm"
                      :class="`is-tone-${resolveAuthorAvatarTone(commit.authorEmail || commit.author)}`"
                      :title="commit.author"
                    >
                      <span class="HomeSideGit-AvatarInitials" aria-hidden="true">
                        {{ resolveAuthorInitials(commit.author) }}
                      </span>
                      <img
                        v-if="commit.avatarUrl && avatarLoadState[commit.avatarUrl] !== 'error'"
                        :src="commit.avatarUrl"
                        class="HomeSideGit-AvatarImg"
                        :class="{ 'is-loaded': avatarLoadState[commit.avatarUrl] === 'loaded' }"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        alt=""
                        @load="onAvatarLoad(commit.avatarUrl)"
                        @error="onAvatarError(commit.avatarUrl)"
                      />
                    </span>
                    <div class="HomeSideGit-PreviewCommitMain">
                      <span class="HomeSideGit-PreviewCommitSubject" :title="commit.subject">
                        {{ commit.subject }}
                      </span>
                      <span class="HomeSideGit-PreviewCommitMeta">
                        {{ commit.author }} · {{ commit.relativeDate }}
                      </span>
                    </div>
                    <button
                      type="button"
                      class="HomeSideGit-HashPill is-copyable"
                      :title="t('home.git.copyHash')"
                      @click="copyText(commit.hash)"
                    >
                      {{ commit.shortHash }}
                    </button>
                  </li>
                </ol>
              </div>
            </Transition>
          </div>

          <!-- Animated Local Branch Editor Drawer -->
          <div
            v-else-if="branchEditTarget"
            key="branch-edit"
            class="HomeSideGit-BranchPreview"
            data-testid="git-branch-editor"
          >
            <div class="HomeSideGit-PreviewHeader">
              <div class="HomeSideGit-PreviewTitleWrap">
                <span class="HomeSideGit-PreviewScope is-local">
                  {{ t('home.git.editBranch') }}
                </span>
                <span class="HomeSideGit-PreviewName" :title="branchEditTarget.name">
                  {{ branchEditTarget.name }}
                </span>
              </div>
              <div class="HomeSideGit-PreviewActions">
                <button
                  type="button"
                  class="HomeSideGit-RowIconBtn"
                  :title="t('home.git.previewBranch')"
                  :aria-label="t('home.git.previewBranch')"
                  @click="previewBranch(branchEditTarget)"
                >
                  <span class="i-ri-eye-line" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="HomeSideGit-RowIconBtn"
                  :title="t('common.close')"
                  :aria-label="t('common.close')"
                  @click="closeBranchEditor"
                >
                  <span class="i-ri-close-line" aria-hidden="true" />
                </button>
              </div>
            </div>

            <form class="HomeSideGit-EditorForm" @submit.prevent="saveBranchEdit">
              <label class="HomeSideGit-Field">
                <span class="HomeSideGit-FieldLabel">{{ t('home.git.branchNameLabel') }}</span>
                <input
                  v-model="editBranchName"
                  type="text"
                  class="HomeSideGit-EditorInput"
                  data-testid="git-edit-branch-name"
                />
              </label>

              <label class="HomeSideGit-Field">
                <span class="HomeSideGit-FieldLabel">{{ t('home.git.upstreamLabel') }}</span>
                <select
                  v-model="editBranchUpstream"
                  class="HomeSideGit-EditorSelect"
                  data-testid="git-edit-branch-upstream"
                >
                  <option value="">{{ t('home.git.upstreamNone') }}</option>
                  <option
                    v-for="remoteBranch in allRemoteBranches"
                    :key="remoteBranch.name"
                    :value="remoteBranch.name"
                  >
                    {{ remoteBranch.name }}
                  </option>
                </select>
              </label>

              <div class="HomeSideGit-EditorFooter">
                <div class="HomeSideGit-EditorFooterLeft">
                  <button
                    type="submit"
                    class="HomeSideGit-PrimaryBtn"
                    :disabled="!editBranchName.trim() || mutating"
                    data-testid="git-save-branch-btn"
                  >
                    <span class="i-ri-check-line" aria-hidden="true" />
                    <span>{{ t('home.git.saveChanges') }}</span>
                  </button>
                  <button type="button" class="HomeSideGit-SecondaryBtn" @click="closeBranchEditor">
                    {{ t('common.cancel') }}
                  </button>
                </div>
                <button
                  v-if="!branchEditTarget.current"
                  type="button"
                  class="HomeSideGit-DangerBtn"
                  :disabled="mutating"
                  data-testid="git-editor-delete-branch-btn"
                  @click="requestDeleteBranch(branchEditTarget)"
                >
                  <span class="i-ri-delete-bin-6-line" aria-hidden="true" />
                  <span>{{ t('home.git.deleteBranch') }}</span>
                </button>
              </div>
            </form>
          </div>

          <!-- Animated Remote Inspector / Editor Drawer -->
          <div
            v-else-if="remoteEditMode"
            key="remote-edit"
            class="HomeSideGit-BranchPreview"
            data-testid="git-remote-editor"
          >
            <div class="HomeSideGit-PreviewHeader">
              <div class="HomeSideGit-PreviewTitleWrap">
                <span class="HomeSideGit-PreviewScope is-remote">
                  {{
                    remoteEditMode === 'add' ? t('home.git.addRemote') : t('home.git.editRemote')
                  }}
                </span>
                <span
                  v-if="
                    remoteEditMode === 'edit' &&
                    remoteByName.get(remoteEditOriginalName)?.displayLabel
                  "
                  class="HomeSideGit-RemoteBadge"
                  :class="`is-${remoteByName.get(remoteEditOriginalName)!.provider}`"
                >
                  <span
                    :class="remoteProviderIcon(remoteByName.get(remoteEditOriginalName)!.provider)"
                    aria-hidden="true"
                  />
                  <span class="HomeSideGit-RemoteBadgeText">
                    {{ remoteByName.get(remoteEditOriginalName)!.displayLabel }}
                  </span>
                </span>
              </div>
              <div class="HomeSideGit-PreviewActions">
                <button
                  v-if="remoteEditMode === 'edit'"
                  type="button"
                  class="HomeSideGit-RowIconBtn"
                  :disabled="mutating"
                  :title="t('home.git.fetchRemote')"
                  :aria-label="t('home.git.fetchRemote')"
                  @click="handleFetchRemote(remoteEditOriginalName)"
                >
                  <span class="i-ri-download-cloud-2-line" aria-hidden="true" />
                </button>
                <button
                  v-if="
                    remoteEditMode === 'edit' && remoteByName.get(remoteEditOriginalName)?.webUrl
                  "
                  type="button"
                  class="HomeSideGit-RowIconBtn"
                  :title="t('home.git.openRemoteWeb')"
                  :aria-label="t('home.git.openRemoteWeb')"
                  @click="emit('open-web', remoteByName.get(remoteEditOriginalName)!.webUrl!)"
                >
                  <span class="i-ri-external-link-line" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="HomeSideGit-RowIconBtn"
                  :title="t('common.close')"
                  :aria-label="t('common.close')"
                  @click="closeRemoteEditor"
                >
                  <span class="i-ri-close-line" aria-hidden="true" />
                </button>
              </div>
            </div>

            <form class="HomeSideGit-EditorForm" @submit.prevent="saveRemoteEdit">
              <label class="HomeSideGit-Field">
                <span class="HomeSideGit-FieldLabel">{{ t('home.git.remoteNameLabel') }}</span>
                <input
                  v-model="editRemoteName"
                  type="text"
                  class="HomeSideGit-EditorInput"
                  :placeholder="t('home.git.remoteNamePlaceholder')"
                  data-testid="git-edit-remote-name"
                />
              </label>

              <label class="HomeSideGit-Field">
                <span class="HomeSideGit-FieldLabel">{{ t('home.git.remoteFetchUrlLabel') }}</span>
                <input
                  v-model="editRemoteFetchUrl"
                  type="text"
                  class="HomeSideGit-EditorInput is-mono"
                  :placeholder="t('home.git.remoteFetchUrlPlaceholder')"
                  data-testid="git-edit-remote-fetch-url"
                />
              </label>

              <label class="HomeSideGit-Field">
                <span class="HomeSideGit-FieldLabel">{{ t('home.git.remotePushUrlLabel') }}</span>
                <input
                  v-model="editRemotePushUrl"
                  type="text"
                  class="HomeSideGit-EditorInput is-mono"
                  :placeholder="t('home.git.remotePushUrlPlaceholder')"
                  data-testid="git-edit-remote-push-url"
                />
              </label>

              <p v-if="remoteEditHasCredentials" class="HomeSideGit-FieldHint">
                {{ t('home.git.remoteCredentialsHint') }}
              </p>

              <div class="HomeSideGit-EditorFooter">
                <div class="HomeSideGit-EditorFooterLeft">
                  <button
                    type="submit"
                    class="HomeSideGit-PrimaryBtn"
                    :disabled="!editRemoteName.trim() || !editRemoteFetchUrl.trim() || mutating"
                    data-testid="git-save-remote-btn"
                  >
                    <span class="i-ri-check-line" aria-hidden="true" />
                    <span>{{
                      remoteEditMode === 'add' ? t('home.git.addRemote') : t('home.git.saveChanges')
                    }}</span>
                  </button>
                  <button type="button" class="HomeSideGit-SecondaryBtn" @click="closeRemoteEditor">
                    {{ t('common.cancel') }}
                  </button>
                </div>
                <button
                  v-if="remoteEditMode === 'edit' && remoteByName.get(remoteEditOriginalName)"
                  type="button"
                  class="HomeSideGit-DangerBtn"
                  :disabled="mutating"
                  data-testid="git-editor-remove-remote-btn"
                  @click="requestRemoveRemote(remoteByName.get(remoteEditOriginalName)!)"
                >
                  <span class="i-ri-delete-bin-6-line" aria-hidden="true" />
                  <span>{{ t('home.git.removeRemote') }}</span>
                </button>
              </div>
            </form>
          </div>
        </Transition>
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
                @click="copyText(commit.hash)"
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
              <span
                class="HomeSideGit-Avatar"
                :class="`is-tone-${resolveAuthorAvatarTone(commit.authorEmail || commit.author)}`"
                :title="
                  commit.authorEmail ? `${commit.author} <${commit.authorEmail}>` : commit.author
                "
              >
                <span class="HomeSideGit-AvatarInitials" aria-hidden="true">
                  {{ resolveAuthorInitials(commit.author) }}
                </span>
                <img
                  v-if="commit.avatarUrl && avatarLoadState[commit.avatarUrl] !== 'error'"
                  :src="commit.avatarUrl"
                  class="HomeSideGit-AvatarImg"
                  :class="{ 'is-loaded': avatarLoadState[commit.avatarUrl] === 'loaded' }"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  alt=""
                  @load="onAvatarLoad(commit.avatarUrl)"
                  @error="onAvatarError(commit.avatarUrl)"
                />
              </span>
              <span class="HomeSideGit-LogAuthor">{{ commit.author }}</span>
              <span>·</span>
              <span>{{ commit.relativeDate }}</span>
            </div>
          </li>
        </ol>
      </div>
    </template>

    <!-- Branch context menu (Right-click to preview / switch / edit / delete / copy) -->
    <TxContextMenu
      ref="branchMenuRef"
      v-model="branchMenuOpen"
      trigger="manual"
      :width="236"
      :panel-card="SHELL_MENU_CARD"
      :activation-feedback="false"
    >
      <template #menu>
        <TxContextMenuItem
          :disabled="!branchMenuTarget"
          @select="selectBranchMenuAction('preview')"
        >
          {{ t('home.git.previewBranch') }}
          <template #right>
            <span class="HomeSideGit-CtxIcon i-ri-eye-line" aria-hidden="true" />
          </template>
        </TxContextMenuItem>
        <TxContextMenuItem
          :disabled="!branchMenuTarget || branchMenuTarget.current || mutating"
          @select="selectBranchMenuAction('switch')"
        >
          {{ t('home.git.switchToBranch') }}
          <template #right>
            <span class="HomeSideGit-CtxIcon i-ri-git-branch-line" aria-hidden="true" />
          </template>
        </TxContextMenuItem>
        <TxContextMenuItem
          v-if="branchMenuTarget && !branchMenuTarget.isRemote"
          data-testid="git-ctx-edit-branch"
          @select="selectBranchMenuAction('edit')"
        >
          {{ t('home.git.editBranch') }}
          <template #right>
            <span class="HomeSideGit-CtxIcon i-ri-edit-line" aria-hidden="true" />
          </template>
        </TxContextMenuItem>
        <TxContextMenuItem
          v-if="branchMenuTarget?.isRemote && remoteForBranch(branchMenuTarget)"
          @select="selectBranchMenuAction('view-remote')"
        >
          {{ t('home.git.viewParentRemote', { name: remoteForBranch(branchMenuTarget)!.name }) }}
          <template #right>
            <span class="HomeSideGit-CtxIcon i-ri-settings-3-line" aria-hidden="true" />
          </template>
        </TxContextMenuItem>
        <TxContextMenuDivider />
        <TxContextMenuItem
          :disabled="!branchMenuTarget"
          @select="selectBranchMenuAction('copy-name')"
        >
          {{ t('home.git.copyBranchName') }}
          <template #right>
            <span class="HomeSideGit-CtxIcon i-ri-file-copy-line" aria-hidden="true" />
          </template>
        </TxContextMenuItem>
        <TxContextMenuItem
          v-if="branchMenuTarget?.shortOid"
          @select="selectBranchMenuAction('copy-hash')"
        >
          {{ t('home.git.copyLatestHash') }}
          <template #right>
            <span class="HomeSideGit-CtxIcon i-ri-hashtag" aria-hidden="true" />
          </template>
        </TxContextMenuItem>
        <template v-if="branchMenuTarget && !branchMenuTarget.isRemote">
          <TxContextMenuDivider />
          <TxContextMenuItem
            danger
            :disabled="branchMenuTarget.current || mutating"
            data-testid="git-ctx-delete-branch"
            @select="selectBranchMenuAction('delete')"
          >
            {{ t('home.git.deleteBranch') }}
            <template #right>
              <span class="HomeSideGit-CtxIcon i-ri-delete-bin-6-line" aria-hidden="true" />
            </template>
          </TxContextMenuItem>
        </template>
      </template>
    </TxContextMenu>

    <!-- Remote context menu (Right-click on remote root like origin / workmac) -->
    <TxContextMenu
      ref="remoteMenuRef"
      v-model="remoteMenuOpen"
      trigger="manual"
      :width="236"
      :panel-card="SHELL_MENU_CARD"
      :activation-feedback="false"
    >
      <template #menu>
        <TxContextMenuItem
          :disabled="!remoteMenuTarget"
          data-testid="git-ctx-edit-remote"
          @select="selectRemoteMenuAction('edit')"
        >
          {{ t('home.git.editRemote') }}
          <template #right>
            <span class="HomeSideGit-CtxIcon i-ri-settings-3-line" aria-hidden="true" />
          </template>
        </TxContextMenuItem>
        <TxContextMenuItem
          :disabled="!remoteMenuTarget || mutating"
          data-testid="git-ctx-fetch-remote"
          @select="selectRemoteMenuAction('fetch')"
        >
          {{ t('home.git.fetchRemote') }}
          <template #right>
            <span class="HomeSideGit-CtxIcon i-ri-download-cloud-2-line" aria-hidden="true" />
          </template>
        </TxContextMenuItem>
        <TxContextMenuDivider />
        <TxContextMenuItem
          :disabled="!remoteMenuTarget?.fetchUrl"
          @select="selectRemoteMenuAction('copy-url')"
        >
          {{ t('home.git.copyRemoteUrl') }}
          <template #right>
            <span class="HomeSideGit-CtxIcon i-ri-file-copy-line" aria-hidden="true" />
          </template>
        </TxContextMenuItem>
        <TxContextMenuItem
          v-if="remoteMenuTarget?.webUrl"
          @select="selectRemoteMenuAction('open-web')"
        >
          {{ t('home.git.openRemoteWeb') }}
          <template #right>
            <span class="HomeSideGit-CtxIcon i-ri-external-link-line" aria-hidden="true" />
          </template>
        </TxContextMenuItem>
        <TxContextMenuDivider />
        <TxContextMenuItem
          danger
          :disabled="!remoteMenuTarget || mutating"
          data-testid="git-ctx-remove-remote"
          @select="selectRemoteMenuAction('remove')"
        >
          {{ t('home.git.removeRemote') }}
          <template #right>
            <span class="HomeSideGit-CtxIcon i-ri-delete-bin-6-line" aria-hidden="true" />
          </template>
        </TxContextMenuItem>
      </template>
    </TxContextMenu>
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
  border: 1px solid color-mix(in srgb, var(--shell-primary) 24%, var(--shell-border));
  border-radius: var(--shell-radius-sm);
  background: color-mix(in srgb, var(--shell-primary) 6%, var(--shell-bg));
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  font-weight: 500;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--shell-primary) 42%, var(--shell-border));
    background: color-mix(in srgb, var(--shell-primary) 11%, var(--shell-bg));
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
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.HomeSideGit-Ahead {
  padding: 0 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-success) 14%, transparent);
  color: var(--tx-color-success);
}

.HomeSideGit-Behind {
  padding: 0 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-warning) 16%, transparent);
  color: var(--tx-color-warning);
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

  &.is-highlighted-ahead {
    color: var(--tx-color-success);
  }

  &.is-highlighted-behind {
    color: var(--tx-color-warning);
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
  border: 1px solid transparent;
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
    border-color: color-mix(in srgb, var(--shell-primary) 24%, transparent);
    background: color-mix(in srgb, var(--shell-primary) 9%, var(--shell-surface));
    color: var(--shell-primary);
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

  .HomeSideGit-SubTab.is-active & {
    background: color-mix(in srgb, var(--shell-primary) 16%, transparent);
    color: var(--shell-primary);
  }
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
  flex: 1 1 50%;
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
.HomeSideGit-SecondaryBtn,
.HomeSideGit-PreviewSwitchBtn {
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

.HomeSideGit-PreviewSwitchBtn {
  height: 24px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--shell-primary) 40%, transparent);
  background: color-mix(in srgb, var(--shell-primary) 12%, var(--shell-bg));
  color: var(--shell-primary);
  font-size: var(--shell-fs-caption);

  &:hover:not(:disabled) {
    background: var(--shell-primary);
    color: var(--shell-on-primary, var(--tx-color-white));
  }
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

  &.is-staged {
    color: var(--tx-color-success);
  }

  &.is-local .HomeSideGit-GroupIcon {
    color: var(--shell-primary);
  }

  &.is-remote .HomeSideGit-GroupIcon {
    color: var(--tx-color-info);
  }
}

.HomeSideGit-GroupIcon {
  font-size: 13px;
}

.HomeSideGit-GroupCount {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--shell-surface);
  color: var(--shell-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;

  &.is-local {
    background: color-mix(in srgb, var(--shell-primary) 12%, transparent);
    color: var(--shell-primary);
  }

  &.is-remote {
    background: color-mix(in srgb, var(--tx-color-info) 14%, transparent);
    color: var(--tx-color-info);
  }
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
.HomeSideGit-BranchTree,
.HomeSideGit-LogList,
.HomeSideGit-PreviewCommits {
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
    background: color-mix(in srgb, var(--shell-primary) 8%, var(--shell-surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shell-primary) 34%, transparent);
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

/* Diff & Branch preview drawers */
.HomeSideGit-DiffPane,
.HomeSideGit-BranchPreview {
  display: flex;
  flex: 1 1 50%;
  flex-direction: column;
  min-height: 168px;
  max-height: 58%;
  border-top: 1px solid color-mix(in srgb, var(--shell-primary) 18%, var(--shell-border));
  background: var(--shell-bg);
  box-shadow: var(--tx-elevation-1);
  overflow: hidden;
}

.HomeSideGit-DiffHeader,
.HomeSideGit-PreviewHeader {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-surface);
}

.HomeSideGit-DiffMeta,
.HomeSideGit-PreviewTitleWrap {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.HomeSideGit-DiffScope,
.HomeSideGit-PreviewScope,
.HomeSideGit-PreviewCurrent {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
}

.HomeSideGit-DiffScope {
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);

  &.is-staged {
    background: color-mix(in srgb, var(--tx-color-success) 14%, transparent);
    color: var(--tx-color-success);
  }
}

.HomeSideGit-PreviewScope {
  &.is-local {
    background: color-mix(in srgb, var(--shell-primary) 12%, transparent);
    color: var(--shell-primary);
  }

  &.is-remote {
    background: color-mix(in srgb, var(--tx-color-info) 14%, transparent);
    color: var(--tx-color-info);
  }
}

.HomeSideGit-PreviewCurrent {
  background: color-mix(in srgb, var(--tx-color-success) 14%, transparent);
  color: var(--tx-color-success);
}

.HomeSideGit-DiffPath,
.HomeSideGit-PreviewName {
  overflow: hidden;
  color: var(--shell-text-primary);
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideGit-DiffHeaderRight,
.HomeSideGit-PreviewActions {
  display: flex;
  flex: none;
  gap: 4px;
  align-items: center;
}

.HomeSideGit-DiffContentWrap,
.HomeSideGit-PreviewBody {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
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

/* Merged single search / create branch bar */
.HomeSideGit-BranchCombo {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
}

.HomeSideGit-ComboInputWrap {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  height: 30px;
  padding: 0 6px 0 8px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface);

  &:focus-within {
    border-color: var(--shell-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--shell-primary) 14%, transparent);
  }
}

.HomeSideGit-ComboIcon {
  flex: none;
  margin-right: 6px;
  color: var(--shell-text-muted);
  font-size: 13px;
}

.HomeSideGit-ComboInput {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  outline: none;

  &::placeholder {
    color: var(--shell-text-muted);
  }
}

.HomeSideGit-ComboClear {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

/* Slash-split branch tree */
.HomeSideGit-TreeFolder {
  position: relative;
  display: flex;
  gap: 5px;
  align-items: center;
  width: 100%;
  height: 28px;
  padding: 0 8px 0 calc(6px + var(--git-tree-depth, 0) * 14px);
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  font-weight: 500;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface);
    color: var(--shell-text-primary);
  }

  &.has-current .HomeSideGit-FolderLabel {
    color: var(--shell-text-primary);
  }
}

.HomeSideGit-TreeChevron {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 14px;
  transition: transform 160ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));

  &.is-expanded {
    transform: rotate(90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.HomeSideGit-FolderIcon {
  flex: none;
  font-size: 14px;
  color: color-mix(in srgb, var(--tx-color-warning) 82%, var(--shell-text-secondary));

  .HomeSideGit-TreeFolder.is-tone-current & {
    color: var(--shell-primary);
  }

  .HomeSideGit-TreeFolder.is-tone-feat & {
    color: var(--tx-color-success);
  }

  .HomeSideGit-TreeFolder.is-tone-fix & {
    color: var(--tx-color-danger);
  }

  .HomeSideGit-TreeFolder.is-tone-release & {
    color: var(--tx-color-warning);
  }

  .HomeSideGit-TreeFolder.is-remote-node & {
    color: color-mix(in srgb, var(--tx-color-info) 85%, var(--shell-text-secondary));
  }

  .HomeSideGit-TreeFolder.is-remote-node.is-tone-feat & {
    color: var(--tx-color-success);
  }

  .HomeSideGit-TreeFolder.is-remote-node.is-tone-fix & {
    color: var(--tx-color-danger);
  }
}

.HomeSideGit-FolderLabel {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideGit-FolderCount {
  flex: none;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--shell-surface);
  color: var(--shell-text-muted);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.HomeSideGit-BranchRow {
  position: relative;
  display: flex;
  gap: 7px;
  align-items: center;
  width: 100%;
  padding: 5px 8px 5px calc(10px + var(--git-tree-depth, 0) * 14px);
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface);
  }

  &.is-current {
    background: color-mix(in srgb, var(--shell-primary) 9%, var(--shell-surface));
    font-weight: 500;
  }

  &.is-previewed {
    background: color-mix(in srgb, var(--shell-primary) 10%, var(--shell-surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shell-primary) 36%, transparent);
  }
}

.HomeSideGit-BranchRowIcon {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 14px;

  .HomeSideGit-BranchRow.is-tone-current & {
    color: var(--shell-primary);
  }

  .HomeSideGit-BranchRow.is-tone-main & {
    color: var(--shell-primary);
  }

  .HomeSideGit-BranchRow.is-tone-feat & {
    color: var(--tx-color-success);
  }

  .HomeSideGit-BranchRow.is-tone-fix & {
    color: var(--tx-color-danger);
  }

  .HomeSideGit-BranchRow.is-tone-release & {
    color: var(--tx-color-warning);
  }

  .HomeSideGit-BranchRow.is-tone-chore & {
    color: var(--tx-color-info);
  }

  .HomeSideGit-BranchRow.is-remote-node.is-tone-default & {
    color: color-mix(in srgb, var(--tx-color-info) 80%, var(--shell-text-muted));
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

  .HomeSideGit-BranchRow.is-current & {
    color: var(--shell-primary);
  }
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

  &.is-current {
    border-color: color-mix(in srgb, var(--shell-primary) 30%, var(--shell-border));
    background: color-mix(in srgb, var(--shell-primary) 8%, var(--shell-bg));
    color: var(--shell-primary);
  }

  &.is-copyable {
    cursor: pointer;

    &:hover {
      border-color: var(--shell-primary);
      color: var(--shell-primary);
    }
  }
}

.HomeSideGit-PreviewMeta {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--shell-border) 65%, transparent);
  color: var(--shell-text-muted);
  font-size: 11px;
}

.HomeSideGit-PreviewMetaItem {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideGit-PreviewCommits {
  flex: 1 1 auto;
  min-height: 0;
  padding: 4px 6px 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.HomeSideGit-PreviewCommitItem {
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 5px 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--shell-border) 45%, transparent);

  &:last-child {
    border-bottom: none;
  }
}

.HomeSideGit-PreviewCommitMain {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.HomeSideGit-PreviewCommitSubject {
  overflow: hidden;
  color: var(--shell-text-primary);
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideGit-PreviewCommitMeta {
  overflow: hidden;
  color: var(--shell-text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Commit History & Standard-Protocol Author Avatar */
.HomeSideGit-LogItem {
  display: flex;
  flex-direction: column;
  gap: 5px;
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
  align-items: center;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.HomeSideGit-LogAuthor {
  color: var(--shell-text-secondary);
  font-weight: 500;
}

.HomeSideGit-Avatar {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  overflow: hidden;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  user-select: none;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 22%, transparent);

  &.is-sm {
    width: 18px;
    height: 18px;
    font-size: 9.5px;
  }

  &.is-tone-primary {
    background: color-mix(in srgb, var(--tx-color-primary) 15%, var(--shell-surface));
    color: var(--tx-color-primary);
  }

  &.is-tone-success {
    background: color-mix(in srgb, var(--tx-color-success) 15%, var(--shell-surface));
    color: var(--tx-color-success);
  }

  &.is-tone-warning {
    background: color-mix(in srgb, var(--tx-color-warning) 16%, var(--shell-surface));
    color: var(--tx-color-warning);
  }

  &.is-tone-danger {
    background: color-mix(in srgb, var(--tx-color-danger) 15%, var(--shell-surface));
    color: var(--tx-color-danger);
  }

  &.is-tone-info {
    background: color-mix(in srgb, var(--tx-color-info) 16%, var(--shell-surface));
    color: var(--tx-color-info);
  }
}

.HomeSideGit-AvatarInitials {
  position: relative;
  z-index: 0;
}

.HomeSideGit-AvatarImg {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 180ms ease;

  &.is-loaded {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.HomeSideGit-CtxIcon {
  font-size: 14px;
  color: var(--shell-text-secondary);
  opacity: 0.78;
}

.HomeSideGit-ConfirmCheck {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  cursor: pointer;
}

.HomeSideGit-RemoteRootRow {
  display: flex;
  gap: 2px;
  align-items: center;
  border-radius: var(--shell-radius-sm);

  .HomeSideGit-TreeFolder {
    flex: 1 1 auto;
    min-width: 0;
    width: auto;
    padding-right: 4px;
  }

  &:hover {
    background: var(--shell-surface);
  }

  &.is-editing {
    background: color-mix(in srgb, var(--shell-primary) 10%, var(--shell-surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shell-primary) 34%, transparent);
  }
}

.HomeSideGit-RemoteMoreBtn {
  margin-right: 4px;
  opacity: 0.65;

  .HomeSideGit-RemoteRootRow:hover &,
  &:focus-visible {
    opacity: 1;
  }
}

.HomeSideGit-TreeFolder.is-editing {
  background: color-mix(in srgb, var(--shell-primary) 10%, var(--shell-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shell-primary) 34%, transparent);
}

.HomeSideGit-RemoteBadge {
  display: inline-flex;
  flex: 0 1 auto;
  gap: 4px;
  align-items: center;
  max-width: 150px;
  height: 18px;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--shell-border) 85%, transparent);
  border-radius: 999px;
  background: var(--shell-surface);
  color: var(--shell-text-secondary);
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1;

  &.is-clickable {
    cursor: pointer;

    &:hover {
      border-color: var(--shell-primary);
      color: var(--shell-primary);
    }
  }

  &.is-github {
    border-color: color-mix(in srgb, var(--shell-text-primary) 18%, var(--shell-border));
    background: color-mix(in srgb, var(--shell-text-primary) 6%, var(--shell-bg));
    color: var(--shell-text-primary);
  }

  &.is-gitlab {
    border-color: color-mix(in srgb, var(--tx-color-warning) 35%, transparent);
    background: color-mix(in srgb, var(--tx-color-warning) 10%, var(--shell-bg));
    color: var(--tx-color-warning);
  }

  &.is-gitee {
    border-color: color-mix(in srgb, var(--tx-color-danger) 30%, transparent);
    background: color-mix(in srgb, var(--tx-color-danger) 10%, var(--shell-bg));
    color: var(--tx-color-danger);
  }

  &.is-bitbucket,
  &.is-codeberg {
    border-color: color-mix(in srgb, var(--shell-primary) 30%, transparent);
    background: color-mix(in srgb, var(--shell-primary) 10%, var(--shell-bg));
    color: var(--shell-primary);
  }

  &.is-custom {
    border-color: color-mix(in srgb, var(--tx-color-info) 30%, transparent);
    background: color-mix(in srgb, var(--tx-color-info) 10%, var(--shell-bg));
    color: var(--tx-color-info);
  }

  &.is-local {
    border-color: color-mix(in srgb, var(--tx-color-success) 30%, transparent);
    background: color-mix(in srgb, var(--tx-color-success) 10%, var(--shell-bg));
    color: var(--tx-color-success);
  }
}

.HomeSideGit-RemoteBadgeText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideGit-EditorForm {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding: 10px 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.HomeSideGit-Field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.HomeSideGit-FieldLabel {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
}

.HomeSideGit-EditorInput,
.HomeSideGit-EditorSelect {
  width: 100%;
  height: 30px;
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
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--shell-primary) 14%, transparent);
  }

  &.is-mono {
    font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
    font-size: 12px;
  }
}

.HomeSideGit-FieldHint {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: 11px;
  line-height: 1.4;
}

.HomeSideGit-EditorFooter {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
}

.HomeSideGit-EditorFooterLeft {
  display: flex;
  gap: 6px;
  align-items: center;
}

.HomeSideGit-DangerBtn {
  display: inline-flex;
  flex: none;
  gap: 4px;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--shell-danger) 35%, transparent);
  border-radius: var(--shell-radius-sm);
  background: color-mix(in srgb, var(--shell-danger) 10%, var(--shell-bg));
  color: var(--shell-danger);
  font: inherit;
  font-size: var(--shell-fs-sm);
  font-weight: 500;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--shell-danger);
    background: var(--shell-danger);
    color: var(--tx-color-white);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
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

/* Smooth drawer & bar transitions */
.git-drawer-enter-active {
  transition:
    opacity 220ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 240ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1)),
    max-height 240ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1)),
    min-height 240ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1)),
    flex-basis 240ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
}

.git-drawer-leave-active {
  transition:
    opacity 160ms ease-in,
    transform 180ms ease-in,
    max-height 180ms ease-in,
    min-height 180ms ease-in,
    flex-basis 180ms ease-in;
}

.git-drawer-enter-from,
.git-drawer-leave-to {
  opacity: 0;
  transform: translateY(14px);
  flex-grow: 0;
  flex-basis: 0;
  max-height: 0;
  min-height: 0;
}

.git-slide-down-enter-active {
  transition:
    opacity 180ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 200ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
}

.git-slide-down-leave-active {
  transition:
    opacity 140ms ease-in,
    transform 150ms ease-in;
}

.git-slide-down-enter-from,
.git-slide-down-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.git-fade-enter-active,
.git-fade-leave-active {
  transition: opacity 140ms ease;
}

.git-fade-enter-from,
.git-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .git-drawer-enter-active,
  .git-drawer-leave-active,
  .git-slide-down-enter-active,
  .git-slide-down-leave-active,
  .git-fade-enter-active,
  .git-fade-leave-active {
    transition: none;
  }
}

@keyframes git-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
