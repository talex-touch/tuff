import { mkdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getLocalAiCliSessionForConversation } from './session-store'

let workspaceRoot: string | null = null
let temporaryBase: string | null = null

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

export function setTemporarySpaceBase(base: string | null): void {
  if (base !== null && (!path.isAbsolute(base) || base.includes('\0'))) {
    throw new Error('WORKSPACE_INVALID')
  }
  temporaryBase = base
}

// A pinned native session keeps its root, but only the legacy or temporary root is accepted.
export async function resolveConversationWorkspaceRoot(conversationId: string): Promise<string> {
  const spaces = path.join(
    temporaryBase ?? (process.platform === 'win32' ? tmpdir() : '/tmp'),
    'tuff-spaces'
  )
  await mkdir(spaces, { recursive: true })
  const temporary = path.join(await realpath(spaces), conversationId)
  const pinned = await getLocalAiCliSessionForConversation(conversationId)
  if (!pinned) {
    await mkdir(temporary, { recursive: true })
    return temporary
  }
  const legacy = workspaceRoot ? await realpath(workspaceRoot).catch(() => null) : null
  if (pinned.projectRoot !== temporary && pinned.projectRoot !== legacy) {
    throw new Error('NATIVE_SESSION_CONFLICT')
  }
  if (pinned.projectRoot === temporary) await mkdir(temporary, { recursive: true })
  return pinned.projectRoot
}
