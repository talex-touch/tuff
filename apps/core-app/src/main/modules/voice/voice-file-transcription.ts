import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { dialog } from 'electron'

const MAX_VOICE_FILE_BYTES = 25 * 1024 * 1024

const VOICE_FILE_FORMATS: Record<string, string> = {
  '.wav': 'wav',
  '.mp3': 'mp3',
  '.ogg': 'ogg',
  '.opus': 'opus',
  '.flac': 'flac',
  '.m4a': 'm4a',
  '.webm': 'webm'
}

export interface SelectedVoiceFile {
  name: string
  /** Exact backing storage of the bounded Buffer; never written or exposed to renderer. */
  audio: ArrayBuffer
  format: string
}

function voiceFileError(code: string): Error {
  return new Error(code)
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw voiceFileError('VOICE_FILE_TRANSCRIPTION_CANCELLED')
}

/**
 * Reads exactly one user-selected, bounded regular audio file into main memory.
 * The path never leaves this module and bytes are not persisted or logged.
 */
export async function selectVoiceFile(signal?: AbortSignal): Promise<SelectedVoiceFile | null> {
  assertNotAborted(signal)
  const selection = await dialog.showOpenDialog({
    title: 'Select audio file',
    buttonLabel: 'Transcribe',
    properties: ['openFile', 'noResolveAliases'],
    filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'opus', 'flac', 'm4a', 'webm'] }]
  })
  assertNotAborted(signal)
  if (selection.canceled || selection.filePaths.length !== 1) return null

  const filePath = selection.filePaths[0]
  const fileName = basename(filePath)
  const audioFormat = VOICE_FILE_FORMATS[extname(fileName).toLowerCase()]
  if (!audioFormat) throw voiceFileError('VOICE_FILE_TYPE_UNSUPPORTED')

  try {
    const before = await lstat(filePath)
    if (!before.isFile() || before.isSymbolicLink()) throw voiceFileError('VOICE_FILE_NOT_REGULAR')
    if (before.size === 0) throw voiceFileError('VOICE_FILE_EMPTY')
    if (before.size > MAX_VOICE_FILE_BYTES) throw voiceFileError('VOICE_FILE_TOO_LARGE')

    const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const opened = await handle.stat()
      if (
        !opened.isFile() ||
        opened.size !== before.size ||
        opened.ino !== before.ino ||
        opened.dev !== before.dev
      ) {
        throw voiceFileError('VOICE_FILE_CHANGED')
      }
      const bytes = Buffer.allocUnsafeSlow(opened.size)
      for (let offset = 0; offset < bytes.length; ) {
        assertNotAborted(signal)
        const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
        if (bytesRead === 0) throw voiceFileError('VOICE_FILE_CHANGED')
        offset += bytesRead
      }
      assertNotAborted(signal)
      return {
        name: fileName,
        format: audioFormat,
        audio: bytes.buffer as ArrayBuffer
      }
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('VOICE_FILE_')) throw error
    throw voiceFileError('VOICE_FILE_UNREADABLE')
  }
}
