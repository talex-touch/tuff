import type {
  AiImportApplyRequest,
  AiImportCandidate,
  AiImportSecretDescriptor,
  AiImportSourceSnapshot
} from '@talex-touch/utils/types/ai-orchestrator'
import type { AiPreparedImportTransaction } from './ai-import-types'
import type { IntelligenceMcpProfile } from './intelligence-mcp-registry'
import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { extname } from 'node:path'
import { app } from 'electron'
import { resolveRuntimeRootPath } from '../../utils/app-root-path'
import {
  getSecureStoreValue,
  isSecureStoreAvailable,
  setSecureStoreValue
} from '../../utils/secure-store'
import { readBoundedImportFile } from './ai-import-bounded-file'
import { parseConfig, parseMcpProfiles, type ParsedMcpProfile } from './ai-import-config-parser'
import { aiImportContentStore } from './ai-import-content-store'

const SECURE_VALUE_PREFIX = '$secure:'
const SENSITIVE_SNAPSHOT_KEY = /token|api.?key|secret|password|credential|authorization|cookie/i

interface SecretWrite {
  descriptor: AiImportSecretDescriptor
  value?: string
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function authRefFor(candidateId: string, keyPath: string): string {
  return `ai.import.${hash(candidateId).slice(0, 16)}.${hash(keyPath).slice(0, 16)}`
}

function isExternalSecretReference(value: string): boolean {
  const trimmed = value.trim()
  return (
    /\$\{[^}]+\}/.test(trimmed) || /(?:^|\s)(?:env|keychain|credential|authref):/i.test(trimmed)
  )
}

function secureDescriptor(
  candidateId: string,
  keyPath: string,
  value: string,
  reauthRequired = false
): SecretWrite {
  const reauth = reauthRequired || isExternalSecretReference(value)
  const authRef = authRefFor(candidateId, keyPath)
  return {
    descriptor: {
      keyPath,
      fingerprint: hash(value),
      authRef: reauth ? undefined : authRef,
      reauthRequired: reauth
    },
    value: reauth ? undefined : value
  }
}

function profileRecord(
  config: Record<string, unknown>,
  profile: ParsedMcpProfile
): Record<string, unknown> | null {
  const root = config[profile.rootKey]
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null
  const value = (root as Record<string, unknown>)[profile.name]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function redactSensitiveSnapshot(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(redactSensitiveSnapshot)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_SNAPSHOT_KEY.test(key) ? '[redacted]' : redactSensitiveSnapshot(nested)
    ])
  )
}

function sanitizeMcpSecrets(config: Record<string, unknown>, candidateId: string): SecretWrite[] {
  const writes: SecretWrite[] = []
  for (const profile of parseMcpProfiles(config)) {
    const record = profileRecord(config, profile)
    if (!record) continue
    const prefix = `${profile.rootKey}.${profile.name}`
    for (const containerName of ['env', 'headers'] as const) {
      const container = record[containerName]
      if (!container || typeof container !== 'object' || Array.isArray(container)) continue
      for (const [key, value] of Object.entries(container as Record<string, unknown>)) {
        if (typeof value !== 'string') continue
        const write = secureDescriptor(candidateId, `${prefix}.${containerName}.${key}`, value)
        writes.push(write)
        ;(container as Record<string, unknown>)[key] = write.descriptor.reauthRequired
          ? '$reauth-required'
          : `${SECURE_VALUE_PREFIX}${write.descriptor.authRef!}`
      }
    }
    if (Array.isArray(record.args)) {
      let redactNext = false
      record.args = record.args.map((arg, index) => {
        if (typeof arg !== 'string') return arg
        if (redactNext) {
          redactNext = false
          writes.push(secureDescriptor(candidateId, `${prefix}.args.${index}`, arg, true))
          return '$reauth-required'
        }
        if (!/token|api.?key|secret|password|credential|authorization/i.test(arg)) return arg
        const separator = arg.indexOf('=')
        if (separator > 0) {
          const value = arg.slice(separator + 1)
          writes.push(secureDescriptor(candidateId, `${prefix}.args.${index}`, value, true))
          return `${arg.slice(0, separator + 1)}$reauth-required`
        }
        redactNext = true
        return arg
      })
    }
    if (profile.type === 'http') {
      for (const tokenKey of ['bearer_token', 'bearerToken', 'token'] as const) {
        const value = record[tokenKey]
        if (typeof value !== 'string') continue
        const write = secureDescriptor(candidateId, `${prefix}.${tokenKey}`, `Bearer ${value}`)
        writes.push(write)
        const headers =
          record.headers && typeof record.headers === 'object' && !Array.isArray(record.headers)
            ? (record.headers as Record<string, unknown>)
            : ((record.headers = {}) as Record<string, unknown>)
        headers.Authorization = write.descriptor.reauthRequired
          ? '$reauth-required'
          : `Bearer ${SECURE_VALUE_PREFIX}${write.descriptor.authRef!}`
        delete record[tokenKey]
      }
    }
    for (const authKey of [
      'oauth',
      'oauth2',
      'client_secret',
      'clientSecret',
      'client_id',
      'clientId'
    ]) {
      const value = record[authKey]
      if (value === undefined) continue
      const serialized = typeof value === 'string' ? value : JSON.stringify(value)
      writes.push(secureDescriptor(candidateId, `${prefix}.${authKey}`, serialized, true))
      record[authKey] = '$reauth-required'
    }
  }
  return writes
}

function secureRef(value: unknown): string | undefined {
  return typeof value === 'string' && value.startsWith(SECURE_VALUE_PREFIX)
    ? value.slice(SECURE_VALUE_PREFIX.length)
    : undefined
}

function headerAuthRef(value: unknown): string | undefined {
  const direct = secureRef(value)
  if (direct) return direct
  if (typeof value !== 'string') return undefined
  const match = /^Bearer\s+\$secure:(.+)$/i.exec(value.trim())
  return match?.[1]
}

function normalizeMcpProfiles(
  candidate: AiImportCandidate,
  config: Record<string, unknown> | null
): IntelligenceMcpProfile[] {
  if (!config || candidate.kind !== 'mcp') return []
  const profiles: IntelligenceMcpProfile[] = []
  for (const profile of parseMcpProfiles(config)) {
    const id = `import.${candidate.provider}.${hash(`${candidate.sourceId}:${profile.name}`).slice(0, 20)}`
    if (profile.type === 'stdio' && profile.command) {
      const env: Record<string, string> = {}
      const envAuthRefs: Record<string, string> = {}
      for (const [key, value] of Object.entries(profile.env)) {
        const authRef = secureRef(value)
        if (authRef) envAuthRefs[key] = authRef
        else if (value !== '$reauth-required') env[key] = value
      }
      profiles.push({
        id,
        name: profile.name,
        enabled: !profile.requiresReauth,
        transport: {
          type: 'stdio',
          command: profile.command,
          args: profile.args,
          cwd: profile.cwd,
          env,
          envAuthRefs
        },
        metadata: {
          importedCandidateId: candidate.id,
          reauthRequired: profile.requiresReauth,
          requiredPermission: 'SYSTEM_EXEC'
        }
      })
      continue
    }
    if (profile.type === 'http' && profile.url) {
      const headers: Record<string, string> = {}
      const headerAuthRefs: Record<string, string> = {}
      for (const [key, value] of Object.entries(profile.headers)) {
        const authRef = headerAuthRef(value)
        if (authRef) headerAuthRefs[key] = authRef
        else if (value !== '$reauth-required') headers[key] = value
      }
      profiles.push({
        id,
        name: profile.name,
        enabled: !profile.requiresReauth,
        transport: {
          type: 'streamable-http',
          url: profile.url,
          headers,
          headerAuthRefs
        },
        metadata: {
          importedCandidateId: candidate.id,
          reauthRequired: profile.requiresReauth,
          requiredPermission: 'NETWORK_ACCESS'
        }
      })
    }
  }
  return profiles
}

function projectionFor(
  candidate: AiImportCandidate,
  contentRef: string,
  mcpProfiles: IntelligenceMcpProfile[],
  sanitizedContent: string
): Record<string, unknown> {
  const description = 'description' in candidate ? candidate.description : undefined
  return {
    kind: candidate.kind,
    name: candidate.name,
    description,
    contentRef,
    profileId:
      candidate.kind === 'agent'
        ? `import.${candidate.provider}.${hash(candidate.id).slice(0, 20)}`
        : undefined,
    instructions: ['agent', 'rule', 'instruction'].includes(candidate.kind)
      ? sanitizedContent
      : undefined,
    triggerMode: candidate.kind === 'command' ? 'explicit' : undefined,
    globs: candidate.kind === 'rule' ? candidate.globs : undefined,
    alwaysApply: candidate.kind === 'rule' ? candidate.alwaysApply : undefined,
    mcpProfiles
  }
}

export class AiImportRuntimeService {
  async prepare(
    scanCwd: string,
    candidates: AiImportCandidate[],
    request: AiImportApplyRequest,
    sources: AiImportSourceSnapshot[]
  ): Promise<AiPreparedImportTransaction> {
    const rootPath = resolveRuntimeRootPath(app)
    const canonicalScanCwd = await realpath(scanCwd)
    const sourceRoots = new Map(sources.map((source) => [source.id, source.rootPath]))
    const transaction: AiPreparedImportTransaction = {
      items: [],
      createdContentRefs: [],
      secretUndo: []
    }
    try {
      for (const candidate of candidates) {
        const sourceRoot = sourceRoots.get(candidate.sourceId)
        if (!sourceRoot) throw new Error(`Import candidate ${candidate.id} has no matching source`)
        const sourceFile = await readBoundedImportFile(sourceRoot, candidate.path)
        if (sourceFile.canonicalPath !== candidate.path)
          throw new Error(
            `Import candidate ${candidate.id} changed its canonical path after preview`
          )
        const rawContent = sourceFile.content
        if (hash(rawContent) !== candidate.fingerprint)
          throw new Error(`Import candidate ${candidate.id} changed after preview`)

        const parsed = parseConfig(rawContent, extname(sourceFile.canonicalPath).toLowerCase())
        let sanitizedContent = rawContent
        let writes: SecretWrite[] = []
        if (candidate.kind === 'mcp') {
          if (!parsed)
            throw new Error(`MCP candidate ${candidate.id} has an unsupported configuration format`)
          if (parseMcpProfiles(parsed).length === 0)
            throw new Error(`MCP candidate ${candidate.id} has no supported profile`)
          writes = sanitizeMcpSecrets(parsed, candidate.id)
          sanitizedContent = JSON.stringify(parsed, null, 2)
        }

        const persistableWrites = writes.filter((write) => write.value !== undefined)
        if (persistableWrites.length > 0 && request.confirmSecretMigration !== true)
          throw new Error(`Import candidate ${candidate.id} requires secret migration confirmation`)
        if (persistableWrites.length > 0 && !isSecureStoreAvailable(rootPath))
          throw new Error('Secure storage is unavailable for AI configuration import')
        for (const write of persistableWrites) {
          const authRef = write.descriptor.authRef!
          const previousValue = await getSecureStoreValue(rootPath, authRef, 'ai-import-secret')
          const persisted = await setSecureStoreValue(
            rootPath,
            authRef,
            write.value!,
            'ai-import-secret'
          )
          if (!persisted)
            throw new Error(`Failed to persist imported secret ${write.descriptor.keyPath}`)
          transaction.secretUndo.push({ authRef, previousValue })
        }

        const mcpProfiles = normalizeMcpProfiles(candidate, parsed)
        if (candidate.kind === 'mcp' && mcpProfiles.length === 0)
          throw new Error(`MCP candidate ${candidate.id} has no usable profile`)
        if (candidate.kind === 'mcp' && parsed) {
          sanitizedContent = JSON.stringify(redactSensitiveSnapshot(parsed), null, 2)
        }
        const content = await aiImportContentStore.write(sanitizedContent)
        if (content.created) transaction.createdContentRefs.push(content.ref)
        const override = request.overrides?.[candidate.id]
        transaction.items.push({
          candidate,
          targetScope: override?.targetScope ?? candidate.targetScope,
          workspaceRoot:
            (override?.targetScope ?? candidate.targetScope) === 'workspace'
              ? canonicalScanCwd
              : undefined,
          alias: override?.alias?.trim() || undefined,
          contentRef: content.ref,
          projection: projectionFor(candidate, content.ref, mcpProfiles, sanitizedContent),
          secrets: writes.map((write) => write.descriptor),
          mcpProfiles
        })
      }
      return transaction
    } catch (error) {
      await this.rollback(transaction)
      throw error
    }
  }

  async rollback(transaction: AiPreparedImportTransaction): Promise<void> {
    const rootPath = resolveRuntimeRootPath(app)
    const failures: string[] = []
    for (const undo of [...transaction.secretUndo].reverse()) {
      const restored = await setSecureStoreValue(
        rootPath,
        undo.authRef,
        undo.previousValue,
        'ai-import-secret'
      ).catch(() => false)
      if (!restored) failures.push(`secure:${undo.authRef}`)
    }
    for (const ref of transaction.createdContentRefs) {
      try {
        await aiImportContentStore.remove(ref)
      } catch {
        failures.push(`content:${ref}`)
      }
    }
    if (failures.length > 0) {
      throw new Error(`AI import rollback failed for ${failures.join(', ')}`)
    }
  }
}

export const aiImportRuntimeService = new AiImportRuntimeService()
