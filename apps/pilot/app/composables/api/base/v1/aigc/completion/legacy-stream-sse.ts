function parseJsonSafe<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  }
  catch {
    return null
  }
}

async function handleExecutorItem(item: string, callback: (data: any) => void) {
  if (item === '[DONE]') {
    callback({
      done: true,
    })
    return
  }

  try {
    const json = JSON.parse(item)

    callback({
      done: false,
      ...json,
    })
  }
  catch (error) {
    console.error('Failed to parse executor SSE data frame', item, error)

    callback({
      done: true,
      error: true,
    })
  }
}

export function parseLegacyCompletionSseFrame(frame: string): { event: string, data: string } | null {
  const lines = frame.split('\n')
  let event = 'message'
  const dataLines: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(':')) {
      continue
    }

    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message'
      continue
    }

    if (line.startsWith('data:')) {
      const data = line.slice(5)
      dataLines.push(data.startsWith(' ') ? data.slice(1) : data)
    }
  }

  if (!dataLines.length) {
    return null
  }

  return {
    event,
    data: dataLines.join('\n'),
  }
}

export async function handleLegacyCompletionExecutorResult(
  reader: ReadableStreamDefaultReader<string>,
  callback: (data: any) => void,
  normalizeErrorMessage: (value: unknown) => string,
  hooks?: {
    onChunk?: () => void
  },
) {
  let buffer = ''

  const flushBuffer = async () => {
    let frameEndIndex = buffer.indexOf('\n\n')

    while (frameEndIndex !== -1) {
      const frame = buffer.slice(0, frameEndIndex)
      buffer = buffer.slice(frameEndIndex + 2)

      const parsed = parseLegacyCompletionSseFrame(frame)
      if (!parsed) {
        frameEndIndex = buffer.indexOf('\n\n')
        continue
      }

      if (parsed.event === 'error') {
        const payload = parseJsonSafe<Record<string, any>>(parsed.data)
        if (payload) {
          callback({
            ...payload,
            done: false,
            event: typeof payload.event === 'string' ? payload.event : 'error',
            status: typeof payload.status === 'string' ? payload.status : 'failed',
            id: payload.id || 'assistant',
            name: payload.name,
            data: payload.data,
            message: normalizeErrorMessage(payload.message || payload.error || payload.data || parsed.data),
          })
          frameEndIndex = buffer.indexOf('\n\n')
          continue
        }

        callback({
          done: false,
          error: true,
          e: normalizeErrorMessage(parsed.data),
        })
        frameEndIndex = buffer.indexOf('\n\n')
        continue
      }

      await handleExecutorItem(parsed.data, callback)
      frameEndIndex = buffer.indexOf('\n\n')
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    hooks?.onChunk?.()

    if (done) {
      if (buffer.trim().length) {
        const parsed = parseLegacyCompletionSseFrame(buffer)
        if (parsed) {
          await handleExecutorItem(parsed.data, callback)
        }
      }

      callback({
        done: true,
      })

      break
    }

    if (!value.length) {
      continue
    }

    buffer += value.replace(/\r\n/g, '\n')
    await flushBuffer()
  }
}
