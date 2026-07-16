import type { IndexedSourceOpenResult } from '@talex-touch/utils/search'
import { access } from 'node:fs/promises'
import { shell } from 'electron'

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function openIndexedSourcePath(
  filePath: string | undefined
): Promise<IndexedSourceOpenResult> {
  if (!filePath) {
    return {
      status: 'blocked',
      reason: 'indexed-source-path-missing'
    }
  }

  try {
    await access(filePath)
    const openError = await shell.openPath(filePath)
    if (openError) {
      return {
        status: 'failed',
        reason: openError
      }
    }
    return { status: 'started' }
  } catch (error) {
    return {
      status: 'failed',
      reason: toErrorMessage(error)
    }
  }
}
