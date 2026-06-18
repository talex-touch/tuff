import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { clipboard } from 'electron'

const FILE_BASE64_MAX_BYTES = 1024 * 1024

interface QuickOpsFileActionLogger {
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export const QUICK_OPS_FILE_HASH_ACTION_ID = 'quick-ops-copy-file-hash'
export const QUICK_OPS_FILE_BASE64_ACTION_ID = 'quick-ops-copy-file-base64'

export function isQuickOpsFileExecuteAction(actionId?: string): boolean {
  return actionId === QUICK_OPS_FILE_HASH_ACTION_ID || actionId === QUICK_OPS_FILE_BASE64_ACTION_ID
}

export async function executeQuickOpsFileAction(
  actionId: string | undefined,
  filePath: string,
  logger?: QuickOpsFileActionLogger
): Promise<boolean> {
  if (actionId === QUICK_OPS_FILE_HASH_ACTION_ID) {
    await copyFileHash(filePath)
    return true
  }

  if (actionId === QUICK_OPS_FILE_BASE64_ACTION_ID) {
    const result = await readFileBase64(filePath)
    if ('error' in result) {
      logger?.warn?.('QuickOps file Base64 action degraded', {
        path: filePath,
        reason: result.error
      })
      return true
    }

    clipboard.writeText(formatFileBase64(result))
    return true
  }

  return false
}

async function copyFileHash(filePath: string): Promise<void> {
  const content = await readFile(filePath)
  clipboard.writeText(
    [
      `File: ${path.basename(filePath)}`,
      `Path: ${filePath}`,
      `Size: ${content.length} bytes`,
      `MD5: ${createHash('md5').update(content).digest('hex')}`,
      `SHA1: ${createHash('sha1').update(content).digest('hex')}`,
      `SHA256: ${createHash('sha256').update(content).digest('hex')}`
    ].join('\n')
  )
}

async function readFileBase64(
  filePath: string
): Promise<{ path: string; fileName: string; size: number; base64: string } | { error: string }> {
  const info = await stat(filePath)
  if (!info.isFile()) return { error: 'not-file' }
  if (info.size > FILE_BASE64_MAX_BYTES) return { error: 'file-too-large' }

  const content = await readFile(filePath)
  return {
    path: filePath,
    fileName: path.basename(filePath),
    size: content.length,
    base64: content.toString('base64')
  }
}

function formatFileBase64(info: {
  path: string
  fileName: string
  size: number
  base64: string
}): string {
  return [
    `File: ${info.fileName}`,
    `Path: ${info.path}`,
    `Size: ${info.size} bytes`,
    'Base64:',
    info.base64
  ].join('\n')
}
