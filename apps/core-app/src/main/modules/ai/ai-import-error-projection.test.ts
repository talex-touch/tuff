import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { safeApiHandler } from '../../utils/safe-handler'
import {
  AI_IMPORT_SECRET_CONFIRMATION_REQUIRED,
  AI_IMPORT_SECURE_STORE_UNAVAILABLE,
  AI_IMPORT_SOURCE_CHANGED,
  aiImportFailureCode,
  MCP_SERVER_REAUTH_REQUIRED,
  projectAiImportError
} from './ai-import-error-projection'

/** The messages the import path throws today, each with the code the settings pages act on. */
const THROWN: Array<[string, string]> = [
  [
    'Import candidate claude:user:mcp:abc requires secret migration confirmation for context7, pencil',
    AI_IMPORT_SECRET_CONFIRMATION_REQUIRED
  ],
  [
    'MCP_SERVER_REAUTH_REQUIRED: MCP candidate codex:user:config:1:mcp selects github; a server that needs re-authentication cannot run from an imported copy',
    MCP_SERVER_REAUTH_REQUIRED
  ],
  ['Import candidate codex:user:config:1:mcp changed after preview', AI_IMPORT_SOURCE_CHANGED],
  [
    'Import candidate codex:user:config:1:mcp changed its canonical path after preview',
    AI_IMPORT_SOURCE_CHANGED
  ],
  [
    'Import candidate codex:user:config:1:mcp changed while it was being imported; try again',
    AI_IMPORT_SOURCE_CHANGED
  ],
  ['Import candidate codex:user:config:1:mcp is stale', AI_IMPORT_SOURCE_CHANGED],
  ['Import selection contains stale, blocked, or missing candidates', AI_IMPORT_SOURCE_CHANGED],
  ['Secure storage is unavailable for AI configuration import', AI_IMPORT_SECURE_STORE_UNAVAILABLE]
]

describe('aiImportFailureCode', () => {
  it.each(THROWN)('maps %s', (message, code) => {
    expect(aiImportFailureCode(new Error(message))).toBe(code)
  })

  it.each([
    'Failed to persist imported secret mcpServers.release.env.API_TOKEN',
    'Import file escapes its canonical source root',
    'scanId and candidateIds are required',
    'MCP candidate x does not declare server y',
    ''
  ])('leaves %j to the public sentence', (message) => {
    expect(aiImportFailureCode(new Error(message))).toBeUndefined()
    expect(projectAiImportError(new Error(message))).toBeUndefined()
  })

  it('reads plain strings and ignores anything else', () => {
    expect(aiImportFailureCode('Import candidate x is stale')).toBe(AI_IMPORT_SOURCE_CHANGED)
    expect(aiImportFailureCode({ message: 'Import candidate x is stale' })).toBeUndefined()
    expect(aiImportFailureCode(undefined)).toBeUndefined()
  })
})

describe('projectAiImportError', () => {
  it('answers with the bare code, so no file or server name leaves main', () => {
    expect(projectAiImportError(new Error(THROWN[0]![0]))).toEqual({
      error: AI_IMPORT_SECRET_CONFIRMATION_REQUIRED,
      code: AI_IMPORT_SECRET_CONFIRMATION_REQUIRED,
      retryable: true
    })
    expect(projectAiImportError(new Error(THROWN[1]![0]))).toEqual({
      error: MCP_SERVER_REAUTH_REQUIRED,
      code: MCP_SERVER_REAUTH_REQUIRED,
      retryable: false
    })
  })

  it('reaches the response through safeApiHandler, and nothing else does', async () => {
    const handler = (message: string) =>
      safeApiHandler(
        async () => {
          throw new Error(message)
        },
        { projectError: (error) => projectAiImportError(error) }
      )
    const context = { eventName: 'test' } as never

    await expect(handler(THROWN[2]![0])(undefined, context)).resolves.toEqual({
      ok: false,
      error: AI_IMPORT_SOURCE_CHANGED,
      code: AI_IMPORT_SOURCE_CHANGED,
      retryable: true
    })
    await expect(handler('database is locked')(undefined, context)).resolves.toEqual({
      ok: false,
      error: 'The operation failed. Please retry.'
    })
  })
})

/**
 * The table is matched against message text, so a reworded throw would fall back to the public
 * sentence without a single type error. Each fragment below is read from the source that throws
 * it; rewording one fails here first.
 */
describe('the messages it matches are still the ones thrown', () => {
  const read = (file: string) => readFileSync(path.resolve(__dirname, file), 'utf8')

  it.each([
    ['ai-import-runtime.ts', 'requires secret migration confirmation for'],
    ['ai-import-runtime.ts', '`MCP_SERVER_REAUTH_REQUIRED: MCP candidate'],
    ['ai-import-runtime.ts', 'changed after preview`'],
    ['ai-import-runtime.ts', 'changed its canonical path after preview`'],
    ['ai-orchestrator-store.ts', 'changed while it was being imported; try again'],
    ['ai-orchestrator-store.ts', 'is stale`'],
    [
      'ai-cli-import-service.ts',
      "'Import selection contains stale, blocked, or missing candidates'"
    ],
    ['ai-import-runtime.ts', "'Secure storage is unavailable for AI configuration import'"]
  ])('%s still throws %s', (file, fragment) => {
    expect(read(file)).toContain(fragment)
  })
})
