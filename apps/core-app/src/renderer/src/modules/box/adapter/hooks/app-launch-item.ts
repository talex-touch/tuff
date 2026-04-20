import type { TuffItem } from '@talex-touch/utils'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

export function isBackgroundAppLaunchItem(item?: TuffItem | null): boolean {
  if (!item) return false
  if (item.kind !== 'app') return false
  if (item.source?.id !== 'app-provider') return false
  return isRecord(item.meta) && isRecord(item.meta.app)
}
