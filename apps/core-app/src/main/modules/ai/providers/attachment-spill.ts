import type {
  IntelligenceMessage,
  IntelligenceMessageAttachment
} from '@talex-touch/tuff-intelligence'
import { randomUUID } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '../../../utils/logger'

const spillLog = createLogger('Intelligence').child('AttachmentSpill')

/**
 * The formats the renderer promises and the only ones written to disk. A CLI decides how to read a
 * file from its extension, so the extension has to come from a MIME type this side verified — never
 * from the filename the user's machine supplied.
 */
const EXTENSIONS: Record<string, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  gif: 'gif'
}

const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,(.*)$/s

/**
 * Ceiling per attachment. Large enough for a full-resolution screenshot, small enough that a
 * malformed or hostile payload cannot fill the user's temp volume before the turn even starts.
 */
const MAX_BYTES = 10 * 1024 * 1024

export interface SpilledAttachments {
  /** Absolute paths, in the order the attachments arrived. Empty when none could be written. */
  paths: string[]
  /** Removes every file this spill created. Safe to call more than once. */
  cleanup: () => Promise<void>
}

/** Pulls the attachments out of a chat payload, keeping the order the user attached them in. */
export function collectMessageAttachments(
  messages: IntelligenceMessage[]
): IntelligenceMessageAttachment[] {
  return messages.flatMap((message) => message.attachments ?? [])
}

function decode(attachment: IntelligenceMessageAttachment): { bytes: Buffer; ext: string } | null {
  const match = DATA_URL.exec(attachment.dataUrl ?? '')
  if (!match) {
    spillLog.warn('Skipping attachment: not a supported image data URL', {
      meta: { name: attachment.name ?? 'unnamed' }
    })
    return null
  }

  const [, mimeSubtype = '', base64 = ''] = match
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0) {
    spillLog.warn('Skipping attachment: data URL decoded to nothing', {
      meta: { name: attachment.name ?? 'unnamed' }
    })
    return null
  }
  if (bytes.length > MAX_BYTES) {
    spillLog.warn('Skipping attachment: larger than the per-attachment limit', {
      meta: { name: attachment.name ?? 'unnamed', bytes: bytes.length, limit: MAX_BYTES }
    })
    return null
  }

  return { bytes, ext: EXTENSIONS[mimeSubtype] ?? 'png' }
}

/**
 * Writes attachments to temporary files so a CLI provider can be pointed at them.
 *
 * Attachments only exist as bytes in memory, and `pi` reads images from paths — this is the only
 * place the two meet. Anything unreadable is dropped with a warning rather than failing the turn:
 * the user asked a question that happens to have an image next to it, and losing the answer over a
 * broken attachment is worse than answering without it.
 */
export async function spillAttachments(
  attachments: IntelligenceMessageAttachment[]
): Promise<SpilledAttachments> {
  const paths: string[] = []

  for (const attachment of attachments) {
    const decoded = decode(attachment)
    if (!decoded) continue

    const path = join(tmpdir(), `tuff-attach-${randomUUID()}.${decoded.ext}`)
    try {
      // 0600: the temp directory is world-readable on every platform this ships to, and the bytes
      // are whatever the user happened to have on their clipboard.
      await writeFile(path, decoded.bytes, { mode: 0o600 })
      paths.push(path)
    } catch (error) {
      spillLog.warn('Skipping attachment: could not write it to a temporary file', {
        meta: { name: attachment.name ?? 'unnamed' },
        error
      })
    }
  }

  let cleaned = false
  return {
    paths,
    cleanup: async () => {
      if (cleaned) return
      cleaned = true
      await Promise.all(
        paths.map((path) =>
          unlink(path).catch((error: unknown) => {
            // A leftover file in the temp directory is a housekeeping problem, not a turn-ending
            // one — and on Windows this fails outright while the child still holds the handle.
            spillLog.warn('Failed to remove a temporary attachment', { meta: { path }, error })
          })
        )
      )
    }
  }
}
