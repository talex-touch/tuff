import { defineEvent } from '@talex-touch/utils/transport/event/builder'
import type { SystemPermissionStatus } from './system-permission-refresh'

export type FileAccessRootPurpose = 'file-index' | 'app-index'

export interface FileAccessRootCheckResult {
  id: string
  label: string
  path: string
  required: boolean
  purpose: FileAccessRootPurpose
  status: SystemPermissionStatus
  canRequest: boolean
  message?: string
}

export const systemPermissionFileAccessRoots = defineEvent('system')
  .module('permission')
  .event('file-access-roots')
  .define<void, FileAccessRootCheckResult[]>()

export const systemPermissionRequestFileAccessRoots = defineEvent('system')
  .module('permission')
  .event('request-file-access-roots')
  .define<void, FileAccessRootCheckResult[]>()

export function summarizeRequiredFileAccessStatus(
  roots: readonly FileAccessRootCheckResult[]
): SystemPermissionStatus {
  const requiredRoots = roots.filter((root) => root.required)
  if (requiredRoots.length === 0) return 'granted'
  if (requiredRoots.every((root) => root.status === 'granted')) return 'granted'
  if (requiredRoots.some((root) => root.status === 'denied')) return 'denied'
  if (requiredRoots.some((root) => root.status === 'notDetermined')) return 'notDetermined'
  if (requiredRoots.some((root) => root.status === 'unverifiable')) return 'unverifiable'
  return 'notDetermined'
}

export function createRequiredFileAccessRootKey(
  roots: readonly FileAccessRootCheckResult[]
): string {
  return roots
    .filter((root) => root.required)
    .map((root) => root.path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase())
    .sort()
    .join('\n')
}

export function resolveRequiredFileAccessStatus(
  roots: readonly FileAccessRootCheckResult[],
  storedGrant: boolean,
  storedRootKey: string
): SystemPermissionStatus {
  const status = summarizeRequiredFileAccessStatus(roots)
  if (
    (status === 'notDetermined' || status === 'unverifiable') &&
    storedGrant &&
    storedRootKey === createRequiredFileAccessRootKey(roots)
  ) {
    return 'granted'
  }
  return status
}
