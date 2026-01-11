import { parentPort } from 'node:worker_threads'
import extractFileIcon from 'extract-file-icon'

type IconRequest = {
  type: 'extract'
  taskId: string
  filePath: string
}

type IconResultMessage = {
  type: 'done'
  taskId: string
  buffer: Buffer | null
}

type IconErrorMessage = {
  type: 'error'
  taskId: string
  error: string
}

const queue: IconRequest[] = []
let running = false

async function processQueue(): Promise<void> {
  if (running) {
    return
  }
  const next = queue.shift()
  if (!next) {
    return
  }
  running = true

  try {
    const buffer = extractFileIcon(next.filePath)
    parentPort?.postMessage({
      type: 'done',
      taskId: next.taskId,
      buffer: buffer && buffer.length > 0 ? buffer : null,
    } satisfies IconResultMessage)
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      taskId: next.taskId,
      error: error instanceof Error ? error.message : String(error),
    } satisfies IconErrorMessage)
  } finally {
    running = false
    if (queue.length > 0) {
      void processQueue()
    }
  }
}

parentPort?.on('message', (payload: IconRequest) => {
  if (!payload || payload.type !== 'extract') {
    return
  }
  queue.push(payload)
  void processQueue()
})
