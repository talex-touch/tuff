import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ANTIGRAVITY_CLI_PROFILE_ID,
  CLAUDE_CLI_PROFILE_ID,
  CODEX_CLI_PROFILE_ID,
  CURSOR_CLI_PROFILE_ID,
  GEMINI_CLI_PROFILE_ID,
  KIRO_CLI_PROFILE_ID,
  OMP_CLI_PROFILE_ID,
  OPENCODE_CLI_PROFILE_ID,
  resetAllCliExecutableCaches,
  resolveClaudeAcpExecutable,
  resolveCodexAcpExecutable,
  resolveCursorExecutable,
  resolveKiroExecutable
} from '../providers/pi-cli-runtime'
import {
  CLI_DRIVER_REGISTRY,
  cliCapabilityProviderForKind,
  cliDefaultModelLabel,
  cliDisplayNameForKind,
  cliProviderIdForKind,
  DEFAULT_GEMINI_ACP_ARGS,
  GEMINI_ACP_ARGS_ENV,
  parseWorktreeRequestOptions,
  resolveCliDriver,
  resolveCliPermissionRisk,
  resolveCliProfileKind,
  resolveGeminiAcpArgs
} from './driver-resolver'

describe('driver-resolver', () => {
  const savedEnv: Record<string, string | undefined> = {}
  const envKeys = [
    'TUFF_OMP_CLI_PATH',
    'TUFF_CODEX_CLI_PATH',
    'TUFF_CODEX_ACP_PATH',
    'TUFF_CLAUDE_CLI_PATH',
    'TUFF_CLAUDE_ACP_PATH',
    'TUFF_ANTIGRAVITY_CLI_PATH',
    'TUFF_OPENCODE_CLI_PATH',
    'TUFF_GEMINI_CLI_PATH',
    GEMINI_ACP_ARGS_ENV,
    'TUFF_KIRO_CLI_PATH',
    'TUFF_CURSOR_CLI_PATH',
    'HOME',
    'USERPROFILE',
    'FNM_DIR',
    'XDG_DATA_HOME',
    'PATH'
  ]
  let tempDir: string | null = null

  beforeEach(async () => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key]
    }
    tempDir = await mkdtemp(join(tmpdir(), 'tuff-driver-resolver-'))
    process.env.HOME = tempDir
    process.env.USERPROFILE = tempDir
    delete process.env.FNM_DIR
    delete process.env.XDG_DATA_HOME
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
    it('maps ONLY the eight registered external CLI scheduler profile IDs', () => {
      expect(resolveCliProfileKind(OMP_CLI_PROFILE_ID)).toBe('omp')
      expect(resolveCliProfileKind(CODEX_CLI_PROFILE_ID)).toBe('codex')
      expect(resolveCliProfileKind(CLAUDE_CLI_PROFILE_ID)).toBe('claude')
      expect(resolveCliProfileKind(ANTIGRAVITY_CLI_PROFILE_ID)).toBe('antigravity')
      expect(resolveCliProfileKind(OPENCODE_CLI_PROFILE_ID)).toBe('opencode')
      expect(resolveCliProfileKind(GEMINI_CLI_PROFILE_ID)).toBe('gemini')
      expect(resolveCliProfileKind(KIRO_CLI_PROFILE_ID)).toBe('kiro')
      expect(resolveCliProfileKind(CURSOR_CLI_PROFILE_ID)).toBe('cursor')
      expect(Object.keys(CLI_DRIVER_REGISTRY)).toHaveLength(8)
    })

    it('returns null for default-pi, unnamed runs, and arbitrary custom profiles', () => {
      expect(resolveCliProfileKind('default-pi')).toBeNull()
      expect(resolveCliProfileKind(undefined)).toBeNull()
      expect(resolveCliProfileKind('')).toBeNull()
      expect(resolveCliProfileKind('profile:cli:pi')).toBeNull()
      expect(resolveCliProfileKind('profile:cli:unknown')).toBeNull()
      expect(resolveCliProfileKind('custom-codex-model-profile')).toBeNull()
      expect(resolveCliProfileKind('custom-antigravity-profile')).toBeNull()
      expect(resolveCliProfileKind('custom-gemini-profile')).toBeNull()
      expect(resolveCliProfileKind('custom-cursor-profile')).toBeNull()
    })
  })

  describe('ACP adapter executable discovery and declarative driver selection', () => {
    it('resolves omp with explicit ["acp"] args', async () => {
      const ompBin = await createExecutable('omp')
      process.env.TUFF_OMP_CLI_PATH = ompBin
      resetAllCliExecutableCaches()

      await expect(resolveCliDriver('omp')).resolves.toEqual({
        kind: 'omp',
        protocol: 'acp',
        executablePath: ompBin,
        args: ['acp'],
        adapterName: 'omp'
      })
    })

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
        args: [],
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
        args: [],
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

    it('resolves antigravity (agy acp) and opencode (opencode acp) with per-driver args', async () => {
      const agyBin = await createExecutable('agy')
      const opencodeBin = await createExecutable('opencode')

      process.env.TUFF_ANTIGRAVITY_CLI_PATH = agyBin
      process.env.TUFF_OPENCODE_CLI_PATH = opencodeBin
      resetAllCliExecutableCaches()

      await expect(resolveCliDriver('antigravity')).resolves.toEqual({
        kind: 'antigravity',
        protocol: 'acp',
        executablePath: agyBin,
        args: ['acp'],
        adapterName: 'antigravity-acp'
      })
      await expect(resolveCliDriver('opencode')).resolves.toEqual({
        kind: 'opencode',
        protocol: 'acp',
        executablePath: opencodeBin,
        args: ['acp'],
        adapterName: 'opencode-acp'
      })
    })

    it('resolves gemini with default ["--experimental-acp"] and honours TUFF_GEMINI_ACP_ARGS override', async () => {
      const geminiBin = await createExecutable('gemini')
      process.env.TUFF_GEMINI_CLI_PATH = geminiBin
      delete process.env[GEMINI_ACP_ARGS_ENV]
      resetAllCliExecutableCaches()

      expect(resolveGeminiAcpArgs({})).toEqual(DEFAULT_GEMINI_ACP_ARGS)
      await expect(resolveCliDriver('gemini')).resolves.toEqual({
        kind: 'gemini',
        protocol: 'acp',
        executablePath: geminiBin,
        args: ['--experimental-acp'],
        adapterName: 'gemini-acp'
      })

      process.env[GEMINI_ACP_ARGS_ENV] = '  --acp   --debug '
      await expect(resolveCliDriver('gemini')).resolves.toEqual({
        kind: 'gemini',
        protocol: 'acp',
        executablePath: geminiBin,
        args: ['--acp', '--debug'],
        adapterName: 'gemini-acp'
      })
    })

    it('resolves kiro primary (kiro-cli) and fallback (kiro), and cursor primary (cursor-agent) and fallback (agent)', async () => {
      const kiroFallback = await createExecutable('kiro')
      const agentFallback = await createExecutable('agent')

      delete process.env.TUFF_KIRO_CLI_PATH
      delete process.env.TUFF_CURSOR_CLI_PATH
      process.env.PATH = tempDir!
      resetAllCliExecutableCaches()

      await expect(resolveKiroExecutable()).resolves.toBe(kiroFallback)
      await expect(resolveCliDriver('kiro')).resolves.toEqual({
        kind: 'kiro',
        protocol: 'acp',
        executablePath: kiroFallback,
        args: ['acp'],
        adapterName: 'kiro-acp'
      })

      await expect(resolveCursorExecutable()).resolves.toBe(agentFallback)
      await expect(resolveCliDriver('cursor')).resolves.toEqual({
        kind: 'cursor',
        protocol: 'acp',
        executablePath: agentFallback,
        args: ['acp'],
        adapterName: 'cursor-acp'
      })

      // Primary command names win when present alongside fallbacks
      const kiroPrimary = await createExecutable('kiro-cli')
      const cursorPrimary = await createExecutable('cursor-agent')
      resetAllCliExecutableCaches()

      await expect(resolveKiroExecutable()).resolves.toBe(kiroPrimary)
      await expect(resolveCursorExecutable()).resolves.toBe(cursorPrimary)
    })

    it('never falls back across CLIs when the requested CLI is missing', async () => {
      const ompBin = await createExecutable('omp')
      const codexBin = await createExecutable('codex')
      const claudeBin = await createExecutable('claude')
      const agyBin = await createExecutable('agy')
      const opencodeBin = await createExecutable('opencode')
      const geminiBin = await createExecutable('gemini')
      const kiroBin = await createExecutable('kiro-cli')
      const cursorBin = await createExecutable('cursor-agent')

      const resetAllPresent = () => {
        process.env.TUFF_OMP_CLI_PATH = ompBin
        process.env.TUFF_CODEX_ACP_PATH = join(tempDir!, 'missing-codex-acp')
        process.env.TUFF_CODEX_CLI_PATH = codexBin
        process.env.TUFF_CLAUDE_ACP_PATH = join(tempDir!, 'missing-claude-acp')
        process.env.TUFF_CLAUDE_CLI_PATH = claudeBin
        process.env.TUFF_ANTIGRAVITY_CLI_PATH = agyBin
        process.env.TUFF_OPENCODE_CLI_PATH = opencodeBin
        process.env.TUFF_GEMINI_CLI_PATH = geminiBin
        process.env.TUFF_KIRO_CLI_PATH = kiroBin
        process.env.TUFF_CURSOR_CLI_PATH = cursorBin
        resetAllCliExecutableCaches()
      }

      const cases: Array<{
        kind: keyof typeof CLI_DRIVER_REGISTRY
        envKey: string
        expectedCode: string
      }> = [
        { kind: 'omp', envKey: 'TUFF_OMP_CLI_PATH', expectedCode: 'OMP_CLI_NOT_FOUND' },
        { kind: 'codex', envKey: 'TUFF_CODEX_CLI_PATH', expectedCode: 'CODEX_CLI_NOT_FOUND' },
        { kind: 'claude', envKey: 'TUFF_CLAUDE_CLI_PATH', expectedCode: 'CLAUDE_CLI_NOT_FOUND' },
        {
          kind: 'antigravity',
          envKey: 'TUFF_ANTIGRAVITY_CLI_PATH',
          expectedCode: 'ANTIGRAVITY_CLI_NOT_FOUND'
        },
        {
          kind: 'opencode',
          envKey: 'TUFF_OPENCODE_CLI_PATH',
          expectedCode: 'OPENCODE_CLI_NOT_FOUND'
        },
        { kind: 'gemini', envKey: 'TUFF_GEMINI_CLI_PATH', expectedCode: 'GEMINI_CLI_NOT_FOUND' },
        { kind: 'kiro', envKey: 'TUFF_KIRO_CLI_PATH', expectedCode: 'KIRO_CLI_NOT_FOUND' },
        { kind: 'cursor', envKey: 'TUFF_CURSOR_CLI_PATH', expectedCode: 'CURSOR_CLI_NOT_FOUND' }
      ]

      for (const { kind, envKey, expectedCode } of cases) {
        resetAllPresent()
        process.env[envKey] = join(tempDir!, `missing-${kind}`)
        resetAllCliExecutableCaches()
        await expect(resolveCliDriver(kind)).rejects.toThrow(expectedCode)
      }
    })
  })

  describe('metadata helpers', () => {
    it('returns stable provider, capability, display, and model labels per CLI and protocol', () => {
      expect(cliProviderIdForKind('omp')).toBe('omp-cli')
      expect(cliProviderIdForKind('codex')).toBe('codex-cli')
      expect(cliProviderIdForKind('claude')).toBe('claude-cli')
      expect(cliProviderIdForKind('antigravity')).toBe('antigravity-cli')
      expect(cliProviderIdForKind('opencode')).toBe('opencode-cli')
      expect(cliProviderIdForKind('gemini')).toBe('gemini-cli')
      expect(cliProviderIdForKind('kiro')).toBe('kiro-cli')
      expect(cliProviderIdForKind('cursor')).toBe('cursor-cli')

      expect(cliCapabilityProviderForKind('omp')).toBe('tuff-omp-runtime')
      expect(cliCapabilityProviderForKind('codex')).toBe('tuff-codex-runtime')
      expect(cliCapabilityProviderForKind('claude')).toBe('tuff-claude-runtime')
      expect(cliCapabilityProviderForKind('antigravity')).toBe('tuff-antigravity-runtime')
      expect(cliCapabilityProviderForKind('opencode')).toBe('tuff-opencode-runtime')
      expect(cliCapabilityProviderForKind('gemini')).toBe('tuff-gemini-runtime')
      expect(cliCapabilityProviderForKind('kiro')).toBe('tuff-kiro-runtime')
      expect(cliCapabilityProviderForKind('cursor')).toBe('tuff-cursor-runtime')

      expect(cliDisplayNameForKind('antigravity')).toBe('Antigravity')
      expect(cliDisplayNameForKind('opencode')).toBe('OpenCode')
      expect(cliDisplayNameForKind('gemini')).toBe('Gemini CLI')
      expect(cliDisplayNameForKind('kiro')).toBe('Kiro')
      expect(cliDisplayNameForKind('cursor')).toBe('Cursor')

      expect(cliDefaultModelLabel('omp', 'acp')).toBe('omp-acp')
      expect(cliDefaultModelLabel('codex', 'acp')).toBe('codex-acp')
      expect(cliDefaultModelLabel('codex', 'codex-app-server')).toBe('codex-app-server')
      expect(cliDefaultModelLabel('claude', 'acp')).toBe('claude-acp')
      expect(cliDefaultModelLabel('claude', 'claude-stream-json')).toBe('claude-stream-json')
      expect(cliDefaultModelLabel('antigravity', 'acp')).toBe('antigravity-acp')
      expect(cliDefaultModelLabel('opencode', 'acp')).toBe('opencode-acp')
      expect(cliDefaultModelLabel('gemini', 'acp')).toBe('gemini-acp')
      expect(cliDefaultModelLabel('kiro', 'acp')).toBe('kiro-acp')
      expect(cliDefaultModelLabel('cursor', 'acp')).toBe('cursor-acp')
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
