import { AppPreviewChannel } from '@talex-touch/utils'

export function normalizeStoredUpdateChannel(channel: unknown): AppPreviewChannel | undefined {
  if (channel === null || channel === undefined) {
    return undefined
  }

  if (typeof channel === 'string') {
    const trimmed = channel.trim()
    if (!trimmed) {
      return undefined
    }

    const normalized = trimmed.toUpperCase()
    if (normalized === AppPreviewChannel.RELEASE) {
      return AppPreviewChannel.RELEASE
    }
    if (normalized === AppPreviewChannel.BETA) {
      return AppPreviewChannel.BETA
    }
    if (normalized === AppPreviewChannel.SNAPSHOT) {
      return AppPreviewChannel.SNAPSHOT
    }
    return undefined
  }

  return undefined
}

export function normalizeSupportedUpdateChannel(
  channel: AppPreviewChannel | null | undefined,
  fallback = AppPreviewChannel.RELEASE
): AppPreviewChannel {
  if (!channel) {
    return fallback
  }

  return channel === AppPreviewChannel.SNAPSHOT ? AppPreviewChannel.BETA : channel
}
