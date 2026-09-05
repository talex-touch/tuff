import { clipboard } from 'electron'

export interface ClipboardFormatSnapshot {
  readonly format: string
  readonly data: Buffer
}

export interface ClipboardSnapshot {
  readonly items: readonly ClipboardFormatSnapshot[]
}

export function snapshotClipboard(): ClipboardSnapshot {
  const items: ClipboardFormatSnapshot[] = []
  for (const format of clipboard.availableFormats()) {
    try {
      items.push({ format, data: clipboard.readBuffer(format) })
    } catch {
      // A format can disappear while another application owns the clipboard.
    }
  }
  return { items }
}

export function restoreClipboard(snapshot: ClipboardSnapshot): boolean {
  try {
    clipboard.clear()
  } catch {
    return false
  }

  let restored = true
  for (const item of snapshot.items) {
    try {
      clipboard.writeBuffer(item.format, item.data)
    } catch {
      restored = false
    }
  }
  return restored
}
