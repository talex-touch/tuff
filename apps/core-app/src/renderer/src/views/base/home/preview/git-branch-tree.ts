import type { WorkspaceGitBranchEntry } from '@talex-touch/utils/transport/sdk/domains/workspace-git'

export type BranchSemanticTone =
  | 'current'
  | 'main'
  | 'feat'
  | 'fix'
  | 'release'
  | 'chore'
  | 'default'

export type AuthorAvatarTone = 'primary' | 'success' | 'warning' | 'danger' | 'info'

export interface GitBranchFolderNode {
  kind: 'folder'
  id: string
  label: string
  fullPath: string
  depth: number
  branchCount: number
  hasCurrent: boolean
  tone: BranchSemanticTone
  children: GitBranchTreeNode[]
}

export interface GitBranchLeafNode {
  kind: 'branch'
  id: string
  label: string
  fullName: string
  depth: number
  branch: WorkspaceGitBranchEntry
  tone: BranchSemanticTone
}

export type GitBranchTreeNode = GitBranchFolderNode | GitBranchLeafNode

export type GitBranchVisibleRow =
  | {
      kind: 'folder'
      id: string
      label: string
      fullPath: string
      depth: number
      branchCount: number
      hasCurrent: boolean
      tone: BranchSemanticTone
      expanded: boolean
    }
  | GitBranchLeafNode

const MAIN_BRANCH_NAMES = new Set(['main', 'master', 'stage', 'staging', 'develop', 'dev'])
const FEAT_SEGMENTS = new Set(['feat', 'feature', 'features'])
const FIX_SEGMENTS = new Set(['fix', 'hotfix', 'bugfix', 'patch'])
const RELEASE_SEGMENTS = new Set(['release', 'releases', 'rel'])
const CHORE_SEGMENTS = new Set(['dependabot', 'chore', 'docs', 'ci', 'build', 'refactor', 'test'])

export function classifyPathTone(pathText: string, isRemote = false): BranchSemanticTone {
  const rawSegments = pathText
    .toLowerCase()
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
  const segments = isRemote && rawSegments.length > 1 ? rawSegments.slice(1) : rawSegments
  const leaf = segments[segments.length - 1] ?? ''

  if (MAIN_BRANCH_NAMES.has(leaf)) return 'main'
  for (const seg of segments) {
    if (FEAT_SEGMENTS.has(seg)) return 'feat'
    if (FIX_SEGMENTS.has(seg)) return 'fix'
    if (RELEASE_SEGMENTS.has(seg)) return 'release'
    if (CHORE_SEGMENTS.has(seg)) return 'chore'
  }
  return 'default'
}

export function classifyBranchTone(branch: WorkspaceGitBranchEntry): BranchSemanticTone {
  if (branch.current) return 'current'
  return classifyPathTone(branch.name, branch.isRemote)
}

interface MutableFolder {
  id: string
  label: string
  fullPath: string
  folders: Map<string, MutableFolder>
  leaves: WorkspaceGitBranchEntry[]
  hasCurrent: boolean
  branchCount: number
}

function createMutableFolder(scope: string, label: string, fullPath: string): MutableFolder {
  return {
    id: `${scope}:${fullPath}`,
    label,
    fullPath,
    folders: new Map(),
    leaves: [],
    hasCurrent: false,
    branchCount: 0
  }
}

function finalizeFolder(
  folder: MutableFolder,
  scope: 'local' | 'remote',
  depth: number,
  currentUpstream?: string
): GitBranchFolderNode {
  let target = folder
  let label = folder.label
  let fullPath = folder.fullPath

  // Compact single-child folder chains (e.g. cargo/packages/tuff-native) so narrow sidebars stay readable.
  // Keep depth-0 remote root (e.g. `origin`) distinct so remote grouping stays clear.
  const canCompact = !(scope === 'remote' && depth === 0)
  while (canCompact && target.leaves.length === 0 && target.folders.size === 1) {
    const onlyChild = target.folders.values().next().value
    if (!onlyChild) break
    target = onlyChild
    label = `${label}/${onlyChild.label}`
    fullPath = onlyChild.fullPath
  }

  const children: GitBranchTreeNode[] = []

  const sortedFolders = Array.from(target.folders.values()).sort((a, b) => {
    if (a.hasCurrent !== b.hasCurrent) return a.hasCurrent ? -1 : 1
    return a.label.localeCompare(b.label)
  })
  for (const sub of sortedFolders) {
    children.push(finalizeFolder(sub, scope, depth + 1, currentUpstream))
  }

  for (const branch of target.leaves) {
    const segments = branch.name.split('/').filter(Boolean)
    const leafLabel = segments[segments.length - 1] ?? branch.name
    children.push({
      kind: 'branch',
      id: `${scope}:branch:${branch.name}`,
      label: leafLabel,
      fullName: branch.name,
      depth: depth + 1,
      branch,
      tone: classifyBranchTone(branch)
    })
  }

  return {
    kind: 'folder',
    id: `${scope}:folder:${fullPath}`,
    label,
    fullPath,
    depth,
    branchCount: target.branchCount,
    hasCurrent: target.hasCurrent,
    tone: target.hasCurrent ? 'current' : classifyPathTone(fullPath, scope === 'remote'),
    children
  }
}

export function buildBranchTree(
  branches: WorkspaceGitBranchEntry[],
  scope: 'local' | 'remote',
  currentUpstream?: string,
  extraRemoteNames: string[] = []
): GitBranchTreeNode[] {
  const rootFolders = new Map<string, MutableFolder>()
  const rootLeaves: WorkspaceGitBranchEntry[] = []

  if (scope === 'remote') {
    for (const remoteName of extraRemoteNames) {
      const clean = remoteName.trim()
      if (clean && !rootFolders.has(clean)) {
        rootFolders.set(clean, createMutableFolder(scope, clean, clean))
      }
    }
  }

  for (const branch of branches) {
    const segments = branch.name.split('/').filter(Boolean)
    const matchesCurrent =
      branch.current ||
      (scope === 'remote' && Boolean(currentUpstream && branch.name === currentUpstream))

    if (segments.length <= 1) {
      rootLeaves.push(branch)
      continue
    }

    let currentMap = rootFolders
    let pathAcc = ''
    let parentFolder: MutableFolder | null = null

    for (let i = 0; i < segments.length - 1; i += 1) {
      const seg = segments[i]!
      pathAcc = pathAcc ? `${pathAcc}/${seg}` : seg
      let folder = currentMap.get(seg)
      if (!folder) {
        folder = createMutableFolder(scope, seg, pathAcc)
        currentMap.set(seg, folder)
      }
      folder.branchCount += 1
      if (matchesCurrent) folder.hasCurrent = true
      parentFolder = folder
      currentMap = folder.folders
    }

    parentFolder?.leaves.push(branch)
  }

  const nodes: GitBranchTreeNode[] = []

  // Keep active root branch (e.g. `master`) at the very top when it is a root leaf.
  const activeRootLeaves = rootLeaves.filter((b) => b.current)
  const otherRootLeaves = rootLeaves.filter((b) => !b.current)

  for (const branch of activeRootLeaves) {
    nodes.push({
      kind: 'branch',
      id: `${scope}:branch:${branch.name}`,
      label: branch.name,
      fullName: branch.name,
      depth: 0,
      branch,
      tone: classifyBranchTone(branch)
    })
  }

  const sortedRootFolders = Array.from(rootFolders.values()).sort((a, b) => {
    if (a.hasCurrent !== b.hasCurrent) return a.hasCurrent ? -1 : 1
    if (scope === 'remote') {
      if (a.label === 'origin' && b.label !== 'origin') return -1
      if (b.label === 'origin' && a.label !== 'origin') return 1
    }
    return a.label.localeCompare(b.label)
  })
  for (const folder of sortedRootFolders) {
    nodes.push(finalizeFolder(folder, scope, 0, currentUpstream))
  }

  for (const branch of otherRootLeaves) {
    nodes.push({
      kind: 'branch',
      id: `${scope}:branch:${branch.name}`,
      label: branch.name,
      fullName: branch.name,
      depth: 0,
      branch,
      tone: classifyBranchTone(branch)
    })
  }

  return nodes
}

export function collectDefaultExpandedFolders(
  nodes: GitBranchTreeNode[],
  scope: 'local' | 'remote'
): string[] {
  const expanded: string[] = []
  const visit = (items: GitBranchTreeNode[]) => {
    for (const item of items) {
      if (item.kind !== 'folder') continue
      const expandThis =
        scope === 'local'
          ? item.hasCurrent || item.depth === 0 || item.branchCount <= 6
          : item.depth === 0 || item.hasCurrent
      if (expandThis) {
        expanded.push(item.id)
      }
      visit(item.children)
    }
  }
  visit(nodes)
  return expanded
}

export function flattenBranchTree(
  nodes: GitBranchTreeNode[],
  expandedIds: ReadonlySet<string>,
  forceExpandAll = false
): GitBranchVisibleRow[] {
  const rows: GitBranchVisibleRow[] = []
  const visit = (items: GitBranchTreeNode[]) => {
    for (const item of items) {
      if (item.kind === 'folder') {
        const expanded = forceExpandAll || expandedIds.has(item.id)
        rows.push({
          kind: 'folder',
          id: item.id,
          label: item.label,
          fullPath: item.fullPath,
          depth: item.depth,
          branchCount: item.branchCount,
          hasCurrent: item.hasCurrent,
          tone: item.tone,
          expanded
        })
        if (expanded) {
          visit(item.children)
        }
      } else {
        rows.push(item)
      }
    }
  }
  visit(nodes)
  return rows
}

const AVATAR_TONES: AuthorAvatarTone[] = ['primary', 'success', 'warning', 'danger', 'info']

export function resolveAuthorAvatarTone(seed: string): AuthorAvatarTone {
  const text = seed.trim().toLowerCase()
  if (!text) return 'primary'
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length]!
}

export function resolveAuthorInitials(author: string): string {
  const trimmed = author.trim()
  if (!trimmed) return '?'
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase()
  }
  const camelCaps = trimmed.match(/[A-Z]/g)
  if (camelCaps && camelCaps.length >= 2) {
    return `${camelCaps[0]}${camelCaps[1]}`
  }
  return Array.from(trimmed)[0]?.toUpperCase() ?? '?'
}
