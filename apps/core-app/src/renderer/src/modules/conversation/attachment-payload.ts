import type { AiAttachment } from '@talex-touch/tuffex/ai-elements'
import type { IntelligenceMessageAttachment } from '@talex-touch/utils/types/intelligence'

/**
 * The formats every downstream leg agrees on: main re-checks this exact set before writing the
 * bytes to disk, and `pi` decides how to read the file from the extension that check produces.
 * Anything else — SVG, HEIC, a PDF the picker let through — is dropped rather than mislabelled.
 */
const MODEL_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,/

/** Spread in slices so a multi-megabyte screenshot stays under the argument limit. */
const BASE64_CHUNK = 0x8000

function encodeDataUrl(mime: string, buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

/**
 * An object URL only names bytes the renderer still holds, and IPC cannot carry it — reading it
 * back is what turns the composer's display URL into something a provider can be handed.
 *
 * It fails precisely when the bytes are gone (a conversation restored from history, whose URLs died
 * with the session that made them), and that failure is the signal that the attachment can no
 * longer be sent rather than an error worth surfacing.
 *
 * The `fetch` below is not network access — the `blob:` guard limits it to bytes this renderer
 * already holds, which is exactly what the network client cannot read on our behalf.
 */
async function readObjectUrl(url: string): Promise<string | null> {
  // Object URLs and nothing else. An attachment naming an http(s) URL would turn "send my
  // screenshot" into a silent outbound request, which is the very thing the restriction guards
  // against — so the scheme is checked rather than trusted.
  if (!url.startsWith('blob:')) return null

  try {
    // eslint-disable-next-line no-restricted-syntax -- reads an in-memory object URL, see above
    const blob = await (await fetch(url)).blob()
    return encodeDataUrl(blob.type, await blob.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Resolves what the composer displays into what the wire can carry.
 *
 * Attachments the model cannot be given are silently absent from the result, and the caller reads
 * that gap as "this one stayed local" — which is what keeps the UI honest about a file attachment
 * or a dead object URL without failing the turn.
 */
export async function toModelAttachments(
  attachments: AiAttachment[]
): Promise<IntelligenceMessageAttachment[]> {
  const resolved = await Promise.all(
    attachments.map(async (attachment) => {
      // Non-image attachments never held bytes on this surface: the tray records a name and a size
      // and nothing more, so there is nothing to send even in principle.
      if (attachment.kind !== 'image') return null

      const dataUrl = MODEL_IMAGE_DATA_URL.test(attachment.url)
        ? attachment.url
        : await readObjectUrl(attachment.url)
      if (!dataUrl || !MODEL_IMAGE_DATA_URL.test(dataUrl)) return null

      return {
        type: 'image',
        dataUrl,
        ...(attachment.name ? { name: attachment.name } : {})
      } satisfies IntelligenceMessageAttachment
    })
  )

  return resolved.filter((attachment): attachment is IntelligenceMessageAttachment =>
    Boolean(attachment)
  )
}
