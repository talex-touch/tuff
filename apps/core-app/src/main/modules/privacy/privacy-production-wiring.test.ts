import type { Client, InStatement, ResultSet, Row } from '@libsql/client'
import { PRIVACY_SETTINGS_DATA_CATEGORIES } from '@talex-touch/utils/transport/events/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPrivacyProductionOwnerRegistry,
  resolvePrivacyCoreLogDirectory
} from './privacy-module'
import { DEFAULT_PRIVACY_RETENTION_POLICY } from './retention-policy'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

function client(label: string, calls: string[]): Pick<Client, 'execute' | 'batch'> {
  return {
    execute: vi.fn(async (statement: InStatement) => {
      const sql = typeof statement === 'string' ? statement : statement.sql
      calls.push(`${label}:${sql.replace(/\s+/g, ' ').trim()}`)
      return {
        rows: [Object.assign([], { item_count: 0, byte_count: 0 }) as unknown as Row]
      } as ResultSet
    }),
    batch: vi.fn(async () => [])
  }
}

describe('privacy production owner wiring', () => {
  it('routes auxiliary and core tables to their exact production clients', async () => {
    const calls: string[] = []
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'privacy-production-wiring-'))
    roots.push(root)
    const logs = resolvePrivacyCoreLogDirectory(root)
    expect(logs).toBe(path.join(root, 'logs'))
    await fs.mkdir(logs)
    await fs.writeFile(path.join(logs, 'D.2026-01-01.log'), 'metadata-only')

    const tempFileService = {
      registerNamespace: vi.fn(),
      inspectNamespace: vi.fn(async () => ({
        itemCount: 0,
        byteCount: 0,
        failedItemCount: 0,
        bounded: false,
        cancelled: false
      }))
    }
    const registry = createPrivacyProductionOwnerRegistry({
      coreClient: client('core', calls),
      auxiliaryClient: client('aux', calls),
      tempFileService: tempFileService as never,
      clipboardImagePersistence: {
        deleteOwnedImageReferences: vi.fn(),
        cleanupOrphanClipboardImages: vi.fn()
      },
      onClipboardDeleted: vi.fn(),
      beforeSearchDelete: vi.fn(),
      onSearchCompleted: vi.fn(),
      auditLifecycle: { cleanupRetentionPage: vi.fn() },
      contextLifecycle: { cleanupRetentionPage: vi.fn() },
      telemetryLifecycle: { clearFailureBefore: vi.fn() },
      logDirectory: logs
    })
    const signal = new AbortController().signal
    expect(registry.list().flatMap((owner) => [...owner.categories])).toEqual(
      PRIVACY_SETTINGS_DATA_CATEGORIES
    )
    const inspect = async (category: keyof typeof DEFAULT_PRIVACY_RETENTION_POLICY.categories) => {
      calls.length = 0
      return await registry.get(category).inspect(
        {
          category,
          policy: DEFAULT_PRIVACY_RETENTION_POLICY.categories[category],
          nowMs: Date.UTC(2026, 6, 31)
        },
        signal
      )
    }

    await inspect('clipboard-history')
    expect(calls).toHaveLength(1)
    expect(calls.every((call) => call.startsWith('aux:'))).toBe(true)

    await inspect('ocr-screenshot-temp')
    expect(calls).toHaveLength(1)
    expect(calls.every((call) => call.startsWith('aux:'))).toBe(true)

    await inspect('search-history')
    expect(calls.some((call) => call.startsWith('core:'))).toBe(true)
    expect(calls.some((call) => call.startsWith('aux:'))).toBe(true)

    await inspect('intelligence-audit')
    expect(calls).toHaveLength(1)
    expect(calls.every((call) => call.startsWith('core:'))).toBe(true)

    await inspect('intelligence-context')
    expect(calls).toHaveLength(1)
    expect(calls.every((call) => call.startsWith('core:'))).toBe(true)

    const diagnostics = await inspect('diagnostics')
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((call) => call.startsWith('aux:'))).toBe(true)
    expect(diagnostics.itemCount).toBe(1)
  })
})
