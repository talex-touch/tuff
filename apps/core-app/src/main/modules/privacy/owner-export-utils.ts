import type { PrivacyDataCategory } from '@talex-touch/utils/transport/events/types'
import type { PrivacyOwnerExportResult, PrivacyOwnerExportWriter } from './data-owner'
import { Buffer } from 'node:buffer'
import { privacyOwnerExportResult } from './data-owner'

export async function writePrivacyOwnerRecords(
  category: PrivacyDataCategory,
  records: readonly Readonly<Record<string, unknown>>[],
  writer: PrivacyOwnerExportWriter,
  signal: AbortSignal,
  bounded = false
): Promise<PrivacyOwnerExportResult> {
  let exportedItemCount = 0
  let exportedByteCount = 0
  for (const record of records) {
    if (signal.aborted) {
      return privacyOwnerExportResult(category, 'PRIVACY_OWNER_CANCELLED', {
        exportedItemCount,
        exportedByteCount,
        partial: exportedItemCount > 0,
        cancelled: true
      })
    }
    const result = await writer.write(record)
    exportedItemCount += 1
    exportedByteCount += result.byteCount
  }

  if (signal.aborted) {
    return privacyOwnerExportResult(category, 'PRIVACY_OWNER_CANCELLED', {
      exportedItemCount,
      exportedByteCount,
      partial: exportedItemCount > 0,
      cancelled: true
    })
  }
  if (bounded) {
    return privacyOwnerExportResult(
      category,
      'PRIVACY_OWNER_LIMIT_REACHED',
      { exportedItemCount, exportedByteCount, partial: exportedItemCount > 0 },
      { retryable: false }
    )
  }
  return privacyOwnerExportResult(category, 'PRIVACY_OWNER_COMPLETED', {
    exportedItemCount,
    exportedByteCount,
    partial: false,
    cancelled: false
  })
}

export function exportString(value: unknown, maximumBytes = 16_384): string | null {
  if (typeof value !== 'string') return null
  const byteLength = Buffer.byteLength(value, 'utf8')
  if (
    byteLength === 0 ||
    byteLength > maximumBytes ||
    !/^[A-Z0-9_@][A-Z0-9_@.:/+~#-]*$/iu.test(value) ||
    /(?:^|[_.:/-])(?:secret|password|token|authorization|credential|endpoint|sql|native[-_]?error|path)(?:$|[_.:/-])/iu.test(
      value
    ) ||
    /^[A-Z]:\//iu.test(value) ||
    value.startsWith('/') ||
    value.includes('://') ||
    value.includes('\\') ||
    value.split('/').some((segment) => segment === '..')
  ) {
    return null
  }
  return value
}

export function exportNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') {
    const number = Number(value)
    return Number.isSafeInteger(number) ? number : null
  }
  return null
}

export function exportBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === 1n
}
