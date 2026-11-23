import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CLAUDE_CLI_PROFILE_ID,
  CODEX_CLI_PROFILE_ID,
  OMP_CLI_PROFILE_ID,
  resetAllCliExecutableCaches,
  resolveClaudeAcpExecutable,
  resolveCodexAcpExecutable
} from '../providers/pi-cli-runtime'
import {
  cliCapabilityProviderForKind,
  cliDefaultModelLabel,
  cliProviderIdForKind,
  parseWorktreeRequestOptions,
  resolveCliDriver,
  resolveCliPermissionRisk,
  resolveCliProfileKind
} from './driver-resolver'

describe('driver-resolver', () => {
  const savedEnv: Record<string, string | undefined> = {}
  const envKeys = [
    'TUFF_OMP_CLI_PATH',
    'TUFF_CODEX_CLI_PATH',
    'TUFF_CODEX_ACP_PATH',
    'TUFF_CLAUDE_CLI_PATH',
    'TUFF_CLAUDE_ACP_PATH',
    'PATH'
  ]
  let tempDir: string | null = null

  beforeEach(async () => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key]
    }
    tempDir = await mkdtemp(join(tmpdir(), 'tuff-driver-resolver-'))
    resetAllCliExecutableCaches()
  })

  afterEach(async () => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
    resetAllCliExecutableCaches()
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
      tempDir = null
    }
  })

  async function createExecutable(name: string): Promise<string> {
    const filePath = join(tempDir!, name)
    await writeFile(filePath, '#!/bin/sh\nexit 0\n', 'utf8')
    await chmod(filePath, 0o755)
    return filePath
  }

  describe('resolveCliProfileKind (scheduler-decides-executor invariant)', () => {
    it('maps ONLY the three external CLI scheduler profile IDs', () => {
      expect(resolveCliProfileKind(OMP_CLI_PROFILE_ID)).toBe('omp')
      expect(resolveCliProfileKind(CODEX_CLI_PROFILE_ID)).toBe('codex')
      expect(resolveCliProfileKind(CLAUDE_CLI_PROFILE_ID)).toBe('claude')
    })

    it('returns null for default-pi, unnamed runs, and arbitrary custom profiles', () => {
      expect(resolveCliProfileKind('default-pi')).toBeNull()
      expect(resolveCliProfileKind(undefined)).toBeNull()
      expect(resolveCliProfileKind('')).toBeNull()
      expect(resolveCliProfileKind('profile:cli:pi')).toBeNull()
      expect(resolveCliProfileKind('custom-codex-model-profile')).toBeNull()
    })
  })

  describe('ACP adapter executable discovery and driver selection', () => {
    it('resolves codex-acp via TUFF_CODEX_ACP_PATH and falls back to codex app-server when absent', async () => {
      const codexAcp = await createExecutable('codex-acp')
      const codexBin = await createExecutable('codex')

      process.env.TUFF_CODEX_ACP_PATH = codexAcp
      process.env.TUFF_CODEX_CLI_PATH = codexBin
      resetAllCliExecutableCaches()

      await expect(resolveCodexAcpExecutable()).resolves.toBe(codexAcp)
      await expect(resolveCliDriver('codex')).resolves.toEqual({
        kind: 'codex',
        protocol: 'acp',
        executablePath: codexAcp,
        adapterName: 'codex-acp'
      })

      // Point ACP override to nonexistent path -> authoritative absent -> uses native codex app-server
      process.env.TUFF_CODEX_ACP_PATH = join(tempDir!, 'missing-codex-acp')
      resetAllCliExecutableCaches()

      await expect(resolveCodexAcpExecutable()).resolves.toBeNull()
      await expect(resolveCliDriver('codex')).resolves.toEqual({
        kind: 'codex',
        protocol: 'codex-app-server',
        executablePath: codexBin,
        adapterName: 'codex'
      })
    })

    it('resolves claude-agent-acp primary and claude-code-acp fallback, then claude stream-json', async () => {
      const claudeCodeAcp = await createExecutable('claude-code-acp')
      const claudeBin = await createExecutable('claude')

      delete process.env.TUFF_CLAUDE_ACP_PATH
      process.env.PATH = tempDir!
      process.env.TUFF_CLAUDE_CLI_PATH = claudeBin
      resetAllCliExecutableCaches()

      await expect(resolveClaudeAcpExecutable()).resolves.toBe(claudeCodeAcp)
      await expect(resolveCliDriver('claude')).resolves.toEqual({
        kind: 'claude',
        protocol: 'acp',
        executablePath: claudeCodeAcp,
        adapterName: 'claude-acp'
      })

      // Primary claude-agent-acp wins over claude-code-acp
      const claudeAgentAcp = await createExecutable('claude-agent-acp')
      resetAllCliExecutableCaches()
      await expect(resolveClaudeAcpExecutable()).resolves.toBe(claudeAgentAcp)

      // Authoritative absent override falls through to native claude stream-json
      process.env.TUFF_CLAUDE_ACP_PATH = join(tempDir!, 'missing-claude-acp')
      resetAllCliExecutableCaches()
      await expect(resolveCliDriver('claude')).resolves.toEqual({
        kind: 'claude',
        protocol: 'claude-stream-json',
        executablePath: claudeBin,
        adapterName: 'claude'
      })
    })

    it('never falls back across CLIs when the requested CLI is missing', async () => {
      const ompBin = await createExecutable('omp')
      const codexBin = await createExecutable('codex')
      const claudeBin = await createExecutable('claude')

      process.env.TUFF_OMP_CLI_PATH = join(tempDir!, 'missing-omp')
      process.env.TUFF_CODEX_ACP_PATH = join(tempDir!, 'missing-codex-acp')
      process.env.TUFF_CODEX_CLI_PATH = codexBin
      process.env.TUFF_CLAUDE_ACP_PATH = join(tempDir!, 'missing-claude-acp')
      process.env.TUFF_CLAUDE_CLI_PATH = claudeBin
      resetAllCliExecutableCaches()

      await expect(resolveCliDriver('omp')).rejects.toThrow('OMP_CLI_NOT_FOUND')

      process.env.TUFF_OMP_CLI_PATH = ompBin
      process.env.TUFF_CODEX_CLI_PATH = join(tempDir!, 'missing-codex')
      resetAllCliExecutableCaches()
      await expect(resolveCliDriver('codex')).rejects.toThrow('CODEX_CLI_NOT_FOUND')

      process.env.TUFF_CODEX_CLI_PATH = codexBin
      process.env.TUFF_CLAUDE_CLI_PATH = join(tempDir!, 'missing-claude')
      resetAllCliExecutableCaches()
      await expect(resolveCliDriver('claude')).rejects.toThrow('CLAUDE_CLI_NOT_FOUND')
    })
  })

  describe('metadata helpers', () => {
    it('returns stable provider/model labels per CLI and protocol', () => {
      expect(cliProviderIdForKind('omp')).toBe('omp-cli')
      expect(cliProviderIdForKind('codex')).toBe('codex-cli')
      expect(cliProviderIdForKind('claude')).toBe('claude-cli')

      expect(cliCapabilityProviderForKind('omp')).toBe('tuff-omp-runtime')
      expect(cliCapabilityProviderForKind('codex')).toBe('tuff-codex-runtime')
      expect(cliCapabilityProviderForKind('claude')).toBe('tuff-claude-runtime')

      expect(cliDefaultModelLabel('omp', 'acp')).toBe('omp-acp')
      expect(cliDefaultModelLabel('codex', 'acp')).toBe('codex-acp')
      expect(cliDefaultModelLabel('codex', 'codex-app-server')).toBe('codex-app-server')
      expect(cliDefaultModelLabel('claude', 'acp')).toBe('claude-acp')
      expect(cliDefaultModelLabel('claude', 'claude-stream-json')).toBe('claude-stream-json')
    })

    it('classifies permission risk fail-closed to execute for unknown tools', () => {
      expect(resolveCliPermissionRisk('read')).toBe('read')
      expect(resolveCliPermissionRisk('edit')).toBe('write')
      expect(resolveCliPermissionRisk('unknown', 'read')).toBe('read')
      expect(resolveCliPermissionRisk(undefined, undefined, 'Read')).toBe('read')
      expect(resolveCliPermissionRisk(undefined, undefined, 'Edit')).toBe('write')
      expect(resolveCliPermissionRisk(undefined, undefined, 'Bash')).toBe('execute')
      expect(resolveCliPermissionRisk(undefined, undefined, 'MysteryTool')).toBe('execute')
    })

    it('parses opt-in worktree metadata strictly', () => {
      expect(parseWorktreeRequestOptions(undefined)).toBeNull()
      expect(parseWorktreeRequestOptions(false)).toBeNull()
      expect(parseWorktreeRequestOptions({ enabled: false })).toBeNull()
      expect(parseWorktreeRequestOptions('true')).toBeNull()
      expect(parseWorktreeRequestOptions(true)).toEqual({ enabled: true })
      expect(
        parseWorktreeRequestOptions({
          enabled: true,
          baseRef: ' main ',
          branchPrefix: 'tuff/test',
          detached: true,
          cleanupOnComplete: false,
          forceCleanup: true,
          injected: 'ignored'
        })
      ).toEqual({
        enabled: true,
        baseRef: 'main',
        branchPrefix: 'tuff/test',
        detached: true,
        cleanupOnComplete: false,
        forceCleanup: true
      })
    })
  })
})
