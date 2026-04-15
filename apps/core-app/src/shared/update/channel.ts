import { AppPreviewChannel } from '@talex-touch/utils'

export function normalizeStoredUpdateChannel(channel: unknown): AppPreviewChannel | undefined {
  if (channel === null || channel === undefined) {
    return undefined
  }

  if (typeof channel === 'number') {
    switch (channel) {
      case 0:
        return AppPreviewChannel.RELEASE
      case 1:
      case 2:
        return AppPreviewChannel.BETA
      default:
        return undefined
    }
  }

  if (typeof channel === 'string') {
    const trimmed = channel.trim()
    if (!trimmed) {
      return undefined
    }

    if (/^\d+$/.test(trimmed)) {
      return normalizeStoredUpdateChannel(Number.parseInt(trimmed, 10))
    }

    const normalized = trimmed.toUpperCase()
    if (
      normalized === AppPreviewChannel.RELEASE ||
      normalized.startsWith('RELEASE') ||
      normalized.startsWith('MASTER')
    ) {
      return AppPreviewChannel.RELEASE
    }
    if (
      normalized === AppPreviewChannel.BETA ||
      normalized === AppPreviewChannel.SNAPSHOT ||
      normalized.startsWith('BETA') ||
      normalized.startsWith('SNAPSHOT') ||
      normalized.startsWith('ALPHA')
    ) {
      return AppPreviewChannel.BETA
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
