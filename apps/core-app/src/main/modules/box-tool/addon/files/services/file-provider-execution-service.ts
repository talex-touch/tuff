import type { IExecuteArgs } from '@talex-touch/utils'
import type { ModuleLogger } from '@talex-touch/utils/common/logger'
import fs from 'node:fs/promises'
import { shell } from 'electron'
import {
  recordAcceptedExecute,
  resolveExecuteEventId
} from '../../../search-engine/execute-recorder'

type FileExecutionLogger = Pick<ModuleLogger, 'error' | 'warn'>

export async function executeIndexedFile(
  args: IExecuteArgs,
  logger: FileExecutionLogger
): Promise<null> {
  const filePath = args.item.meta?.file?.path
  if (!filePath) {
    logger.error(
      'File path missing for execution request',
      new Error('File path not found in TuffItem')
    )
    return null
  }

  try {
    // Avoid an OS dialog for a file that disappeared after search.
    await fs.access(filePath)
    const openError = await shell.openPath(filePath)
    if (openError) {
      logger.error('Failed to open file', { path: filePath, error: new Error(openError) })
      return null
    }
    recordAcceptedExecute({
      item: args.item,
      sessionId: args.searchResult?.sessionId ?? null,
      entryPoint: 'core-box',
      eventId: resolveExecuteEventId(args.eventId)
    }).catch((error) => {
      logger.warn('Failed to record file open usage', { path: filePath, error })
    })
    return null
  } catch (err: unknown) {
    const errorCode =
      typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined
    if (errorCode === 'ENOENT') {
      logger.error('File not found', {
        path: filePath,
        error: new Error(`File does not exist: ${filePath}`)
      })
    } else {
      logger.error('Failed to open file', { path: filePath, error: err })
    }
    return null
  }
}
