import path from 'node:path'

let workspaceRoot: string | null = null

export function setLocalAiCliWorkspaceRoot(root: string | null): void {
  if (root !== null && (!path.isAbsolute(root) || root.includes('\0'))) {
    throw new Error('WORKSPACE_INVALID')
  }
  workspaceRoot = root
}

export function getLocalAiCliWorkspaceRoot(): string {
  if (!workspaceRoot) throw new Error('WORKSPACE_INVALID')
  return workspaceRoot
}
