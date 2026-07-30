import { isProxy } from 'node:util/types'
import type { AnalyticsMessage } from '@talex-touch/utils/analytics'

const REPORT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/
const PLUGIN_IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

export function sanitizePluginAnalyticsIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !PLUGIN_IDENTIFIER_PATTERN.test(value)) return 'redacted'
  if (value === '__proto__' || value === 'prototype' || value === 'constructor') return 'redacted'
  return value
}

export function sanitizePluginAnalyticsNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(-1_000_000_000, Math.min(1_000_000_000, value))
}

export function sanitizePluginAnalyticsMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, string | number> {
  const sanitized: Record<string, string | number> = {}
  if (!metadata || typeof metadata !== 'object' || isProxy(metadata)) return sanitized
  const read = (key: string): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(metadata, key)
    return descriptor && 'value' in descriptor ? descriptor.value : undefined
  }
  const name = read('name')
  const value = read('value')
  const durationMs = read('durationMs')
  if (name !== undefined) sanitized.name = sanitizePluginAnalyticsIdentifier(name)
  if (value !== undefined) sanitized.value = sanitizePluginAnalyticsNumber(value)
  if (durationMs !== undefined) {
    sanitized.durationMs = Math.max(0, sanitizePluginAnalyticsNumber(durationMs))
  }
  return sanitized
}

export function sanitizeAnalyticsReportMessage(message: AnalyticsMessage): AnalyticsMessage {
  return {
    id: REPORT_ID_PATTERN.test(message.id) ? message.id : 'redacted',
    source: message.source,
    severity: message.severity,
    title: 'Diagnostic event',
    message: '',
    status: message.status,
    createdAt: message.createdAt
  }
}
